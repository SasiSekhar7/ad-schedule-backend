const { Op, fn, col } = require("sequelize");
const {
  Client,
  Ad,
  Schedule,
  Device,
  DeviceGroup,
  Tier,
} = require("../models");
const { getBucketURL } = require("./s3Controller");
const logger = require("../utils/logger");
const { getSubscriptionExpiry } = require("../utils/subscriptionHelper");

module.exports.createClient = async (req, res) => {
  try {
    const { name, email, phoneNumber } = req.body;
    const basicTier = await Tier.findOne({
      where: { name: "Basic" },
    });

    if (!basicTier) {
      return res.status(404).json({
        message: "Basic tier not found",
      });
    }

    const expiry = getSubscriptionExpiry();

    // const client = await Client.create({
    //   name,
    //   email,
    //   phone_number: phoneNumber,
    // });

    const client = await Client.create({
      name,
      email,
      phone_number: phoneNumber,
      tier_id: basicTier?.tier_id || null,
      subscription_status: "active",
      subscription_expiry: expiry,
    });

    return res.status(200).json({
      message: "Client Created Successfully ",
      client_id: client.client_id,
    });
  } catch (error) {
    logger.logError("Error creating client", error, { name, email });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports.getAllAds = async (req, res) => {
  try {
    const whereClause =
      req.user && req.user.role === "Client" && req.user.client_id
        ? { client_id: req.user.client_id }
        : {}; // Empty where clause for Admin to fetch all
    whereClause.isDeleted = false; // Ensure we only fetch non-deleted ads

    const ads = await Ad.findAll({
      where: whereClause,
      include: { model: Client, attributes: ["name"] },
      raw: true,
      nest: true,
    });

    // Flatten the Client name field and get the bucket URL
    const flattenedAds = await Promise.all(
      ads.map(async (ad) => ({
        ...ad,
        url: await getBucketURL(ad.url),
        client_name: ad.Client?.name || null, // Extracts 'name' from 'Client'
      })),
    );

    return res.status(200).json({ ads: flattenedAds });
  } catch (error) {
    logger.logError("Error fetching ads", error, {
      client_id: req.user?.client_id,
    });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
module.exports.getAllClients = async (req, res) => {
  try {
    const clients = await Client.findAll({
      include: [
        {
          model: Tier, // ✅ All Tier attributes automatically included
        },
        {
          model: Ad,
          attributes: [], // Do not fetch Ad records, only count them
        },
      ],
      attributes: {
        include: [[fn("COUNT", col("Ads.ad_id")), "adsCount"]],
      },
      group: ["Client.client_id", "Tier.tier_id"], // Group by client to get correct counts
    });

    return res.status(200).json({ clients });
  } catch (error) {
    logger.logError("Error fetching all clients", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports.updateClient = async (req, res) => {
  try {
    if (!req.params || !req.body) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const client = await Client.update(req.body, {
      where: { client_id: req.params.id },
    });

    return res.status(200).json({
      message: "Client Updated Successfully ",
      client_id: client.client_id,
    });
  } catch (error) {
    logger.logError("Error updating client", error, {
      client_id: req.params.id,
    });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports.updateClientNew = async (req, res) => {
  try {
    const { client_id } = req.params;
    const { name, email, phoneNumber, tier_name } = req.body;

    const client = await Client.findByPk(client_id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // Update basic details
    if (name) client.name = name;
    if (email) client.email = email;
    if (phoneNumber) client.phone_number = phoneNumber;

    // If tier change requested
    if (tier_name) {
      const tier = await Tier.findOne({ where: { name: tier_name } });
      if (!tier) {
        return res.status(404).json({ message: "Tier not found" });
      }

      client.tier_id = tier.tier_id;
      client.subscription_status = "active";

      // Decide base date for subscription extension
      // If subscription is still active → extend from current expiry (remaining time safe)
      // If subscription already expired → start from today

      const base =
        client.subscription_expiry && client.subscription_expiry > new Date()
          ? client.subscription_expiry // active → extend from existing expiry
          : new Date(); // expired → start from now

      // Calculate new expiry (1 year from base date)
      client.subscription_expiry = getSubscriptionExpiry({ baseDate: base });
    }

    await client.save();

    return res.status(200).json({
      message: "Client updated successfully",
      client,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports.deleteClient = async (req, res) => {
  try {
    if (!req.params) {
      return res.status(400).json({ error: "Missing required parameters" });
    }
    const client = await Client.destroy({
      where: {
        client_id: req.params.id,
      },
    });

    return res.status(200).json({
      message: "Client Deleted Successfully ",
      client_id: client.client_id,
    });
  } catch (error) {
    logger.logError("Error deleting client", error, {
      client_id: req.params.id,
    });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports.getAllDetails = async (req, res) => {
  try {
    const whereClause =
      req.user && req.user.role === "Client" && req.user.client_id
        ? { client_id: req.user.client_id }
        : {};

    const devicesCount = await Device.count({
      include: [
        {
          model: DeviceGroup,
          where: whereClause,
          attributes: [],
        },
      ],
    });

    const deviceGroupsCount = await DeviceGroup.count({ where: whereClause });

    const adsCount = await Ad.count({ where: whereClause });
    const schedulesCount = await Schedule.count({
      include: [
        {
          model: DeviceGroup,
          where: whereClause,
          attributes: [],
        },
      ],
    });

    let clientsCount = 0;
    if (req.user.role === "Admin") {
      clientsCount = await Client.count();
    }

    const response = {
      devices: devicesCount,
      deviceGroups: deviceGroupsCount,
      ads: adsCount,
      clients: clientsCount,
      schedules: schedulesCount,
    };

    return res.status(200).json({
      message: "Dashboard data fetched successfully",
      data: response,
    });
  } catch (error) {
    logger.logError("Error fetching dashboard data", error, {
      client_id: req.user?.client_id,
    });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
