const { sequelize } = require("../../models/index");
const { QueryTypes } = require("sequelize");

async function migrate() {
  const transaction = await sequelize.transaction();

  try {
    console.log("🚀 Starting EventLogs partition migration...");

    const tableCheck = await sequelize.query(
      `SELECT to_regclass('public."DeviceEventLogs"') as exists;`,
      { type: QueryTypes.SELECT, transaction },
    );

    if (!tableCheck[0].exists) {
      console.log("❌ EventLogs table not found.");
      process.exit();
    }

    console.log("📦 Renaming old table...");
    await sequelize.query(
      `ALTER TABLE "DeviceEventLogs" RENAME TO "EventLogsOld";`,
      { transaction },
    );

    console.log("🏗 Creating partitioned parent table...");

    await sequelize.query(
      `
      CREATE TABLE "DeviceEventLogs" (
        id UUID NOT NULL,
        device_id UUID NOT NULL,
        event_type TEXT,
        event_id UUID,
        payload JSONB,
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (id, timestamp)
      ) PARTITION BY RANGE (timestamp);
      `,
      { transaction },
    );

    console.log("📅 Detecting date range...");

    const dateRange = await sequelize.query(
      `
      SELECT 
        MIN(timestamp) as min_date,
        MAX(timestamp) as max_date
      FROM "EventLogsOld";
      `,
      { type: QueryTypes.SELECT, transaction },
    );

    const minDate = new Date(dateRange[0].min_date);
    const maxDate = new Date(dateRange[0].max_date);

    let current = new Date(
      Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1),
    );
    const end = new Date(
      Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), 1),
    );

    while (current <= end) {
      const year = current.getUTCFullYear();
      const month = String(current.getUTCMonth() + 1).padStart(2, "0");

      const nextMonth = new Date(Date.UTC(year, current.getUTCMonth() + 1, 1));

      const from = `${year}-${month}-01`;
      const to = `${nextMonth.getUTCFullYear()}-${String(
        nextMonth.getUTCMonth() + 1,
      ).padStart(2, "0")}-01`;

      const partitionName = `DeviceEventLogs_${year}_${month}`;

      console.log(`➡ Creating partition ${partitionName}`);

      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS ${partitionName}
        PARTITION OF "DeviceEventLogs"
        FOR VALUES FROM ('${from}') TO ('${to}');
        `,
        { transaction },
      );

      await sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_${partitionName}_device
        ON ${partitionName} (device_id, timestamp);
        `,
        { transaction },
      );

      current = nextMonth;
    }

    console.log("📤 Migrating old data...");

    console.log("📤 Migrating old data...");

    await sequelize.query(
      `
  INSERT INTO "DeviceEventLogs" (
    id,
    device_id,
    event_type,
    event_id,
    payload,
    timestamp,
    created_at,
    updated_at
  )
  SELECT
    id,
    device_id,
    event_type,
    event_id,
    payload,
    timestamp,
    created_at,
    updated_at
  FROM "EventLogsOld";
  `,
      { transaction },
    );

    console.log("🗑 Dropping old table...");
    await sequelize.query(`DROP TABLE "EventLogsOld";`, { transaction });

    await transaction.commit();

    console.log("✅ DeviceEventLogs migration completed!");
    process.exit();
  } catch (error) {
    await transaction.rollback();
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrate();
