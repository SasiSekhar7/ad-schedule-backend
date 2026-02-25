const { sequelize, Client, Tier } = require("../models");

/**
 * Check subscription expiry for all clients
 *
 * Logic:
 * 1. Find Basic tier (fallback tier when expired)
 * 2. Find clients whose subscription_expiry is past
 * 3. Move them to Basic tier
 * 4. Mark subscription_status = expired
 */
async function checkClientExpiry() {
  // Find Basic tier once (avoid DB call inside loop)
  const basicTier = await Tier.findOne({
    where: { name: "Basic" },
  });

  if (!basicTier) {
    throw new Error("Basic tier not found");
  }

  // Find expired clients (DB level filter → very important)
  const expiredClients = await Client.findAll({
    where: {
      subscription_expiry: {
        [sequelize.Op.lt]: new Date(), // expiry < now
      },
      subscription_status: "active",
    },
  });

  if (!expiredClients.length) return;

  // Update expired clients
  for (const client of expiredClients) {
    client.tier_id = basicTier.tier_id; // move to Basic tier
    client.subscription_status = "expired"; // mark expired

    await client.save();
  }
}

module.exports = {
  checkClientExpiry,
};
