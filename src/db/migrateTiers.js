const { Client } = require("pg");

const pgClient = new Client({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "root",
  database: process.env.DB_NAME || "testconsoledb",
});

async function migrateTiers() {
  try {
    await pgClient.connect();
    console.log("Connected to PostgreSQL database.");

    const now = new Date();

    await pgClient.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    `);

    await pgClient.query(
      `
      INSERT INTO "Tiers"
      (tier_id, name, description, price, billing_cycle, storage_limit_bytes, max_devices, max_ads, is_active, created_at, updated_at)
      VALUES
      (gen_random_uuid(), 'Basic', 'Starter plan with 5GB storage', 99, 'monthly', 5368709120, 3, 5, true, $1, $1),
      (gen_random_uuid(), 'Advance', '10GB storage plan', 999, 'monthly', 10737418240, 5, 20, true, $1, $1),
      (gen_random_uuid(), 'Premium', '20GB advanced plan', 4999, 'monthly', 21474836480, 50, 200, true, $1, $1)
      ON CONFLICT (name) DO NOTHING
      `,
      [now],
    );

    console.log("🎉 Tiers migrated successfully.");
    await pgClient.end();
  } catch (err) {
    console.error("Error migrating tiers:", err.message);
  }
}

migrateTiers();
