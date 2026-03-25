require("dotenv").config();
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const { spawn } = require("child_process");
const zlib = require("zlib");

// ---------------- CONFIG ----------------
const bucketName = process.env.DB_S3_BUCKET;
const prefix = process.env.DB_S3_PREFIX || "";

const DB_NAME = process.env.DB_NAME || "consoledb";
const DB_USER = process.env.DB_USER || "consoleuser";
const DB_PASSWORD = process.env.DB_PASSWORD || "admin";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = process.env.DB_PORT || 5432;

// ---------------- S3 CLIENT ----------------
const s3 = new S3Client({
  region: process.env.AWS_BUCKET_REGION,
});

// ---------------- GET LATEST FILE ----------------
async function getLatestBackupKey() {
  console.log("📂 Fetching backup list from S3...");

  const response = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    })
  );

  if (!response.Contents || response.Contents.length === 0) {
    throw new Error("No files found in S3.");
  }

  const backups = response.Contents.filter(obj =>
    obj.Key.endsWith(".sql.gz")
  );

  if (backups.length === 0) {
    throw new Error("No .sql.gz backups found.");
  }

  backups.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));

  console.log("✅ Latest backup:", backups[0].Key);
  return backups[0].Key;
}

// ---------------- STREAM RESTORE ----------------
async function restoreFromStream(key) {
  console.log("⬇ Streaming from S3 → Gunzip → psql...");

  const s3Object = await s3.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  );

  // Spawn psql process
  const psql = spawn("psql", [
    "-h", DB_HOST,
    "-p", DB_PORT,
    "-U", DB_USER,
    "-d", DB_NAME,
  ], {
    env: {
      ...process.env,
      PGPASSWORD: DB_PASSWORD,
    },
    stdio: ["pipe", "inherit", "inherit"],
  });

  return new Promise((resolve, reject) => {
    s3Object.Body
      .pipe(zlib.createGunzip())
      .pipe(psql.stdin);

    psql.on("close", (code) => {
      if (code === 0) {
        console.log("🎉 Database restored successfully.");
        resolve();
      } else {
        reject(new Error(`psql exited with code ${code}`));
      }
    });

    psql.on("error", reject);
  });
}

// ---------------- MAIN ----------------
async function run() {
  try {
    const latestKey = await getLatestBackupKey();
    await restoreFromStream(latestKey);
    console.log("✅ Restore completed successfully.");
  } catch (err) {
    console.error("❌ Restore failed:", err.message);
    process.exit(1);
  }
}

run();