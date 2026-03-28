// ///////////////////////////////////////// combooo//////////////////////////////////////////

// const { parentPort, workerData } = require("worker_threads");
// const ExcelJS = require("exceljs");
// const AWS = require("aws-sdk");
// const fs = require("fs");
// const path = require("path");
// const QueryStream = require("pg-query-stream");
// const csv = require("csv-parser");
// const zlib = require("zlib");
// // const moment = require("moment");
// const moment = require("moment-timezone");

// const { ExportJob, sequelize } = require("../models");

// const s3 = new AWS.S3({
//   region: process.env.AWS_BUCKET_REGION,
//   accessKeyId: process.env.AWS_ACCESS_KEY,
//   secretAccessKey: process.env.AWS_SECRET_KEY,
// });

// // Excel max rows
// const SHEET_MAX_ROWS = 1048575;

// // ================= LOG CONFIG =================

// const LOG_CONFIG = {
//   PROOF_OF_PLAY: {
//     table: "ProofOfPlayLogs",
//     timeColumn: "start_time",
//     archivePrefix: "proof-of-play-archive",
//     archiveTablePrefix: "proofofplaylogs",
//   },

//   DEVICE_TELEMETRY: {
//     table: "DeviceTelemetryLogs",
//     timeColumn: "timestamp",
//     archivePrefix: "device-telemetry-archive",
//     archiveTablePrefix: "devicetelemetrylogs",
//   },

//   DEVICE_EVENTS: {
//     table: "DeviceEventLogs",
//     timeColumn: "timestamp",
//     archivePrefix: "device-event-archive",
//     archiveTablePrefix: "deviceeventlogs",
//   },
// };

// async function runExportJob() {
//   const { job } = workerData;

//   const config = LOG_CONFIG[job.job_type];

//   if (!config) {
//     throw new Error(`Unsupported job_type: ${job.job_type}`);
//   }

//   let client;
//   let filePath;

//   try {
//     console.log("🚀 Starting export job:", job.job_id);

//     await ExportJob.update(
//       { status: "PROCESSING", progress_percent: 5 },
//       { where: { job_id: job.job_id } },
//     );

//     const tmpDir =
//       process.platform === "win32" ? path.resolve("./tmp") : "/tmp";

//     if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

//     filePath = path.join(tmpDir, `${job.job_id}.xlsx`);

//     const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
//       filename: filePath,
//       useStyles: false,
//       useSharedStrings: false,
//     });

//     // ---------------- Sheet Management ----------------

//     const sheets = {};
//     const sheetRowCount = {};
//     const sheetIndex = {};

//     function getRowTime(row) {
//       return row.start_time || row.timestamp || row.played_at || row.created_at;
//     }

//     function getMonthKey(row) {
//       const time = getRowTime(row);
//       if (!time) return "Unknown";
//       return moment(time).format("MMM");
//     }

//     function getMonthlySheet(row) {
//       const month = getMonthKey(row);

//       if (!sheetIndex[month]) {
//         sheetIndex[month] = 1;
//       }

//       let sheetName =
//         sheetIndex[month] === 1 ? month : `${month}_${sheetIndex[month]}`;

//       if (!sheets[sheetName]) {
//         const sheet = workbook.addWorksheet(sheetName);

//         // sheet.columns = Object.keys(row).map((key) => ({
//         //   header: key,
//         //   key,
//         // }));

//         // sheet.columns = Object.keys(row).map((key) => ({
//         //   header: key,
//         //   key,
//         //   width: 22, // ✅ FIX: increase width
//         //   style:
//         //     key.includes("time") || key.includes("date") || key.includes("at")
//         //       ? { numFmt: "yyyy-mm-dd hh:mm:ss" }
//         //       : {},
//         // }));

//         const DATE_FIELDS = [
//           "start_time",
//           "end_time",
//           "timestamp",
//           "created_at",
//           "updated_at",
//           "played_at",
//         ];

//         sheet.columns = Object.keys(row).map((key) => ({
//           header: key,
//           key,
//           width: 22,
//           // style: DATE_FIELDS.includes(key)
//           //   ? { numFmt: "yyyy-mm-dd hh:mm:ss" }
//           //   : {},
//         }));

//         sheets[sheetName] = sheet;
//         sheetRowCount[sheetName] = 0;
//       }

//       if (sheetRowCount[sheetName] >= SHEET_MAX_ROWS) {
//         sheets[sheetName].commit();

//         sheetIndex[month]++;

//         sheetName = `${month}_${sheetIndex[month]}`;

//         const sheet = workbook.addWorksheet(sheetName);

//         // sheet.columns = Object.keys(row).map((key) => ({
//         //   header: key,
//         //   key,
//         // }));

//         const DATE_FIELDS = [
//           "start_time",
//           "end_time",
//           "timestamp",
//           "created_at",
//           "updated_at",
//           "played_at",
//         ];

//         sheet.columns = Object.keys(row).map((key) => ({
//           header: key,
//           key,
//           width: 22,
//           // style: DATE_FIELDS.includes(key)
//           //   ? { numFmt: "yyyy-mm-dd hh:mm:ss" }
//           //   : {},
//         }));

//         sheets[sheetName] = sheet;
//         sheetRowCount[sheetName] = 0;
//       }

//       return sheets[sheetName];
//     }

//     function convertToIST(row) {
//       const newRow = {};

//       const DATE_FIELDS = [
//         "start_time",
//         "end_time",
//         "timestamp",
//         "created_at",
//         "updated_at",
//         "played_at",
//       ];

//       for (const key in row) {
//         let value = row[key];

//         if (value && DATE_FIELDS.includes(key)) {
//           value = moment(value)
//             .tz("Asia/Kolkata")
//             .format("DD/MM/YYYY, hh:mm:ss A"); // ✅ STRING like your API
//         }

//         newRow[key] = value;
//       }

//       return newRow;
//     }

//     function writeRow(row) {
//       const sheet = getMonthlySheet(row);

//       const formattedRow = convertToIST(row);

//       const rowObj = sheet.addRow(formattedRow);

//       // 🔥 Force format (extra safe)
//       rowObj.eachCell((cell, colNumber) => {
//         const key = sheet.columns[colNumber - 1].key;

//         if (
//           key.includes("time") ||
//           key.includes("date") ||
//           key.includes("at")
//         ) {
//           cell.numFmt = "yyyy-mm-dd hh:mm:ss";
//         }
//       });

//       rowObj.commit();

//       sheetRowCount[sheet.name]++;
//     }

//     // ---------------- Date Logic ----------------

//     const archiveCutoff = moment().subtract(3, "months");
//     const needsArchive = moment(job.start_date).isBefore(archiveCutoff);
//     const needsLive = moment(job.end_date).isAfter(archiveCutoff);

//     let totalRows = 0;

//     // ================= S3 ARCHIVE STREAM =================

//     if (needsArchive) {
//       let m = moment(job.start_date).startOf("month");

//       while (m.isBefore(archiveCutoff)) {
//         const table = `${config.archiveTablePrefix}_${m.format("YYYY_MM")}`;

//         // const key = `${config.archivePrefix}/${table}.csv.gz`;

//         const key = `logs-archive/${table}.csv.gz`;
//         console.log("📦 Reading archive:", key);

//         try {
//           await new Promise((resolve, reject) => {
//             const s3Stream = s3
//               .getObject({
//                 Bucket: process.env.AWS_LOG_BUCKET_NAME,
//                 Key: key,
//               })
//               .createReadStream();

//             s3Stream
//               .on("error", reject)
//               .pipe(zlib.createGunzip())
//               .pipe(csv())
//               .on("data", (row) => {
//                 if (job.device_id && row.device_id !== job.device_id) return;

//                 if (
//                   job.ad_id &&
//                   job.job_type === "PROOF_OF_PLAY" &&
//                   row.ad_id !== job.ad_id
//                 )
//                   return;

//                 writeRow(row);

//                 totalRows++;

//                 if (totalRows % 10000 === 0) {
//                   setImmediate(() => {});
//                 }
//               })
//               .on("end", resolve)
//               .on("error", reject);
//           });
//         } catch (err) {
//           console.log(`⚠️ Missing archive for ${table}`);
//         }

//         m.add(1, "month");
//       }
//     }

//     await ExportJob.update(
//       { progress_percent: 40 },
//       { where: { job_id: job.job_id } },
//     );

//     // ================= POSTGRES STREAM =================

//     if (needsLive) {
//       let values = [];
//       let paramIndex = 1;

//       let query = `
//         SELECT *
//         FROM "${config.table}"
//         WHERE ${config.timeColumn} BETWEEN $${paramIndex++} AND $${paramIndex++}
//       `;

//       values.push(job.start_date, job.end_date);

//       if (job.device_id) {
//         query += ` AND device_id = $${paramIndex++}`;
//         values.push(job.device_id);
//       }

//       if (job.ad_id && job.job_type === "PROOF_OF_PLAY") {
//         query += ` AND ad_id = $${paramIndex++}`;
//         values.push(job.ad_id);
//       }

//       client = await sequelize.connectionManager.getConnection();

//       const streamQuery = new QueryStream(query, values, {
//         batchSize: 5000,
//       });

//       const dbStream = client.query(streamQuery);

//       await new Promise((resolve, reject) => {
//         dbStream.on("data", (row) => {
//           dbStream.pause();

//           try {
//             writeRow(row);

//             totalRows++;

//             if (totalRows % 10000 === 0) {
//               setImmediate(() => {});
//             }

//             dbStream.resume();
//           } catch (err) {
//             reject(err);
//           }
//         });

//         dbStream.on("end", resolve);
//         dbStream.on("error", reject);
//       });

//       await sequelize.connectionManager.releaseConnection(client);
//       client = null;
//     }

//     // ================= No Data =================

//     if (totalRows === 0) {
//       const sheet = workbook.addWorksheet("NoData");

//       sheet.columns = [{ header: "message", key: "message" }];

//       sheet
//         .addRow({
//           message: "No data found for selected filters",
//         })
//         .commit();

//       sheet.commit();
//     }

//     // ================= Commit Sheets =================

//     for (const sheet of Object.values(sheets)) {
//       sheet.commit();
//     }

//     // ================= Summary Sheet =================

//     const summarySheet = workbook.addWorksheet("Summary");

//     summarySheet.columns = [
//       { header: "Sheet", key: "sheet" },
//       { header: "Total Rows", key: "rows" },
//     ];

//     for (const sheet in sheetRowCount) {
//       summarySheet
//         .addRow({
//           sheet,
//           rows: sheetRowCount[sheet],
//         })
//         .commit();
//     }

//     summarySheet.commit();

//     await workbook.commit();

//     await ExportJob.update(
//       { progress_percent: 80 },
//       { where: { job_id: job.job_id } },
//     );

//     // ================= Upload to S3 =================

//     const upload = await s3
//       .upload({
//         Bucket: process.env.AWS_LOG_BUCKET_NAME,
//         Key: `exports/${job.job_id}.xlsx`,
//         Body: fs.createReadStream(filePath),
//       })
//       .promise();

//     const stats = fs.statSync(filePath);

//     await ExportJob.update(
//       {
//         status: "COMPLETED",
//         progress_percent: 100,
//         s3_bucket: upload.Bucket,
//         s3_key: upload.Key,
//         file_size_bytes: stats.size,
//       },
//       { where: { job_id: job.job_id } },
//     );

//     fs.unlinkSync(filePath);

//     console.log("✅ Export completed:", job.job_id);

//     parentPort.postMessage("done");
//   } catch (err) {
//     console.error("🔥 WORKER FAILED:", err);

//     if (client) {
//       try {
//         await sequelize.connectionManager.releaseConnection(client);
//       } catch {}
//     }

//     if (filePath && fs.existsSync(filePath)) {
//       try {
//         fs.unlinkSync(filePath);
//       } catch {}
//     }

//     await ExportJob.update(
//       {
//         status: "FAILED",
//         error_message: err.message,
//       },
//       { where: { job_id: job.job_id } },
//     );

//     parentPort.postMessage("failed");
//   }
// }

// runExportJob();

///////////////////////////////////////// combooo//////////////////////////////////////////

// const { parentPort, workerData } = require("worker_threads");
// const ExcelJS = require("exceljs");
// const AWS = require("aws-sdk");
// const fs = require("fs");
// const path = require("path");
// const QueryStream = require("pg-query-stream");
// const csv = require("csv-parser");
// const zlib = require("zlib");
// const moment = require("moment-timezone");

// const { ExportJob, sequelize } = require("../models");

// const s3 = new AWS.S3({
//   region: process.env.AWS_BUCKET_REGION,
//   accessKeyId: process.env.AWS_ACCESS_KEY,
//   secretAccessKey: process.env.AWS_SECRET_KEY,
// });

// const SHEET_MAX_ROWS = 1048575;

// // ================= LOG CONFIG =================

// const LOG_CONFIG = {
//   PROOF_OF_PLAY: {
//     table: "ProofOfPlayLogs",
//     timeColumn: "start_time",
//     archivePrefix: "proof-of-play-archive",
//     archiveTablePrefix: "proofofplaylogs",
//   },

//   DEVICE_TELEMETRY: {
//     table: "DeviceTelemetryLogs",
//     timeColumn: "timestamp",
//     archivePrefix: "device-telemetry-archive",
//     archiveTablePrefix: "devicetelemetrylogs",
//   },

//   DEVICE_EVENTS: {
//     table: "DeviceEventLogs",
//     timeColumn: "timestamp",
//     archivePrefix: "device-event-archive",
//     archiveTablePrefix: "deviceeventlogs",
//   },
// };

// async function runExportJob() {
//   const { job } = workerData;
//   const config = LOG_CONFIG[job.job_type];

//   if (!config) {
//     throw new Error(`Unsupported job_type: ${job.job_type}`);
//   }

//   let client;
//   let filePath;

//   try {
//     console.log("🚀 Starting export job:", job.job_id);

//     await ExportJob.update(
//       { status: "PROCESSING", progress_percent: 5 },
//       { where: { job_id: job.job_id } }
//     );

//     const tmpDir =
//       process.platform === "win32" ? path.resolve("./tmp") : "/tmp";

//     if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

//     filePath = path.join(tmpDir, `${job.job_id}.xlsx`);

//     const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
//       filename: filePath,
//       useStyles: false,
//       useSharedStrings: false,
//     });

//     // ================= DEVICE SHEETS =================

//     const sheets = {};
//     const sheetRowCount = {};
//     const sheetIndex = {};
//     const summaryMap = {};
//     const deviceMap = {};
// const adMap = {};

//     function getDeviceKey(row) {
//       return row.device_id || "Unknown";
//     }

//     function getDeviceSheet(row) {
//       const deviceKey = getDeviceKey(row);

//       if (!sheetIndex[deviceKey]) {
//         sheetIndex[deviceKey] = 1;
//       }

//       let sheetName =
//         sheetIndex[deviceKey] === 1
//           ? `${deviceKey}`
//           : `${deviceKey}_${sheetIndex[deviceKey]}`;

//       sheetName = sheetName.substring(0, 31);

//       if (!sheets[sheetName]) {
//         const sheet = workbook.addWorksheet(sheetName);

//         sheet.columns = Object.keys(row).map((key) => ({
//           header: key,
//           key,
//           width: 22,
//         }));

//         sheets[sheetName] = sheet;
//         sheetRowCount[sheetName] = 0;
//       }

//       if (sheetRowCount[sheetName] >= SHEET_MAX_ROWS) {
//         sheets[sheetName].commit();

//         sheetIndex[deviceKey]++;
//         sheetName = `${deviceKey}_${sheetIndex[deviceKey]}`.substring(0, 31);

//         const sheet = workbook.addWorksheet(sheetName);

//         sheet.columns = Object.keys(row).map((key) => ({
//           header: key,
//           key,
//           width: 22,
//         }));

//         sheets[sheetName] = sheet;
//         sheetRowCount[sheetName] = 0;
//       }

//       return sheets[sheetName];
//     }

//     function convertToIST(row) {
//       const newRow = {};

//       const DATE_FIELDS = [
//         "start_time",
//         "end_time",
//         "timestamp",
//         "created_at",
//         "updated_at",
//         "played_at",
//       ];

//       for (const key in row) {
//         let value = row[key];

//         if (value && DATE_FIELDS.includes(key)) {
//           value = moment(value)
//             .tz("Asia/Kolkata")
//             .format("DD/MM/YYYY, hh:mm:ss A");
//         }

//         newRow[key] = value;
//       }

//       return newRow;
//     }

//     function writeRow(row) {
//       const sheet = getDeviceSheet(row);
//       const formattedRow = convertToIST(row);

//       const rowObj = sheet.addRow(formattedRow);

//       rowObj.eachCell((cell, colNumber) => {
//         const key = sheet.columns[colNumber - 1].key;

//         if (
//           key.includes("time") ||
//           key.includes("date") ||
//           key.includes("at")
//         ) {
//           cell.numFmt = "yyyy-mm-dd hh:mm:ss";
//         }
//       });

//       rowObj.commit();

//       sheetRowCount[sheet.name]++;

//       // 🔥 SUMMARY ONLY FOR POP
//       if (job.job_type === "PROOF_OF_PLAY") {
//         const key = `${row.device_id}_${row.ad_id}`;

//         if (!summaryMap[key]) {
//           summaryMap[key] = {
//             device_id: row.device_id,
//             ad_id: row.ad_id,
//             total_plays: 0,
//             total_time: 0,
//           };
//         }

//         summaryMap[key].total_plays += 1;
//         summaryMap[key].total_time += row.duration_played_ms || 0;
//       }
//     }

//     // ================= DATE LOGIC =================

//     const archiveCutoff = moment().subtract(3, "months");
//     const needsArchive = moment(job.start_date).isBefore(archiveCutoff);
//     const needsLive = moment(job.end_date).isAfter(archiveCutoff);

//     let totalRows = 0;

//     // ================= S3 STREAM =================

//     if (needsArchive) {
//       let m = moment(job.start_date).startOf("month");

//       while (m.isBefore(archiveCutoff)) {
//         const table = `${config.archiveTablePrefix}_${m.format("YYYY_MM")}`;
//         const key = `logs-archive/${table}.csv.gz`;

//         console.log("📦 Reading archive:", key);

//         try {
//           await new Promise((resolve, reject) => {
//             const s3Stream = s3
//               .getObject({
//                 Bucket: process.env.AWS_LOG_BUCKET_NAME,
//                 Key: key,
//               })
//               .createReadStream();

//             s3Stream
//               .on("error", reject)
//               .pipe(zlib.createGunzip())
//               .pipe(csv())
//               .on("data", (row) => {
//                 if (job.device_id && row.device_id !== job.device_id) return;

//                 if (
//                   job.ad_id &&
//                   job.job_type === "PROOF_OF_PLAY" &&
//                   row.ad_id !== job.ad_id
//                 )
//                   return;

//                 writeRow(row);
//                 totalRows++;
//               })
//               .on("end", resolve)
//               .on("error", reject);
//           });
//         } catch {
//           console.log(`⚠️ Missing archive for ${table}`);
//         }

//         m.add(1, "month");
//       }
//     }

//     await ExportJob.update(
//       { progress_percent: 40 },
//       { where: { job_id: job.job_id } }
//     );

//     // ================= POSTGRES STREAM =================

//     if (needsLive) {
//       let values = [];
//       let paramIndex = 1;

//       let query = `
//         SELECT *
//         FROM "${config.table}"
//         WHERE ${config.timeColumn} BETWEEN $${paramIndex++} AND $${paramIndex++}
//       `;

//       values.push(job.start_date, job.end_date);

//       if (job.device_id) {
//         query += ` AND device_id = $${paramIndex++}`;
//         values.push(job.device_id);
//       }

//       if (job.ad_id && job.job_type === "PROOF_OF_PLAY") {
//         query += ` AND ad_id = $${paramIndex++}`;
//         values.push(job.ad_id);
//       }

//       client = await sequelize.connectionManager.getConnection();

//       const streamQuery = new QueryStream(query, values, {
//         batchSize: 5000,
//       });

//       const dbStream = client.query(streamQuery);

//       await new Promise((resolve, reject) => {
//         dbStream.on("data", (row) => {
//           dbStream.pause();

//           try {
//             writeRow(row);
//             totalRows++;
//             dbStream.resume();
//           } catch (err) {
//             reject(err);
//           }
//         });

//         dbStream.on("end", resolve);
//         dbStream.on("error", reject);
//       });

//       await sequelize.connectionManager.releaseConnection(client);
//       client = null;
//     }

//     // ================= NO DATA =================

//     if (totalRows === 0) {
//       const sheet = workbook.addWorksheet("NoData");
//       sheet.columns = [{ header: "message", key: "message" }];
//       sheet.addRow({ message: "No data found" }).commit();
//       sheet.commit();
//     }

//     // ================= COMMIT SHEETS =================

//     for (const sheet of Object.values(sheets)) {
//       sheet.commit();
//     }

//     // ================= SUMMARY =================

//     let summarySheet = workbook.addWorksheet("Summary");

//     if (job.job_type === "PROOF_OF_PLAY") {
//       summarySheet.columns = [
//         { header: "Device ID", key: "device_id" },
//         { header: "Ad ID", key: "ad_id" },
//         { header: "Total Plays", key: "total_plays" },
//         { header: "Total Time (sec)", key: "total_time" },
//       ];

//       Object.values(summaryMap).forEach((item) => {
//         summarySheet
//           .addRow({
//             device_id: item.device_id,
//             ad_id: item.ad_id,
//             total_plays: item.total_plays,
//             total_time: (item.total_time / 1000).toFixed(2),
//           })
//           .commit();
//       });
//     } else {
//       summarySheet.columns = [
//         { header: "Sheet", key: "sheet" },
//         { header: "Total Rows", key: "rows" },
//       ];

//       for (const sheet in sheetRowCount) {
//         summarySheet
//           .addRow({
//             sheet,
//             rows: sheetRowCount[sheet],
//           })
//           .commit();
//       }
//     }

//     summarySheet.commit();

//     await workbook.commit();

//     await ExportJob.update(
//       { progress_percent: 80 },
//       { where: { job_id: job.job_id } }
//     );

//     // ================= S3 UPLOAD =================

//     const upload = await s3
//       .upload({
//         Bucket: process.env.AWS_LOG_BUCKET_NAME,
//         Key: `exports/${job.job_id}.xlsx`,
//         Body: fs.createReadStream(filePath),
//       })
//       .promise();

//     const stats = fs.statSync(filePath);

//     await ExportJob.update(
//       {
//         status: "COMPLETED",
//         progress_percent: 100,
//         s3_bucket: upload.Bucket,
//         s3_key: upload.Key,
//         file_size_bytes: stats.size,
//       },
//       { where: { job_id: job.job_id } }
//     );

//     fs.unlinkSync(filePath);

//     console.log("✅ Export completed:", job.job_id);

//     parentPort.postMessage("done");
//   } catch (err) {
//     console.error("🔥 WORKER FAILED:", err);

//     if (client) {
//       try {
//         await sequelize.connectionManager.releaseConnection(client);
//       } catch {}
//     }

//     if (filePath && fs.existsSync(filePath)) {
//       try {
//         fs.unlinkSync(filePath);
//       } catch {}
//     }

//     await ExportJob.update(
//       {
//         status: "FAILED",
//         error_message: err.message,
//       },
//       { where: { job_id: job.job_id } }
//     );

//     parentPort.postMessage("failed");
//   }
// }

// runExportJob();

//       after final    01

///////////////////////////////////////// combooo  letest   //////////////////////////////////////////

const { parentPort, workerData } = require("worker_threads");
const ExcelJS = require("exceljs");
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const QueryStream = require("pg-query-stream");
const csv = require("csv-parser");
const zlib = require("zlib");
const moment = require("moment-timezone");

const { ExportJob, sequelize } = require("../models");

const s3 = new AWS.S3({
  region: process.env.AWS_BUCKET_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

const SHEET_MAX_ROWS = 1048575;

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

  if (!config) throw new Error(`Unsupported job_type: ${job.job_type}`);

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

    // ================= MAPS =================

    const deviceMap = {};
    const adMap = {};

    // 🔥 preload once
    const devices = await sequelize.query(
      `SELECT device_id, device_name FROM "Devices"`,
      { type: sequelize.QueryTypes.SELECT },
    );
    devices.forEach((d) => {
      deviceMap[d.device_id] = d.device_name;
    });

    const ads = await sequelize.query(`SELECT ad_id, name FROM "Ads"`, {
      type: sequelize.QueryTypes.SELECT,
    });
    ads.forEach((a) => {
      adMap[a.ad_id] = a.name;
    });

    // ================= DEVICE SHEETS =================

    const sheets = {};
    const sheetRowCount = {};
    const sheetIndex = {};
    const summaryMap = {};

    function getDeviceKey(row) {
      return row.device_name || row.device_id || "Unknown";
    }

    function getDeviceSheet(row) {
      const deviceKey = getDeviceKey(row);

      if (!sheetIndex[deviceKey]) sheetIndex[deviceKey] = 1;

      let sheetName =
        sheetIndex[deviceKey] === 1
          ? deviceKey
          : `${deviceKey}_${sheetIndex[deviceKey]}`;

      sheetName = sheetName.substring(0, 31);

      if (!sheets[sheetName]) {
        const sheet = workbook.addWorksheet(sheetName);

        sheet.columns = Object.keys(row).map((key) => ({
          header: key,
          key,
          width: 22,
        }));

        sheets[sheetName] = sheet;
        sheetRowCount[sheetName] = 0;
      }

      if (sheetRowCount[sheetName] >= SHEET_MAX_ROWS) {
        sheets[sheetName].commit();

        sheetIndex[deviceKey]++;
        sheetName = `${deviceKey}_${sheetIndex[deviceKey]}`.substring(0, 31);

        const sheet = workbook.addWorksheet(sheetName);

        sheet.columns = Object.keys(row).map((key) => ({
          header: key,
          key,
          width: 22,
        }));

        sheets[sheetName] = sheet;
        sheetRowCount[sheetName] = 0;
      }

      return sheets[sheetName];
    }

    function convertToIST(row) {
      const newRow = {};
      const DATE_FIELDS = [
        "start_time",
        "end_time",
        "timestamp",
        "created_at",
        "updated_at",
        "played_at",
      ];

      for (const key in row) {
        let value = row[key];

        if (value && DATE_FIELDS.includes(key)) {
          value = moment(value)
            .tz("Asia/Kolkata")
            .format("DD/MM/YYYY, hh:mm:ss A");
        }

        newRow[key] = value;
      }

      return newRow;
    }

    function writeRow(row) {
      // ✅ FILTER (ADDED)
      if (job.device_id && row.device_id !== job.device_id) return;

      if (
        job.ad_id &&
        job.job_type === "PROOF_OF_PLAY" &&
        row.ad_id !== job.ad_id
      )
        return;

      // 🔥 attach names
      if (row.device_id) {
        row.device_name = deviceMap[row.device_id] || row.device_id;
      }
      if (row.ad_id) {
        row.ad_name = adMap[row.ad_id] || row.ad_id;
      }

      const sheet = getDeviceSheet(row);
      const formattedRow = convertToIST(row);

      const rowObj = sheet.addRow(formattedRow);

      rowObj.eachCell((cell, colNumber) => {
        const key = sheet.columns[colNumber - 1].key;

        if (
          key.includes("time") ||
          key.includes("date") ||
          key.includes("at")
        ) {
          cell.numFmt = "yyyy-mm-dd hh:mm:ss";
        }
      });

      rowObj.commit();
      sheetRowCount[sheet.name]++;

      // 🔥 POP SUMMARY
      if (job.job_type === "PROOF_OF_PLAY") {
        const key = `${row.device_id}_${row.ad_id}`;

        if (!summaryMap[key]) {
          summaryMap[key] = {
            device_name: row.device_name,
            ad_name: row.ad_name,
            total_plays: 0,
            total_time: 0,
          };
        }

        summaryMap[key].total_plays += 1;
        summaryMap[key].total_time += row.duration_played_ms || 0;
      }
    }

    // ================= STREAM LOGIC (UNCHANGED) =================

    const archiveCutoff = moment().subtract(3, "months");
    const needsArchive = moment(job.start_date).isBefore(archiveCutoff);
    const needsLive = moment(job.end_date).isAfter(archiveCutoff);

    let totalRows = 0;

    if (needsArchive) {
      let m = moment(job.start_date).startOf("month");

      while (m.isBefore(archiveCutoff)) {
        const table = `${config.archiveTablePrefix}_${m.format("YYYY_MM")}`;
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
              })
              .on("end", resolve)
              .on("error", reject);
          });
        } catch {
          console.log(`⚠️ Missing archive for ${table}`);
        }

        m.add(1, "month");
      }
    }

    await ExportJob.update(
      { progress_percent: 40 },
      { where: { job_id: job.job_id } }
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

    // ================= NO DATA =================

    if (totalRows === 0) {
      const sheet = workbook.addWorksheet("NoData");
      sheet.columns = [{ header: "message", key: "message" }];
      sheet.addRow({ message: "No data found" }).commit();
      sheet.commit();
    }    // ================= COMMIT =================

    for (const sheet of Object.values(sheets)) {
      sheet.commit();
    }

    // ================= SUMMARY =================

    const summarySheet = workbook.addWorksheet("Summary");

    if (job.job_type === "PROOF_OF_PLAY") {
      summarySheet.columns = [
        { header: "Device Name", key: "device_name" },
        { header: "Ad Name", key: "ad_name" },
        { header: "Total Plays", key: "total_plays" },
        { header: "Total Time (sec)", key: "total_time" },
      ];

      Object.values(summaryMap).forEach((item) => {
        summarySheet
          .addRow({
            device_name: item.device_name,
            ad_name: item.ad_name,
            total_plays: item.total_plays,
            total_time: (item.total_time / 1000).toFixed(2),
          })
          .commit();
      });
    } else {
      summarySheet.columns = [
        { header: "Sheet", key: "sheet" },
        { header: "Rows", key: "rows" },
      ];

      for (const s in sheetRowCount) {
        summarySheet.addRow({ sheet: s, rows: sheetRowCount[s] }).commit();
      }
    }

    summarySheet.commit();
    await workbook.commit();

    // ================= UPLOAD =================

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

    parentPort.postMessage("done");
  } catch (err) {
    console.error("🔥 WORKER FAILED:", err);

    await ExportJob.update(
      { status: "FAILED", error_message: err.message },
      { where: { job_id: job.job_id } },
    );

    parentPort.postMessage("failed");
  }
}

runExportJob();
