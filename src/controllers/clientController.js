const { Op, fn, col } = require("sequelize");
const { Client, Ad, Schedule, Device, DeviceGroup } = require("../models");
const { getBucketURL } = require("./s3Controller");
const logger = require("../utils/logger");

module.exports.createClient = async (req, res) => {
  try {
    const { name, email, phoneNumber } = req.body;
    const client = await Client.create({
      name,
      email,
      phone_number: phoneNumber,
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
      }))
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
          model: Ad,
          attributes: [], // Do not fetch Ad records, only count them
        },
      ],
      attributes: {
        include: [[fn("COUNT", col("Ads.ad_id")), "adsCount"]],
      },
      group: ["Client.client_id"], // Group by client to get correct counts
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
