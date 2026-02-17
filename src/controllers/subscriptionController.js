// subscriptionController.js

const { Client, Tier } = require("../models");

exports.purchasePlan = async (req, res) => {
  try {
    const { client_id } = req.user;
    const { tier_id } = req.body;

    const client = await Client.findByPk(client_id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const tier = await Tier.findByPk(tier_id);
    if (!tier) return res.status(404).json({ message: "Tier not found" });

    // Calculate expiry based on billing cycle
    const expiry = new Date();
    if (tier.billing_cycle === "monthly") {
      expiry.setMonth(expiry.getMonth() + 1);
    } else if (tier.billing_cycle === "yearly") {
      expiry.setFullYear(expiry.getFullYear() + 1);
    }

    client.tier_id = tier.tier_id;
    client.subscription_status = "active";
    client.subscription_expiry = expiry;

    await client.save();

    res.json({
      message: "Plan purchased successfully",
      tier: tier.name,
      expiry,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🔹 Upgrade Plan
exports.upgradePlan = async (req, res) => {
  try {
    const { client_id } = req.user;
    const { tier_name } = req.body;

    const client = await Client.findByPk(client_id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const tier = await Tier.findOne({ where: { name: tier_name } });
    if (!tier) return res.status(404).json({ message: "Tier not found" });

    client.tier_id = tier.tier_id;
    client.subscription_status = "active";

    // 30 days expiry (monthly)
    client.subscription_expiry = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    );

    await client.save();

    res.json({ message: "Plan upgraded successfully", client });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🔹 Check Expiry
exports.checkExpiry = async (req, res) => {
  try {
    const clients = await Client.findAll();

    for (const client of clients) {
      if (
        client.subscription_expiry &&
        new Date() > client.subscription_expiry
      ) {
        const freeTier = await Tier.findOne({
          where: { name: "Basic" },
        });

        client.tier_id = freeTier.tier_id;
        client.subscription_status = "expired";
        await client.save();
      }
    }

    res.json({ message: "Expiry check completed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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

exports.clientnPlanUpdate = async (req, res) => {
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
      client.subscription_expiry = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      );
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
