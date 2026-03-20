///////////////////////////////////////// combooo//////////////////////////////////////////

const { parentPort, workerData } = require("worker_threads");
const ExcelJS = require("exceljs");
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const QueryStream = require("pg-query-stream");
const csv = require("csv-parser");
const zlib = require("zlib");
const moment = require("moment");

const { ExportJob, sequelize } = require("../models");

const s3 = new AWS.S3({
  region: process.env.AWS_BUCKET_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

// Excel max rows
const SHEET_MAX_ROWS = 1048575;

// ================= LOG CONFIG =================

const LOG_CONFIG = {
  PROOF_OF_PLAY: {
    table: "ProofOfPlayLogs",
    timeColumn: "start_time",
    archivePrefix: "proof-of-play-archive",
    archiveTablePrefix: "proofofplaylogs",
  },

  DEVICE_TELEMETRY: {
    table: "DeviceTelemetryLogs",
    timeColumn: "timestamp",
    archivePrefix: "device-telemetry-archive",
    archiveTablePrefix: "devicetelemetrylogs",
  },

  DEVICE_EVENTS: {
    table: "DeviceEventLogs",
    timeColumn: "timestamp",
    archivePrefix: "device-event-archive",
    archiveTablePrefix: "deviceeventlogs",
  },
};

async function runExportJob() {
  const { job } = workerData;

  const config = LOG_CONFIG[job.job_type];

  if (!config) {
    throw new Error(`Unsupported job_type: ${job.job_type}`);
  }

  let client;
  let filePath;

  try {
    console.log("🚀 Starting export job:", job.job_id);

    await ExportJob.update(
      { status: "PROCESSING", progress_percent: 5 },
      { where: { job_id: job.job_id } },
    );

    const tmpDir =
      process.platform === "win32" ? path.resolve("./tmp") : "/tmp";

    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

    filePath = path.join(tmpDir, `${job.job_id}.xlsx`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: filePath,
      useStyles: false,
      useSharedStrings: false,
    });

    // ---------------- Sheet Management ----------------

    const sheets = {};
    const sheetRowCount = {};
    const sheetIndex = {};

    function getRowTime(row) {
      return row.start_time || row.timestamp || row.played_at || row.created_at;
    }

    function getMonthKey(row) {
      const time = getRowTime(row);
      if (!time) return "Unknown";
      return moment(time).format("MMM");
    }

    function getMonthlySheet(row) {
      const month = getMonthKey(row);

      if (!sheetIndex[month]) {
        sheetIndex[month] = 1;
      }

      let sheetName =
        sheetIndex[month] === 1 ? month : `${month}_${sheetIndex[month]}`;

      if (!sheets[sheetName]) {
        const sheet = workbook.addWorksheet(sheetName);

        sheet.columns = Object.keys(row).map((key) => ({
          header: key,
          key,
        }));

        sheets[sheetName] = sheet;
        sheetRowCount[sheetName] = 0;
      }

      if (sheetRowCount[sheetName] >= SHEET_MAX_ROWS) {
        sheets[sheetName].commit();

        sheetIndex[month]++;

        sheetName = `${month}_${sheetIndex[month]}`;

        const sheet = workbook.addWorksheet(sheetName);

        sheet.columns = Object.keys(row).map((key) => ({
          header: key,
          key,
        }));

        sheets[sheetName] = sheet;
        sheetRowCount[sheetName] = 0;
      }

      return sheets[sheetName];
    }

    function writeRow(row) {
      const sheet = getMonthlySheet(row);

      sheet.addRow(row).commit();

      sheetRowCount[sheet.name]++;
    }

    // ---------------- Date Logic ----------------

    const archiveCutoff = moment().subtract(3, "months");
    const needsArchive = moment(job.start_date).isBefore(archiveCutoff);
    const needsLive = moment(job.end_date).isAfter(archiveCutoff);

    let totalRows = 0;

    // ================= S3 ARCHIVE STREAM =================

    if (needsArchive) {
      let m = moment(job.start_date).startOf("month");

      while (m.isBefore(archiveCutoff)) {
        const table = `${config.archiveTablePrefix}_${m.format("YYYY_MM")}`;

        // const key = `${config.archivePrefix}/${table}.csv.gz`;

        const key = `logs-archive/${table}.csv.gz`;
        console.log("📦 Reading archive:", key);

        try {
          await new Promise((resolve, reject) => {
            const s3Stream = s3
              .getObject({
                Bucket: process.env.AWS_LOG_BUCKET_NAME,
                Key: key,
              })
              .createReadStream();

            s3Stream
              .on("error", reject)
              .pipe(zlib.createGunzip())
              .pipe(csv())
              .on("data", (row) => {
                if (job.device_id && row.device_id !== job.device_id) return;

                if (
                  job.ad_id &&
                  job.job_type === "PROOF_OF_PLAY" &&
                  row.ad_id !== job.ad_id
                )
                  return;

                writeRow(row);

                totalRows++;

                if (totalRows % 10000 === 0) {
                  setImmediate(() => {});
                }
              })
              .on("end", resolve)
              .on("error", reject);
          });
        } catch (err) {
          console.log(`⚠️ Missing archive for ${table}`);
        }

        m.add(1, "month");
      }
    }

    await ExportJob.update(
      { progress_percent: 40 },
      { where: { job_id: job.job_id } },
    );

    // ================= POSTGRES STREAM =================

    if (needsLive) {
      let values = [];
      let paramIndex = 1;

      let query = `
        SELECT *
        FROM "${config.table}"
        WHERE ${config.timeColumn} BETWEEN $${paramIndex++} AND $${paramIndex++}
      `;

      values.push(job.start_date, job.end_date);

      if (job.device_id) {
        query += ` AND device_id = $${paramIndex++}`;
        values.push(job.device_id);
      }

      if (job.ad_id && job.job_type === "PROOF_OF_PLAY") {
        query += ` AND ad_id = $${paramIndex++}`;
        values.push(job.ad_id);
      }

      client = await sequelize.connectionManager.getConnection();

      const streamQuery = new QueryStream(query, values, {
        batchSize: 5000,
      });

      const dbStream = client.query(streamQuery);

      await new Promise((resolve, reject) => {
        dbStream.on("data", (row) => {
          dbStream.pause();

          try {
            writeRow(row);

            totalRows++;

            if (totalRows % 10000 === 0) {
              setImmediate(() => {});
            }

            dbStream.resume();
          } catch (err) {
            reject(err);
          }
        });

        dbStream.on("end", resolve);
        dbStream.on("error", reject);
      });

      await sequelize.connectionManager.releaseConnection(client);
      client = null;
    }

    // ================= No Data =================

    if (totalRows === 0) {
      const sheet = workbook.addWorksheet("NoData");

      sheet.columns = [{ header: "message", key: "message" }];

      sheet
        .addRow({
          message: "No data found for selected filters",
        })
        .commit();

      sheet.commit();
    }

    // ================= Commit Sheets =================

    for (const sheet of Object.values(sheets)) {
      sheet.commit();
    }

    // ================= Summary Sheet =================

    const summarySheet = workbook.addWorksheet("Summary");

    summarySheet.columns = [
      { header: "Sheet", key: "sheet" },
      { header: "Total Rows", key: "rows" },
    ];

    for (const sheet in sheetRowCount) {
      summarySheet
        .addRow({
          sheet,
          rows: sheetRowCount[sheet],
        })
        .commit();
    }

    summarySheet.commit();

    await workbook.commit();

    await ExportJob.update(
      { progress_percent: 80 },
      { where: { job_id: job.job_id } },
    );

    // ================= Upload to S3 =================

    const upload = await s3
      .upload({
        Bucket: process.env.AWS_LOG_BUCKET_NAME,
        Key: `exports/${job.job_id}.xlsx`,
        Body: fs.createReadStream(filePath),
      })
      .promise();

    const stats = fs.statSync(filePath);

    await ExportJob.update(
      {
        status: "COMPLETED",
        progress_percent: 100,
        s3_bucket: upload.Bucket,
        s3_key: upload.Key,
        file_size_bytes: stats.size,
      },
      { where: { job_id: job.job_id } },
    );

    fs.unlinkSync(filePath);

    console.log("✅ Export completed:", job.job_id);

    parentPort.postMessage("done");
  } catch (err) {
    console.error("🔥 WORKER FAILED:", err);

    if (client) {
      try {
        await sequelize.connectionManager.releaseConnection(client);
      } catch {}
    }

    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }

    await ExportJob.update(
      {
        status: "FAILED",
        error_message: err.message,
      },
      { where: { job_id: job.job_id } },
    );

    parentPort.postMessage("failed");
  }
}

runExportJob();
