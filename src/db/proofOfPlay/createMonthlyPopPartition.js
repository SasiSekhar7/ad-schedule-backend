// const { sequelize } = require("../../models/index");
// const { QueryTypes } = require("sequelize");

// async function createNextMonthPartition() {
//   try {
//     console.log("🚀 Checking / Creating next month partition...");

//     const now = new Date();

//     // Always create partition for NEXT month
//     const year = now.getUTCFullYear();
//     const month = now.getUTCMonth() + 1;

//     const nextMonth = month === 12 ? 1 : month + 1;
//     const nextYear = month === 12 ? year + 1 : year;

//     const from = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

//     const toMonth = nextMonth === 12 ? 1 : nextMonth + 1;
//     const toYear = nextMonth === 12 ? nextYear + 1 : nextYear;

//     const to = `${toYear}-${String(toMonth).padStart(2, "0")}-01`;

//     const partitionName = `ProofOfPlayLogs_${nextYear}_${String(
//       nextMonth
//     ).padStart(2, "0")}`;

//     console.log(`📦 Creating partition: ${partitionName}`);
//     console.log(`Range: ${from} → ${to}`);

//     // Create partition
//     await sequelize.query(
//       `
//       CREATE TABLE IF NOT EXISTS ${partitionName}
//       PARTITION OF "ProofOfPlayLogs"
//       FOR VALUES FROM ('${from}') TO ('${to}');
//       `,
//       { type: QueryTypes.RAW }
//     );

//     // Create index
//     await sequelize.query(
//       `
//       CREATE INDEX IF NOT EXISTS idx_${partitionName}_device_date
//       ON ${partitionName} (device_id, start_time);
//       `,
//       { type: QueryTypes.RAW }
//     );

//     console.log("✅ Partition ready.");
//     process.exit(0);
//   } catch (error) {
//     console.error("❌ Error creating partition:", error);
//     process.exit(1);
//   }
// }

// module.exports = {createNextMonthPartition };






const { sequelize } = require("../../models/index");
const { QueryTypes } = require("sequelize");

function getNextMonthRange() {
  const now = new Date();

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));

  const format = (d) => d.toISOString().slice(0, 10);

  return {
    from: format(start),
    to: format(end),
    year: start.getUTCFullYear(),
    month: String(start.getUTCMonth() + 1).padStart(2, "0"),
  };
}

async function createPartition(table, column, indexes = []) {
  const { from, to, year, month } = getNextMonthRange();

  const partitionName = `${table}_${year}_${month}`;

  console.log(`Creating partition ${partitionName}`);

  await sequelize.query(
    `
    CREATE TABLE IF NOT EXISTS "${partitionName}"
    PARTITION OF "${table}"
    FOR VALUES FROM ('${from}') TO ('${to}');
  `,
    { type: QueryTypes.RAW }
  );

  for (const idx of indexes) {
    const indexName = `idx_${partitionName}_${idx.join("_")}`;

    await sequelize.query(
      `
      CREATE INDEX IF NOT EXISTS "${indexName}"
      ON "${partitionName}" (${idx.join(", ")});
    `,
      { type: QueryTypes.RAW }
    );
  }

  console.log(`Partition ready: ${partitionName}`);
}

async function createNextMonthPartition() {
  try {
    console.log("Starting partition creation...");

    await createPartition("ProofOfPlayLogs", "start_time", [
      ["event_id", "start_time"],
      ["device_id", "start_time"],
      ["ad_id", "start_time"],
    ]);

    await createPartition("DeviceTelemetryLogs", "timestamp", [
      ["device_id", "timestamp"],
    ]);

    await createPartition("DeviceEventLogs", "timestamp", [
      ["device_id", "timestamp"],
      ["event_type"],
    ]);

    console.log("All partitions created successfully");
    process.exit(0);
  } catch (err) {
    console.error("Partition creation failed", err);
    process.exit(1);
  }
}

module.exports = {createNextMonthPartition };
// createNextMonthPartition();