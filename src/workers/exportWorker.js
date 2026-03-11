// const { parentPort, workerData } = require("worker_threads");
// const ExcelJS = require("exceljs");
// const AWS = require("aws-sdk");
// const fs = require("fs");
// const path = require("path");
// const QueryStream = require("pg-query-stream");
// const csv = require("csv-parser");
// const zlib = require("zlib");
// const moment = require("moment");

// const { ExportJob, sequelize } = require("../models");

// const s3 = new AWS.S3();
// const ARCHIVE_PREFIX = "proof-of-play-archive";

// async function runExportJob() {
//   const { job } = workerData;
//   let client;
//   let filePath;

//   try {
//     console.log("🚀 Starting export job:", job.job_id);

//     await ExportJob.update(
//       { status: "PROCESSING", progress_percent: 5 },
//       { where: { job_id: job.job_id } }
//     );

//     filePath = path.join("/tmp", `${job.job_id}.xlsx`);

//     const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
//       filename: filePath
//     });

//     const sheet = workbook.addWorksheet("ProofOfPlay");

//     let columnsSet = false;
//     let hasRows = false;

//     function setColumns(row) {
//       if (!columnsSet) {
//         sheet.columns = Object.keys(row).map(key => ({
//           header: key,
//           key
//         }));
//         columnsSet = true;
//       }
//     }

//     const archiveCutoff = moment().subtract(3, "months");
//     const needsArchive = moment(job.start_date).isBefore(archiveCutoff);
//     const needsLive = moment(job.end_date).isAfter(archiveCutoff);

//     // ================= ARCHIVE =================
//     if (needsArchive) {
//       let m = moment(job.start_date).startOf("month");

//       while (m.isBefore(archiveCutoff)) {
//         const table = `ProofOfPlayLogs_${m.format("YYYY_MM")}`;
//         const key = `${ARCHIVE_PREFIX}/${table}.csv.gz`;

//         console.log("📦 Reading archive:", key);

//         try {
//           await new Promise((resolve, reject) => {

//             const s3Stream = s3.getObject({
//               Bucket: process.env.S3_BUCKET,
//               Key: key
//             }).createReadStream();

//             s3Stream
//               .on("error", reject)
//               .pipe(zlib.createGunzip())
//               .on("error", reject)
//               .pipe(csv())
//               .on("data", row => {
//                 try {
//                   if (job.device_id && row.device_id !== job.device_id) return;
//                   if (job.ad_id && row.ad_id !== job.ad_id) return;

//                   setColumns(row);
//                   sheet.addRow(row).commit();
//                   hasRows = true;
//                 } catch (e) {
//                   reject(e);
//                 }
//               })
//               .on("end", resolve)
//               .on("error", reject);
//           });

//         } catch (err) {
//           console.log(`⚠️ Archive missing or error for ${table}:`, err.message);
//         }

//         m.add(1, "month");
//       }
//     }

//     await ExportJob.update(
//       { progress_percent: 40 },
//       { where: { job_id: job.job_id } }
//     );

//     // ================= LIVE DB =================
//     if (needsLive) {

//       let values = [];
//       let paramIndex = 1;

//       let query = `
//         SELECT *
//         FROM "ProofOfPlayLogs"
//         WHERE start_time BETWEEN $${paramIndex++} AND $${paramIndex++}
//       `;

//       values.push(job.start_date, job.end_date);

//       if (job.device_id) {
//         query += ` AND device_id = $${paramIndex++}`;
//         values.push(job.device_id);
//       }

//       if (job.ad_id) {
//         query += ` AND ad_id = $${paramIndex++}`;
//         values.push(job.ad_id);
//       }

//       client = await sequelize.connectionManager.getConnection();

//       const streamQuery = new QueryStream(query, values);

//       const dbStream = client.query(streamQuery);

//       await new Promise((resolve, reject) => {

//         dbStream.on("error", reject);

//         (async () => {
//           try {
//             for await (const row of dbStream) {
//               setColumns(row);
//               sheet.addRow(row).commit();
//               hasRows = true;
//             }
//             resolve();
//           } catch (err) {
//             reject(err);
//           }
//         })();

//       });

//       await sequelize.connectionManager.releaseConnection(client);
//       client = null;
//     }

//     // ================= EMPTY CASE =================
//     if (!hasRows) {
//       sheet.columns = [{ header: "message", key: "message" }];
//       sheet.addRow({ message: "No data found for selected filters" }).commit();
//     }

//     console.log("step 4", sheet)

//     sheet.commit();
//     await workbook.commit();

//     await ExportJob.update(
//       { progress_percent: 80 },
//       { where: { job_id: job.job_id } }
//     );

//     // ================= S3 UPLOAD =================
//     const upload = await s3.upload({
//       Bucket: process.env.S3_BUCKET,
//       Key: `exports/${job.job_id}.xlsx`,
//       Body: fs.createReadStream(filePath)
//     }).promise();

//     const stats = fs.statSync(filePath);

//     await ExportJob.update({
//       status: "COMPLETED",
//       progress_percent: 100,
//       s3_bucket: upload.Bucket,
//       s3_key: upload.Key,
//       file_size_bytes: stats.size
//     }, {
//       where: { job_id: job.job_id }
//     });

//     fs.unlinkSync(filePath);

//     console.log("✅ Export completed:", job.job_id);
//     parentPort.postMessage("done");

//   } catch (err) {

//     console.error("🔥 WORKER FAILED:", err);

//     if (client) {
//       try { await sequelize.connectionManager.releaseConnection(client); }
//       catch (e) {}
//     }

//     if (filePath && fs.existsSync(filePath)) {
//       try { fs.unlinkSync(filePath); }
//       catch (e) {}
//     }

//     await ExportJob.update({
//       status: "FAILED",
//       error_message: err.message
//     }, {
//       where: { job_id: job.job_id }
//     });

//     parentPort.postMessage("failed");
//   }
// }

// runExportJob();

// const { parentPort, workerData } = require("worker_threads");
// const ExcelJS = require("exceljs");
// const AWS = require("aws-sdk");
// const fs = require("fs");
// const path = require("path");
// const QueryStream = require("pg-query-stream");
// const csv = require("csv-parser");
// const zlib = require("zlib");
// const moment = require("moment");

// const { ExportJob, sequelize } = require("../models");

// const s3 = new AWS.S3();
// const ARCHIVE_PREFIX = "proof-of-play-archive";

// async function runExportJob() {

//   const { job } = workerData;
//   let client;

//   try {

//     await ExportJob.update(
//       { status: "PROCESSING", progress_percent: 5 },
//       { where: { job_id: job.job_id } }
//     );

//     const filePath = path.join("/tmp", `${job.job_id}.xlsx`);

//     const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
//       filename: filePath
//     });

//     const sheet = workbook.addWorksheet("ProofOfPlay");

//     let columnsSet = false;

//     function setColumns(row) {
//       if (!columnsSet) {
//         sheet.columns = Object.keys(row).map(key => ({
//           header: key,
//           key
//         }));
//         columnsSet = true;
//       }
//     }

//     const archiveCutoff = moment().subtract(3, "months");

//     const needsArchive = moment(job.start_date).isBefore(archiveCutoff);
//     const needsLive = moment(job.end_date).isAfter(archiveCutoff);

//     // ---------- ARCHIVE STREAM ----------
//     if (needsArchive) {

//       let m = moment(job.start_date).startOf("month");

//       while (m.isBefore(archiveCutoff)) {

//         const table = `ProofOfPlayLogs_${m.format("YYYY_MM")}`;
//         const key = `${ARCHIVE_PREFIX}/${table}.csv.gz`;

//         try {

//           const s3Stream = s3.getObject({
//             Bucket: process.env.S3_BUCKET,
//             Key: key
//           }).createReadStream();

//           await new Promise((resolve, reject) => {

//             s3Stream
//               .pipe(zlib.createGunzip())
//               .pipe(csv())
//               .on("data", row => {

//                 if (job.device_id && row.device_id !== job.device_id) return;
//                 if (job.ad_id && row.ad_id !== job.ad_id) return;

//                 setColumns(row);
//                 sheet.addRow(row).commit();
//               })
//               .on("end", resolve)
//               .on("error", reject);

//           });

//         } catch (e) {
//           console.log(`Archive missing for ${table}`);
//         }

//         m.add(1, "month");
//       }
//     }

//     await ExportJob.update(
//       { progress_percent: 40 },
//       { where: { job_id: job.job_id } }
//     );

//     // ---------- LIVE DB STREAM ----------
//     if (needsLive) {

//       let query = `
//         SELECT *
//         FROM "ProofOfPlayLogs"
//         WHERE played_at BETWEEN :start AND :end
//       `;

//       const replacements = {
//         start: job.start_date,
//         end: job.end_date
//       };

//       if (job.device_id) {
//         query += ` AND device_id = :device_id`;
//         replacements.device_id = job.device_id;
//       }

//       if (job.ad_id) {
//         query += ` AND ad_id = :ad_id`;
//         replacements.ad_id = job.ad_id;
//       }

//       client = await sequelize.connectionManager.getConnection();
//       const streamQuery = new QueryStream(query, replacements);
//       const dbStream = client.query(streamQuery);

//       for await (const row of dbStream) {
//         setColumns(row);
//         sheet.addRow(row).commit();
//       }

//       await sequelize.connectionManager.releaseConnection(client);
//     }

//     sheet.commit();
//     await workbook.commit();

//     await ExportJob.update(
//       { progress_percent: 80 },
//       { where: { job_id: job.job_id } }
//     );

//     const upload = await s3.upload({
//       Bucket: process.env.S3_BUCKET,
//       Key: `exports/${job.job_id}.xlsx`,
//       Body: fs.createReadStream(filePath)
//     }).promise();

//     const stats = fs.statSync(filePath);

//     await ExportJob.update({
//       status: "COMPLETED",
//       progress_percent: 100,
//       s3_bucket: upload.Bucket,
//       s3_key: upload.Key,
//       file_size_bytes: stats.size
//     }, {
//       where: { job_id: job.job_id }
//     });

//     fs.unlinkSync(filePath);

//     parentPort.postMessage("done");

//   } catch (err) {

//     if (client) {
//       await sequelize.connectionManager.releaseConnection(client);
//     }

//     await ExportJob.update({
//       status: "FAILED",
//       error_message: err.message
//     }, {
//       where: { job_id: job.job_id }
//     });

//     parentPort.postMessage("failed");
//   }
// }

// runExportJob();

























////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


// const { parentPort, workerData } = require("worker_threads");
// const ExcelJS = require("exceljs");
// const AWS = require("aws-sdk");
// const fs = require("fs");
// const path = require("path");
// const QueryStream = require("pg-query-stream");
// const csv = require("csv-parser");
// const zlib = require("zlib");
// const moment = require("moment");

// const { ExportJob, sequelize } = require("../models");

// const s3 = new AWS.S3({
//    region: process.env.AWS_BUCKET_REGION,
//   accessKeyId: process.env.AWS_ACCESS_KEY,
//   secretAccessKey: process.env.AWS_SECRET_KEY,
// });

// // const s3 = new S3Client({
// //   region : process.env.AWS_BUCKET_REGION,
// //   credentials: {
// //     accessKeyId : process.env.AWS_ACCESS_KEY,
// //     secretAccessKey :process.env.AWS_SECRET_KEY ,
// //   },
// // });
// const ARCHIVE_PREFIX = "proof-of-play-archive";

// async function runExportJob() {

//   const { job } = workerData;
//   let client;
//   let filePath;

//   try {

//     console.log("🚀 Starting export job:", job.job_id);

//     await ExportJob.update(
//       { status: "PROCESSING", progress_percent: 5 },
//       { where: { job_id: job.job_id } }
//     );

//     // Windows-safe temp path
//     const tmpDir = process.platform === "win32" ? path.resolve("./tmp") : "/tmp";
//     if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

//     filePath = path.join(tmpDir, `${job.job_id}.xlsx`);

//     const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
//       filename: filePath
//     });

//     const sheet = workbook.addWorksheet("ProofOfPlay");

//     let columnsSet = false;
//     let hasRows = false;
//     let rowCount = 0;

//     function setColumns(row) {
//       if (!columnsSet) {
//         sheet.columns = Object.keys(row).map(key => ({
//           header: key,
//           key
//         }));
//         columnsSet = true;
//       }
//     }

//     const archiveCutoff = moment().subtract(3, "months");
//     const needsArchive = moment(job.start_date).isBefore(archiveCutoff);
//     const needsLive = moment(job.end_date).isAfter(archiveCutoff);

//     // ================= ARCHIVE =================
//     if (needsArchive) {

//       let m = moment(job.start_date).startOf("month");

//       while (m.isBefore(archiveCutoff)) {

//         const table = `proofofplaylogs_${m.format("YYYY_MM")}`;
//         const key = `ad96-pop/${ARCHIVE_PREFIX}/${table}.csv.gz`;

//         console.log("📦 Reading archive:", key);

//         try {

//           await new Promise((resolve, reject) => {

//             const s3Stream = s3.getObject({
//               Bucket: process.env.S3_BUCKET,
//               Key: key
//             }).createReadStream();

//             s3Stream
//               .on("error", reject)
//               .pipe(zlib.createGunzip())
//               .on("error", reject)
//               .pipe(csv())
//               .on("data", row => {

//                 if (job.device_id && row.device_id !== job.device_id) return;
//                 if (job.ad_id && row.ad_id !== job.ad_id) return;

//                 setColumns(row);
//                 sheet.addRow(row).commit();

//                 hasRows = true;
//                 rowCount++;

//                 if (rowCount % 10000 === 0) {
//                   setImmediate(() => {}); // yield event loop
//                 }
//               })
//               .on("end", resolve)
//               .on("error", reject);
//           });

//         } catch (err) {
//           console.log("error...", err.message)
//           console.log(`⚠️ Archive missing for ${table}`);
//         }

//         m.add(1, "month");
//       }
//     }

//     await ExportJob.update(
//       { progress_percent: 40 },
//       { where: { job_id: job.job_id } }
//     );

//     // ================= LIVE DB =================
//     if (needsLive) {

//       let values = [];
//       let paramIndex = 1;

//       let query = `
//         SELECT *
//         FROM "ProofOfPlayLogs"
//         WHERE start_time BETWEEN $${paramIndex++} AND $${paramIndex++}
//       `;

//       values.push(job.start_date, job.end_date);

//       if (job.device_id) {
//         query += ` AND device_id = $${paramIndex++}`;
//         values.push(job.device_id);
//       }

//       if (job.ad_id) {
//         query += ` AND ad_id = $${paramIndex++}`;
//         values.push(job.ad_id);
//       }

//       client = await sequelize.connectionManager.getConnection();

//       const streamQuery = new QueryStream(query, values, {
//         batchSize: 5000
//       });

//       const dbStream = client.query(streamQuery);

//       await new Promise((resolve, reject) => {

//         dbStream.on("data", row => {

//           dbStream.pause();

//           try {
//             setColumns(row);
//             sheet.addRow(row).commit();

//             hasRows = true;
//             rowCount++;

//             if (rowCount % 10000 === 0) {
//               setImmediate(() => {}); // yield event loop
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

//     // ================= EMPTY CASE =================
//     if (!hasRows) {
//       sheet.columns = [{ header: "message", key: "message" }];
//       sheet.addRow({ message: "No data found for selected filters" }).commit();
//     }

//     sheet.commit();
//     await workbook.commit();

//     await ExportJob.update(
//       { progress_percent: 80 },
//       { where: { job_id: job.job_id } }
//     );

//     // ================= S3 UPLOAD =================
//     const upload = await s3.upload({
//       Bucket: process.env.S3_BUCKET,
//       Key: `ad96-pop/exports/${job.job_id}.xlsx`,
//       Body: fs.createReadStream(filePath)
//     }).promise();

//     const stats = fs.statSync(filePath);

//     await ExportJob.update({
//       status: "COMPLETED",
//       progress_percent: 100,
//       s3_bucket: upload.Bucket,
//       s3_key: upload.Key,
//       file_size_bytes: stats.size
//     }, {
//       where: { job_id: job.job_id }
//     });

//     fs.unlinkSync(filePath);

//     console.log("✅ Export completed:", job.job_id);
//     parentPort.postMessage("done");

//   } catch (err) {

//     console.error("🔥 WORKER FAILED:", err);

//     if (client) {
//       try { await sequelize.connectionManager.releaseConnection(client); }
//       catch {}
//     }

//     if (filePath && fs.existsSync(filePath)) {
//       try { fs.unlinkSync(filePath); }
//       catch {}
//     }

//     await ExportJob.update({
//       status: "FAILED",
//       error_message: err.message
//     }, {
//       where: { job_id: job.job_id }
//     });

//     parentPort.postMessage("failed");
//   }
// }

// runExportJob();











// const { parentPort, workerData } = require("worker_threads");
// const ExcelJS = require("exceljs");
// const AWS = require("aws-sdk");
// const fs = require("fs");
// const path = require("path");
// const QueryStream = require("pg-query-stream");
// const csv = require("csv-parser");
// const zlib = require("zlib");
// const moment = require("moment");

// const { ExportJob, sequelize } = require("../models");

// const s3 = new AWS.S3({
//   region: process.env.AWS_BUCKET_REGION,
//   accessKeyId: process.env.AWS_ACCESS_KEY,
//   secretAccessKey: process.env.AWS_SECRET_KEY,
// });

// const ARCHIVE_PREFIX = "proof-of-play-archive";

// async function runExportJob() {

//   const { job } = workerData;

//   let client;
//   let filePath;

//   try {

//     console.log("🚀 Starting export job:", job.job_id);

//     await ExportJob.update(
//       { status: "PROCESSING", progress_percent: 5 },
//       { where: { job_id: job.job_id } }
//     );

//     const tmpDir = process.platform === "win32" ? path.resolve("./tmp") : "/tmp";
//     if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

//     filePath = path.join(tmpDir, `${job.job_id}.xlsx`);

//     const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
//       filename: filePath,
//       useStyles: false,
//       useSharedStrings: false
//     });

//     // ---------------- SHEET STORAGE ----------------

//     const sheets = {};
//     const sheetRowCount = {};

//     function getRowTime(row) {
//       return row.start_time || row.played_at || row.created_at;
//     }

//     function getMonthKey(row) {
//       const time = getRowTime(row);
//       if (!time) return "Unknown";
//       return moment(time).format("MMM"); // Jan, Feb, Mar
//     }

//     function getMonthlySheet(row) {

//       const monthKey = getMonthKey(row);

//       if (!sheets[monthKey]) {

//         const sheet = workbook.addWorksheet(monthKey);

//         sheet.columns = Object.keys(row).map(key => ({
//           header: key,
//           key
//         }));

//         sheets[monthKey] = sheet;
//         sheetRowCount[monthKey] = 0;
//       }

//       return sheets[monthKey];
//     }

//     function writeRow(row) {

//       const sheet = getMonthlySheet(row);

//       sheet.addRow(row).commit();

//       const monthKey = getMonthKey(row);
//       sheetRowCount[monthKey]++;

//     }

//     // ---------------- DATE RANGE LOGIC ----------------

//     const archiveCutoff = moment().subtract(3, "months");
//     const needsArchive = moment(job.start_date).isBefore(archiveCutoff);
//     const needsLive = moment(job.end_date).isAfter(archiveCutoff);

//     let rowCount = 0;

//     // ================= ARCHIVE STREAM =================

//     if (needsArchive) {

//       let m = moment(job.start_date).startOf("month");

//       while (m.isBefore(archiveCutoff)) {

//         const table = `proofofplaylogs_${m.format("YYYY_MM")}`;
//         const key = `ad96-pop/${ARCHIVE_PREFIX}/${table}.csv.gz`;

//         console.log("📦 Reading archive:", key);

//         try {

//           await new Promise((resolve, reject) => {

//             const s3Stream = s3.getObject({
//               Bucket: process.env.S3_BUCKET,
//               Key: key
//             }).createReadStream();

//             s3Stream
//               .on("error", reject)
//               .pipe(zlib.createGunzip())
//               .on("error", reject)
//               .pipe(csv())
//               .on("data", row => {

//                 if (job.device_id && row.device_id !== job.device_id) return;
//                 if (job.ad_id && row.ad_id !== job.ad_id) return;

//                 writeRow(row);

//                 rowCount++;

//                 if (rowCount % 10000 === 0) {
//                   setImmediate(() => {});
//                 }

//               })
//               .on("end", resolve)
//               .on("error", reject);

//           });

//         } catch (err) {
//           console.log(`⚠️ Archive missing for ${table}`);
//         }

//         m.add(1, "month");
//       }
//     }

//     await ExportJob.update(
//       { progress_percent: 40 },
//       { where: { job_id: job.job_id } }
//     );

//     // ================= LIVE DB STREAM =================

//     if (needsLive) {

//       let values = [];
//       let paramIndex = 1;

//       let query = `
//         SELECT *
//         FROM "ProofOfPlayLogs"
//         WHERE start_time BETWEEN $${paramIndex++} AND $${paramIndex++}
//       `;

//       values.push(job.start_date, job.end_date);

//       if (job.device_id) {
//         query += ` AND device_id = $${paramIndex++}`;
//         values.push(job.device_id);
//       }

//       if (job.ad_id) {
//         query += ` AND ad_id = $${paramIndex++}`;
//         values.push(job.ad_id);
//       }

//       client = await sequelize.connectionManager.getConnection();

//       const streamQuery = new QueryStream(query, values, {
//         batchSize: 5000
//       });

//       const dbStream = client.query(streamQuery);

//       await new Promise((resolve, reject) => {

//         dbStream.on("data", row => {

//           dbStream.pause();

//           try {

//             writeRow(row);

//             rowCount++;

//             if (rowCount % 10000 === 0) {
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

//     // ================= EMPTY CASE =================

//     if (rowCount === 0) {

//       const emptySheet = workbook.addWorksheet("NoData");

//       emptySheet.columns = [
//         { header: "message", key: "message" }
//       ];

//       emptySheet.addRow({
//         message: "No data found for selected filters"
//       }).commit();

//       emptySheet.commit();
//     }

//     // ================= COMMIT MONTHLY SHEETS =================

//     for (const sheet of Object.values(sheets)) {
//       sheet.commit();
//     }

//     // ================= SUMMARY SHEET =================

//     const summarySheet = workbook.addWorksheet("Summary");

//     summarySheet.columns = [
//       { header: "Month", key: "month" },
//       { header: "Total Rows", key: "rows" }
//     ];

//     for (const month in sheetRowCount) {

//       summarySheet.addRow({
//         month,
//         rows: sheetRowCount[month]
//       }).commit();

//     }

//     summarySheet.commit();

//     await workbook.commit();

//     await ExportJob.update(
//       { progress_percent: 80 },
//       { where: { job_id: job.job_id } }
//     );

//     // ================= S3 UPLOAD =================

//     const upload = await s3.upload({
//       Bucket: process.env.S3_BUCKET,
//       Key: `ad96-pop/exports/${job.job_id}.xlsx`,
//       Body: fs.createReadStream(filePath)
//     }).promise();

//     const stats = fs.statSync(filePath);

//     await ExportJob.update({
//       status: "COMPLETED",
//       progress_percent: 100,
//       s3_bucket: upload.Bucket,
//       s3_key: upload.Key,
//       file_size_bytes: stats.size
//     }, {
//       where: { job_id: job.job_id }
//     });

//     fs.unlinkSync(filePath);

//     console.log("✅ Export completed:", job.job_id);

//     parentPort.postMessage("done");

//   } catch (err) {

//     console.error("🔥 WORKER FAILED:", err);

//     if (client) {
//       try { await sequelize.connectionManager.releaseConnection(client); }
//       catch {}
//     }

//     if (filePath && fs.existsSync(filePath)) {
//       try { fs.unlinkSync(filePath); }
//       catch {}
//     }

//     await ExportJob.update({
//       status: "FAILED",
//       error_message: err.message
//     }, {
//       where: { job_id: job.job_id }
//     });

//     parentPort.postMessage("failed");

//   }
// }

// runExportJob();


















/////////////////////////////////// vvvvv 22222222 ////////////////////////////////////////




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

const ARCHIVE_PREFIX = "proof-of-play-archive";

// Excel max rows
const SHEET_MAX_ROWS = 1048575;

async function runExportJob() {
  const { job } = workerData;

  let client;
  let filePath;

  try {
    console.log("🚀 Starting export job:", job.job_id);

    await ExportJob.update(
      { status: "PROCESSING", progress_percent: 5 },
      { where: { job_id: job.job_id } }
    );

    const tmpDir = process.platform === "win32" ? path.resolve("./tmp") : "/tmp";
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

    filePath = path.join(tmpDir, `${job.job_id}.xlsx`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: filePath,
      useStyles: false,
      useSharedStrings: false
    });

    // ---------------- Sheet Management ----------------

    const sheets = {};
    const sheetRowCount = {};
    const sheetIndex = {};

    function getRowTime(row) {
      return row.start_time || row.played_at || row.created_at;
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
          key
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
          key
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
        const table = `proofofplaylogs_${m.format("YYYY_MM")}`;
        const key = `ad96-pop/${ARCHIVE_PREFIX}/${table}.csv.gz`;

        console.log("📦 Reading archive:", key);

        try {
          await new Promise((resolve, reject) => {
            const s3Stream = s3
              .getObject({
                Bucket: process.env.S3_BUCKET,
                Key: key
              })
              .createReadStream();

            s3Stream
              .on("error", reject)
              .pipe(zlib.createGunzip())
              .pipe(csv())
              .on("data", (row) => {
                if (job.device_id && row.device_id !== job.device_id) return;
                if (job.ad_id && row.ad_id !== job.ad_id) return;

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
      { where: { job_id: job.job_id } }
    );

    // ================= POSTGRES STREAM =================

    if (needsLive) {
      let values = [];
      let paramIndex = 1;

      let query = `
        SELECT *
        FROM "ProofOfPlayLogs"
        WHERE start_time BETWEEN $${paramIndex++} AND $${paramIndex++}
      `;

      values.push(job.start_date, job.end_date);

      if (job.device_id) {
        query += ` AND device_id = $${paramIndex++}`;
        values.push(job.device_id);
      }

      if (job.ad_id) {
        query += ` AND ad_id = $${paramIndex++}`;
        values.push(job.ad_id);
      }

      client = await sequelize.connectionManager.getConnection();

      const streamQuery = new QueryStream(query, values, {
        batchSize: 5000
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

    // ================= No Data Case =================

    if (totalRows === 0) {
      const sheet = workbook.addWorksheet("NoData");

      sheet.columns = [{ header: "message", key: "message" }];

      sheet.addRow({
        message: "No data found for selected filters"
      }).commit();

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
      { header: "Total Rows", key: "rows" }
    ];

    for (const sheet in sheetRowCount) {
      summarySheet.addRow({
        sheet,
        rows: sheetRowCount[sheet]
      }).commit();
    }

    summarySheet.commit();

    await workbook.commit();

    await ExportJob.update(
      { progress_percent: 80 },
      { where: { job_id: job.job_id } }
    );

    // ================= Upload to S3 =================

    const upload = await s3
      .upload({
        Bucket: process.env.S3_BUCKET,
        Key: `ad96-pop/exports/${job.job_id}.xlsx`,
        Body: fs.createReadStream(filePath)
      })
      .promise();

    const stats = fs.statSync(filePath);

    await ExportJob.update(
      {
        status: "COMPLETED",
        progress_percent: 100,
        s3_bucket: upload.Bucket,
        s3_key: upload.Key,
        file_size_bytes: stats.size
      },
      { where: { job_id: job.job_id } }
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
        error_message: err.message
      },
      { where: { job_id: job.job_id } }
    );

    parentPort.postMessage("failed");
  }
}

runExportJob();
