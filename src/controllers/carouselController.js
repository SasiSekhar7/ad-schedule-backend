const { Carousel, CarouselItem, Ad, Client, sequelize } = require("../models");
const logger = require("../utils/logger");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

// Lambda client for triggering media conversion
const lambda = new LambdaClient({ region: process.env.AWS_REGION || "ap-south-1" });
const lambdaName = process.env.MEDIA_CONVERTER_LAMBDA_NAME;

/**
 * Create a new carousel with items
 *
 * Request body:
 * - name: Carousel name (required)
 * - items: Array of items (required) - each item can be:
 *   Option 1 - Select existing ad:
 *     { ad_id: "uuid", display_order: 1 }
 *   Option 2 - Upload new ad:
 *     { name: "Ad Name", duration: 10, file_url: "s3://...", display_order: 1, isMultipartUpload: true/false }
 */
module.exports.createCarousel = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { name, items } = req.body;
    const client_id = req.user?.client_id;

    if (!client_id) {
      await transaction.rollback();
      return res.status(400).json({ error: "Client ID is required" });
    }

    if (!name) {
      await transaction.rollback();
      return res.status(400).json({ error: "Carousel name is required" });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: "At least one carousel item (ad) is required" });
    }

    // Create carousel
    const carousel = await Carousel.create({
      client_id,
      name,
      status: "active",
      total_duration: 0,
    }, { transaction });

    // Create carousel items and calculate total duration
    let totalDuration = 0;
    const carouselItems = [];
    const createdAds = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let ad;

      // Option 1: Use existing ad (ad_id provided)
      if (item.ad_id) {
        ad = await Ad.findOne({ where: { ad_id: item.ad_id, isDeleted: false } });
        if (!ad) {
          await transaction.rollback();
          return res.status(400).json({ error: `Ad with ID ${item.ad_id} not found` });
        }
      }
      // Option 2: Create new ad (name, duration, file_url provided)
      else if (item.name && item.duration && item.file_url) {
        // Validate new ad fields
        if (!item.name || typeof item.name !== "string" || item.name.trim() === "") {
          await transaction.rollback();
          return res.status(400).json({ error: `Valid name is required for new ad at position ${i + 1}` });
        }

        if (!item.duration || isNaN(item.duration) || Number(item.duration) <= 0) {
          await transaction.rollback();
          return res.status(400).json({ error: `Valid duration is required for new ad at position ${i + 1}` });
        }

        if (!item.file_url || item.file_url === "") {
          await transaction.rollback();
          return res.status(400).json({ error: `File URL is required for new ad at position ${i + 1}` });
        }

        // Create new ad
        ad = await Ad.create({
          client_id,
          name: item.name,
          url: item.file_url,
          duration: Number(item.duration),
          status: "processing",
        }, { transaction });

        createdAds.push(ad);

        // Trigger Lambda for media conversion (non-blocking)
        try {
          const payload = {
            s3Key: item.file_url,
            ad_id: ad.ad_id,
            timestamp: new Date().toISOString(),
          };

          const invokeCommand = new InvokeCommand({
            FunctionName: lambdaName,
            InvocationType: "Event",
            Payload: Buffer.from(JSON.stringify(payload)),
          });

          await lambda.send(invokeCommand);
        } catch (lambdaError) {
          logger.logError("Error triggering Lambda for new carousel ad", lambdaError, { ad_id: ad.ad_id });
          // Don't fail the request, ad can be reprocessed later
        }
      } else {
        await transaction.rollback();
        return res.status(400).json({
          error: `Item at position ${i + 1} must have either ad_id (existing) or name, duration, file_url (new ad)`
        });
      }

      totalDuration += Number(ad.duration);

      const carouselItem = await CarouselItem.create({
        carousel_id: carousel.carousel_id,
        ad_id: ad.ad_id,
        display_order: item.display_order || i + 1,
      }, { transaction });

      carouselItems.push(carouselItem);
    }

    // Update total duration
    await carousel.update({ total_duration: totalDuration }, { transaction });

    await transaction.commit();

    logger.logInfo("Carousel created", {
      carousel_id: carousel.carousel_id,
      items_count: carouselItems.length,
      new_ads_created: createdAds.length
    });
    return res.status(201).json({
      message: "Carousel created successfully",
      data: {
        ...carousel.dataValues,
        items: carouselItems,
        new_ads_created: createdAds.map(a => ({ ad_id: a.ad_id, name: a.name }))
      },
    });
  } catch (error) {
    await transaction.rollback();
    logger.logError("Error creating carousel", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get all carousels for a client
module.exports.getAllCarousels = async (req, res) => {
  try {
    const client_id = req.user?.client_id;
    const role = req.user?.role;

    let whereClause = { isDeleted: false };
    if (role !== "Admin") {
      whereClause.client_id = client_id;
    }

    const carousels = await Carousel.findAll({
      where: whereClause,
      include: [
        { model: Client, attributes: ["name"] },
        {
          model: CarouselItem,
          as: "items",
          include: [{ model: Ad, attributes: ["ad_id", "name", "url", "duration"] }],
          order: [["display_order", "ASC"]],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    return res.json({ data: carousels });
  } catch (error) {
    logger.logError("Error fetching carousels", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get single carousel by ID
module.exports.getCarouselById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Carousel ID is required" });
    }

    const carousel = await Carousel.findOne({
      where: { carousel_id: id, isDeleted: false },
      include: [
        { model: Client, attributes: ["name"] },
        {
          model: CarouselItem,
          as: "items",
          include: [{ model: Ad, attributes: ["ad_id", "name", "url", "duration", "status"] }],
          order: [["display_order", "ASC"]],
        },
      ],
    });

    if (!carousel) {
      return res.status(404).json({ error: "Carousel not found" });
    }

    return res.json({ data: carousel });
  } catch (error) {
    logger.logError("Error fetching carousel", error, { carousel_id: req.params.id });
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Update carousel and its items
 *
 * Items can be:
 *   Option 1 - Existing ad: { ad_id: "uuid", display_order: 1 }
 *   Option 2 - New ad: { name: "Ad Name", duration: 10, file_url: "s3://...", display_order: 1 }
 */
module.exports.updateCarousel = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { name, items, status } = req.body;
    const client_id = req.user?.client_id;

    if (!id) {
      await transaction.rollback();
      return res.status(400).json({ error: "Carousel ID is required" });
    }

    const carousel = await Carousel.findOne({
      where: { carousel_id: id, isDeleted: false },
    });

    if (!carousel) {
      await transaction.rollback();
      return res.status(404).json({ error: "Carousel not found" });
    }

    // Update carousel name and status
    await carousel.update({
      name: name || carousel.name,
      status: status || carousel.status,
    }, { transaction });

    // If items are provided, update them
    if (items && Array.isArray(items)) {
      // Delete existing items
      await CarouselItem.destroy({
        where: { carousel_id: id },
        transaction,
      });

      // Create new items
      let totalDuration = 0;
      const createdAds = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let ad;

        // Option 1: Use existing ad
        if (item.ad_id) {
          ad = await Ad.findOne({ where: { ad_id: item.ad_id, isDeleted: false } });
          if (!ad) {
            await transaction.rollback();
            return res.status(400).json({ error: `Ad with ID ${item.ad_id} not found` });
          }
        }
        // Option 2: Create new ad
        else if (item.name && item.duration && item.file_url) {
          ad = await Ad.create({
            client_id: client_id || carousel.client_id,
            name: item.name,
            url: item.file_url,
            duration: Number(item.duration),
            status: "processing",
          }, { transaction });

          createdAds.push(ad);

          // Trigger Lambda for media conversion
          try {
            const payload = {
              s3Key: item.file_url,
              ad_id: ad.ad_id,
              timestamp: new Date().toISOString(),
            };

            const invokeCommand = new InvokeCommand({
              FunctionName: lambdaName,
              InvocationType: "Event",
              Payload: Buffer.from(JSON.stringify(payload)),
            });

            await lambda.send(invokeCommand);
          } catch (lambdaError) {
            logger.logError("Error triggering Lambda for carousel ad update", lambdaError, { ad_id: ad.ad_id });
          }
        } else {
          await transaction.rollback();
          return res.status(400).json({
            error: `Item at position ${i + 1} must have either ad_id or name, duration, file_url`
          });
        }

        totalDuration += Number(ad.duration);

        await CarouselItem.create({
          carousel_id: id,
          ad_id: ad.ad_id,
          display_order: item.display_order || i + 1,
        }, { transaction });
      }

      await carousel.update({ total_duration: totalDuration }, { transaction });
    }

    await transaction.commit();

    logger.logInfo("Carousel updated", { carousel_id: id });
    return res.json({ message: "Carousel updated successfully" });
  } catch (error) {
    await transaction.rollback();
    logger.logError("Error updating carousel", error, { carousel_id: req.params.id });
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Delete (soft delete) carousel
module.exports.deleteCarousel = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Carousel ID is required" });
    }

    const carousel = await Carousel.findOne({
      where: { carousel_id: id, isDeleted: false },
    });

    if (!carousel) {
      return res.status(404).json({ error: "Carousel not found" });
    }

    await carousel.update({ isDeleted: true });

    logger.logInfo("Carousel deleted", { carousel_id: id });
    return res.json({ message: "Carousel deleted successfully" });
  } catch (error) {
    logger.logError("Error deleting carousel", error, { carousel_id: req.params.id });
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

