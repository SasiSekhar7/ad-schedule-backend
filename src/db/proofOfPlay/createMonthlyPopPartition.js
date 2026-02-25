const { sequelize } = require("../../models/index");
const { QueryTypes } = require("sequelize");

async function createNextMonthPartition() {
  try {
    console.log("🚀 Checking / Creating next month partition...");

    const now = new Date();

    // Always create partition for NEXT month
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    const from = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

    const toMonth = nextMonth === 12 ? 1 : nextMonth + 1;
    const toYear = nextMonth === 12 ? nextYear + 1 : nextYear;

    const to = `${toYear}-${String(toMonth).padStart(2, "0")}-01`;

    const partitionName = `ProofOfPlayLogs_${nextYear}_${String(
      nextMonth
    ).padStart(2, "0")}`;

    console.log(`📦 Creating partition: ${partitionName}`);
    console.log(`Range: ${from} → ${to}`);

    // Create partition
    await sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS ${partitionName}
      PARTITION OF "ProofOfPlayLogs"
      FOR VALUES FROM ('${from}') TO ('${to}');
      `,
      { type: QueryTypes.RAW }
    );

    // Create index
    await sequelize.query(
      `
      CREATE INDEX IF NOT EXISTS idx_${partitionName}_device_date
      ON ${partitionName} (device_id, start_time);
      `,
      { type: QueryTypes.RAW }
    );

    console.log("✅ Partition ready.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating partition:", error);
    process.exit(1);
  }
}

createNextMonthPartition();