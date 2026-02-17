const sqlite3 = require("sqlite3").verbose();
const { Client } = require("pg");
const path = require("path");

const sqliteDb = new sqlite3.Database(
  path.resolve(__dirname, "backend_service.db"),
);
const pgClient = new Client({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  // user: process.env.DB_USER || "adupuser",
  // password: process.env.DB_PASSWORD || "Birla@1122",
  // database: process.env.DB_NAME || "testdb",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "root",
  database: process.env.DB_NAME || "testconsoledb",
  logging: false, // optional
});
async function migrateTable(tableName, columns) {
  try {
    // 1. Fetch actual column names from the target PostgreSQL table
    const res = await pgClient.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [tableName.toLowerCase()],
    );
    const pgColumns = res.rows.map((row) => row.column_name);

    // 2. Add timestamps if the column exists
    const finalColumns = [...columns];

    const now = new Date().toISOString();
    if (pgColumns.includes("created_at")) finalColumns.push("created_at");
    if (pgColumns.includes("updated_at")) finalColumns.push("updated_at");
    if (pgColumns.includes("createdAt")) finalColumns.push("createdAt");
    if (pgColumns.includes("updatedAt")) finalColumns.push("updatedAt");

    return new Promise((resolve, reject) => {
      sqliteDb.all(`SELECT * FROM ${tableName}`, async (err, rows) => {
        if (err) return reject(err);

        for (const row of rows) {
          if (pgColumns.includes("created_at"))
            row.created_at = row.created_at || now;
          if (pgColumns.includes("updated_at"))
            row.updated_at = row.updated_at || now;
          if (pgColumns.includes("createdAt"))
            row.createdAt = row.createdAt || now;
          if (pgColumns.includes("updatedAt"))
            row.updatedAt = row.updatedAt || now;

          const values = finalColumns.map((col) => row[col]);
          const placeholders = finalColumns
            .map((_, i) => `$${i + 1}`)
            .join(", ");
          const query = `INSERT INTO "${tableName}" (${finalColumns.join(
            ", ",
          )}) VALUES (${placeholders})`;

          try {
            await pgClient.query(query, values);
            console.log(`✅ Inserted row into ${tableName}`);
          } catch (err) {
            console.error(`❌ Error inserting into ${tableName}:`, err.message);
          }
        }

        resolve();
      });
    });
  } catch (err) {
    console.error(`❌ Failed to migrate ${tableName}:`, err.message);
  }
}

(async () => {
  try {
    await pgClient.connect();
    console.log("Connected to PostgreSQL ✅");

    // 🔁 Repeat this for each table (define table name and column list manually)
    await migrateTable("Clients", [
      "client_id",
      "name",
      "email",
      "phone_number",
      "created_at",
      "updated_at",
    ]);
    await migrateTable("DeviceGroups", [
      "group_id",
      "client_id",
      "reg_code",
      "name",
      "last_pushed",
      "created_at",
      "updated_at",
    ]);
    await migrateTable("Devices", [
      "device_id",
      "group_id",
      "android_id",
      "location",
      "status",
      "last_synced",
      "created_at",
      "updated_at",
    ]);
    await migrateTable("Ads", [
      "ad_id",
      "client_id",
      "name",
      "url",
      "duration",
      "created_at",
      "updated_at",
    ]);
    await migrateTable("Schedules", [
      "schedule_id",
      "ad_id",
      "group_id",
      "start_time",
      "end_time",
      "total_duration",
      "priority",
      "created_at",
      "updated_at",
    ]);
    await migrateTable("AdPlaybacks", [
      "schedule_id",
      "ad_id",
      "device_id",
      "played_at",
      "duration_played",
      "sync_time",
    ]);
    await migrateTable("Users", [
      "user_id",
      "client_id",
      "name",
      "email",
      "phone_number",
      "password",
      "role",
      "created_at",
      "updated_at",
    ]);
    await migrateTable("ScrollTexts", [
      "scrolltext_id",
      "group_id",
      "message",
      "created_at",
      "updated_at",
    ]);
    await migrateTable("SiteUsers", [
      "id",
      "name",
      "email",
      "phone_number",
      "is_verified",
      "created_at",
      "updated_at",
      "last_login",
      "ip_address",
      "user_agent",
    ]);
    await migrateTable("Campaigns", [
      "campaign_id",
      "client_id",
      "name",
      "description",
      "requires_phone",
      "requires_questions",
      "created_at",
      "updated_at",
    ]);
    await migrateTable("Coupons", [
      "coupon_id",
      "campaign_id",
      "coupon_code",
      "description",
      "expiry_date",
      "is_active",
      "created_at",
      "updated_at",
    ]);
    await migrateTable("CampaignInteractions", [
      "interaction_id",
      "campaign_id",
      "user_id",
      "count",
      "created_at",
      "updated_at",
    ]);
    await migrateTable("SelectedSeries", [
      "series_id",
      "series_name",
      "match_list",
      "live_match_id",
    ]);
    await migrateTable("DailyImpressionSummaries", [
      "summary_id",
      "summary_date",
      "group_id",
      "ad_id",
      "client_id",
      "device_count",
      "total_loop_duration_seconds",
      "loops_per_day",
      "impressions",
    ]);
    await migrateTable("ApkVersions", [
      "id",
      "version_code",
      "version_name",
      "file_name",
      "s3_key",
      "file_size_bytes",
      "release_notes",
      "is_mandatory",
      "is_active",
      "checksum_sha256",
      "uploaded_at",
    ]);

    console.log("🎉 All data migrated successfully.");
    await pgClient.end();
    sqliteDb.close();
  } catch (err) {
    console.error("Migration error:", err);
  }
})();
