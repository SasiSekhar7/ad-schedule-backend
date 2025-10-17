const { sequelize } = require("../models");
const { QueryTypes } = require("sequelize");

const fixScheduleColumns = async () => {
  try {
    await sequelize.query(
      `ALTER TABLE "Schedules" RENAME COLUMN "ad_id" TO "content_id";`
    );
    await sequelize.query(`
      ALTER TABLE "Schedules"
      ADD COLUMN IF NOT EXISTS "content_type" VARCHAR(50) DEFAULT 'ad' NOT NULL;
    `);
    console.log("✅ Columns fixed successfully.");
  } catch (err) {
    console.error("❌ Failed to fix columns:", err.message);
  } finally {
    await sequelize.close();
  }
};

fixScheduleColumns();
