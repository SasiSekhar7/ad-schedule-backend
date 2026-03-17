const { sequelize } = require("../../models/index");
const { QueryTypes } = require("sequelize");

async function migrate() {
  const transaction = await sequelize.transaction();

  try {
    console.log("🚀 Starting ProofOfPlay partition migration...");

    // 1️⃣ Check if old table exists
    const tableCheck = await sequelize.query(
      `
      SELECT to_regclass('public."ProofOfPlayLogs"') as exists;
      `,
      { type: QueryTypes.SELECT, transaction }
    );

    if (!tableCheck[0].exists) {
      console.log("❌ ProofOfPlayLogs table not found.");
      process.exit();
    }

    // 2️⃣ Rename old table
    console.log("📦 Renaming old table...");
    await sequelize.query(
      `ALTER TABLE "ProofOfPlayLogs" RENAME TO "ProofOfPlayLogsOld";`,
      { transaction }
    );

    // 3️⃣ Create partitioned parent table
    console.log("🏗 Creating partitioned parent table...");

    await sequelize.query(
      `
      CREATE TABLE "ProofOfPlayLogs" (
        id UUID NOT NULL,
        start_time TIMESTAMP NOT NULL,
        event_id UUID NOT NULL,
        device_id UUID NOT NULL,
        ad_id UUID NOT NULL,
        schedule_id UUID,
        end_time TIMESTAMP NOT NULL,
        duration_played_ms INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, start_time)
      ) PARTITION BY RANGE (start_time);
      `,
      { transaction }
    );

    // 4️⃣ Detect date range from old data
    console.log("📅 Detecting date range...");

    const dateRange = await sequelize.query(
      `
      SELECT 
        MIN(start_time) as min_date,
        MAX(start_time) as max_date
      FROM "ProofOfPlayLogsOld";
      `,
      { type: QueryTypes.SELECT, transaction }
    );

    const minDate = new Date(dateRange[0].min_date);
    const maxDate = new Date(dateRange[0].max_date);

    if (!minDate || !maxDate) {
      throw new Error("No data found in old table.");
    }

    // 5️⃣ Create monthly partitions dynamically
    console.log("📂 Creating partitions...");

    let current = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1));
    const end = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), 1));

    while (current <= end) {
      const year = current.getUTCFullYear();
      const month = String(current.getUTCMonth() + 1).padStart(2, "0");

      const nextMonthDate = new Date(Date.UTC(year, current.getUTCMonth() + 1, 1));

      const from = `${year}-${month}-01`;
      const to = `${nextMonthDate.getUTCFullYear()}-${String(
        nextMonthDate.getUTCMonth() + 1
      ).padStart(2, "0")}-01`;

      const partitionName = `ProofOfPlayLogs_${year}_${month}`;

      console.log(`➡ Creating partition ${partitionName}`);

      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS ${partitionName}
        PARTITION OF "ProofOfPlayLogs"
        FOR VALUES FROM ('${from}') TO ('${to}');
        `,
        { transaction }
      );

      await sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_${partitionName}_device_date
        ON ${partitionName} (device_id, start_time);
        `,
        { transaction }
      );

      current = nextMonthDate;
    }

    // 6️⃣ Migrate data
    console.log("📤 Migrating old data...");

    await sequelize.query(
      `
      INSERT INTO "ProofOfPlayLogs" (
        id,
        start_time,
        event_id,
        device_id,
        ad_id,
        schedule_id,
        end_time,
        duration_played_ms,
        created_at,
        updated_at
      )
      SELECT
        id,
        start_time,
        event_id,
        device_id,
        ad_id,
        schedule_id,
        end_time,
        duration_played_ms,
        created_at,
        updated_at
      FROM "ProofOfPlayLogsOld";
      `,
      { transaction }
    );

    // 7️⃣ Drop old table
    console.log("🗑 Dropping old table...");
    await sequelize.query(`DROP TABLE "ProofOfPlayLogsOld";`, {
      transaction,
    });

    await transaction.commit();

    console.log("✅ Migration completed successfully!");
    process.exit();
  } catch (error) {
    await transaction.rollback();
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrate();