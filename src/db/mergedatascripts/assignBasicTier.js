require("dotenv").config();

const sequelize = require("../../db/index");
const db = require("../../models"); // adjust path if needed
const { getSubscriptionExpiry } = require("../../utils/subscriptionHelper");
const { Client, Tier } = db;

async function assignBasicToExistingClients() {
  try {
    console.log("!!!Script started....");

    console.log(`${sequelize.config.database} database connected successfully`);

    await sequelize.authenticate();

    // Find Basic tier
    const basicTier = await Tier.findOne({
      where: { name: "Basic" },
    });

    if (!basicTier) {
      console.log("Basic tier not found");
      process.exit(1);
    }

    const consoleClients = await Client.findAll();

    console.log(
      `Found ${consoleClients.length} client tier_id ${consoleClients[0].tier_id} clients`,
    );

    //Find clients without tier
    const clients = await Client.findAll({
      where: { tier_id: null },
    });

    console.log(`Found ${clients.length} clients`);

    // Update each client
    for (const client of clients) {
      // Subscription starts from today for old clients
      const expiry = getSubscriptionExpiry();

      client.tier_id = basicTier.tier_id;
      client.subscription_status = "active";
      client.subscription_expiry = expiry;

      await client.save();
    }

    console.log(`${clients.length} clients updated to Basic`);
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

assignBasicToExistingClients();
