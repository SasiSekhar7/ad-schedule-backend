const { sequelize } = require("../../models/index");
const { QueryTypes } = require("sequelize");

async function migrate() {
  const transaction = await sequelize.transaction();

  try {
    console.log("🚀 Starting DeviceTelemetryLogs partition migration...");

    // Check table exists
    const tableCheck = await sequelize.query(
      `SELECT to_regclass('public."DeviceTelemetryLogs"') as exists;`,
      { type: QueryTypes.SELECT, transaction }
    );

    if (!tableCheck[0].exists) {
      console.log("❌ DeviceTelemetryLogs table not found.");
      process.exit();
    }

    // Rename old table
    console.log("📦 Renaming old table...");
    await sequelize.query(
      `ALTER TABLE "DeviceTelemetryLogs" RENAME TO "DeviceTelemetryLogsOld";`,
      { transaction }
    );

    // Create partitioned parent table
    console.log("🏗 Creating partitioned parent table...");

    await sequelize.query(
      `
      CREATE TABLE "DeviceTelemetryLogs" (
        id UUID NOT NULL,
        device_id UUID NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        cpu_usage FLOAT,
        ram_free_mb INTEGER,
        storage_free_mb INTEGER,
        network_type TEXT,
        app_version_code INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (id, timestamp)
      ) PARTITION BY RANGE (timestamp);
      `,
      { transaction }
    );

    // Detect date range
    console.log("📅 Detecting date range...");

    const dateRange = await sequelize.query(
      `
      SELECT 
        MIN(timestamp) as min_date,
        MAX(timestamp) as max_date
      FROM "DeviceTelemetryLogsOld";
      `,
      { type: QueryTypes.SELECT, transaction }
    );

    const minDate = new Date(dateRange[0].min_date);
    const maxDate = new Date(dateRange[0].max_date);

    let current = new Date(
      Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1)
    );
    const end = new Date(
      Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), 1)
    );

    // Create partitions
    while (current <= end) {
      const year = current.getUTCFullYear();
      const month = String(current.getUTCMonth() + 1).padStart(2, "0");

      const nextMonth = new Date(Date.UTC(year, current.getUTCMonth() + 1, 1));

      const from = `${year}-${month}-01`;
      const to = `${nextMonth.getUTCFullYear()}-${String(
        nextMonth.getUTCMonth() + 1
      ).padStart(2, "0")}-01`;

      const partitionName = `DeviceTelemetryLogs_${year}_${month}`;

      console.log(`➡ Creating partition ${partitionName}`);

      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "${partitionName}"
        PARTITION OF "DeviceTelemetryLogs"
        FOR VALUES FROM ('${from}') TO ('${to}');
        `,
        { transaction }
      );

      await sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS "idx_${partitionName}_device"
        ON "${partitionName}" (device_id, timestamp);
        `,
        { transaction }
      );

      current = nextMonth;
    }

    // Optional default partition (prevents insert failures)
    console.log("📦 Creating default partition...");
    await sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS "DeviceTelemetryLogs_default"
      PARTITION OF "DeviceTelemetryLogs" DEFAULT;
      `,
      { transaction }
    );

    // Migrate old data safely
    console.log("📤 Migrating old data...");

    await sequelize.query(
      `
      INSERT INTO "DeviceTelemetryLogs" (
        id,
        device_id,
        timestamp,
        cpu_usage,
        ram_free_mb,
        storage_free_mb,
        network_type,
        app_version_code,
        created_at,
        updated_at
      )
      SELECT
        id,
        device_id,
        timestamp,
        cpu_usage,
        ram_free_mb,
        storage_free_mb,
        network_type,
        app_version_code,
        created_at,
        updated_at
      FROM "DeviceTelemetryLogsOld"
      ORDER BY timestamp;
      `,
      { transaction }
    );

    // Drop old table
    console.log("🗑 Dropping old table...");
    await sequelize.query(
      `DROP TABLE "DeviceTelemetryLogsOld";`,
      { transaction }
    );

    await transaction.commit();

    console.log("✅ DeviceTelemetryLogs partition migration completed!");
    process.exit();

  } catch (error) {
    await transaction.rollback();
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrate();