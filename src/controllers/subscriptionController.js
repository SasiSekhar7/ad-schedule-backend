// subscriptionController.js

const { Client, Tier } = require("../models");

// 🔹 Get User Subscription Info
exports.getUserSubscription = async (req, res) => {
  try {
    const { client_id } = req.user;

    const client = await Client.findByPk(client_id, {
      include: Tier,
    });

    if (!client) return res.status(404).json({ message: "Client not found" });

    res.json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUserSubscription2 = async (req, res) => {
  try {
    const { clientid } = req.query;

    let client_id;

    if (clientid) {
      client_id = clientid;
    } else {
      client_id = req.user?.client_id; // ✅ correct assignment
    }

    if (!client_id) {
      return res.status(400).json({ message: "client_id is required" });
    }

    const client = await Client.findOne({
      where: { client_id },
      include: [
        {
          model: Tier,
        },
      ],
    });

    if (!client) {
      return res.status(404).json({ message: "client not found" });
    }

    res.json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.incrementUsedStorage = async (req, res) => {
  try {
    const { fileSizeBytes } = req.body;

    const client_id = req.query.client_id || req.user?.client_id;

    if (!client_id) {
      return res
        .status(400)
        .json({ error: "client_id is required", message: `${req.user}` });
    }

    if (!fileSizeBytes) {
      return res.status(400).json({ error: "fileSizeBytes is required" });
    }

    const client = await Client.findOne({
      where: { client_id },
      include: Tier,
    });

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    if (!client.Tier) {
      return res.status(400).json({ error: "No active tier found" });
    }

    if (
      client.subscription_status !== "active" ||
      (client.subscription_expiry &&
        new Date(client.subscription_expiry) < new Date())
    ) {
      return res.status(403).json({ error: "Subscription expired" });
    }

    const storageLimit = BigInt(client.Tier.storage_limit_bytes);
    const currentUsed = BigInt(client.used_storage_bytes || 0);
    const newFileSize = BigInt(fileSizeBytes);

    const totalAfterUpload = currentUsed + newFileSize;

    if (totalAfterUpload > storageLimit) {
      return res.status(400).json({ error: "Storage limit exceeded" });
    }

    client.used_storage_bytes = totalAfterUpload.toString();
    await client.save();

    return res.status(200).json({
      success: true,
      used_storage_bytes: client.used_storage_bytes,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
};

exports.assignBasicToExistingClients = async (req, res) => {
  try {
    // 1️ Find Basic tier
    const basicTier = await Tier.findOne({
      where: { name: "Basic" },
    });

    if (!basicTier) {
      return res.status(404).json({
        message: "Basic tier not found",
      });
    }

    // 2️ Find clients without tier
    const clients = await Client.findAll({
      where: {
        tier_id: null,
      },
    });

    // 3️ Update each client
    for (const client of clients) {
      client.tier_id = basicTier.tier_id;
      client.subscription_status = "active";

      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      client.subscription_expiry = expiry;

      await client.save();
    }

    return res.status(200).json({
      message: `${clients.length} clients updated to Basic plan`,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
