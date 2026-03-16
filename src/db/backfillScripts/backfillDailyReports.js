const { generateDailyReport } = require("../../services/reportGenerator");
const {
  Client,
  ProofOfPlayLog,
  DeviceTelemetryLog,
  DeviceEventLog,
  sequelize,
} = require("../../models");

const { fn, col } = require("sequelize");

// Ye script database ke purane logs se automatic daily reports generate karne ke liye use ho rahi hai. Isko backfill script bolte hain.
// Matlab agar pehle reports generate nahi hui thi, to ye script earliest log date se leke aaj tak har din ki report generate karegi.

// Its job is to find the oldest log date in the database.
async function getEarliestDate() {
  const [pop, telemetry, events] = await Promise.all([
    ProofOfPlayLog.min("start_time"),
    DeviceTelemetryLog.min("timestamp"),
    DeviceEventLog.min("timestamp"),
  ]);

  const dates = [pop, telemetry, events].filter(Boolean);

  const earliest = new Date(Math.min(...dates.map((d) => new Date(d))));

  earliest.setHours(0, 0, 0, 0);

  return earliest;
}

async function backfillDailyReports() {
  try {
    console.log("Starting Automatic Backfill...");

    const startDate = await getEarliestDate();

    if (!startDate) {
      console.log("No logs found in database.");
      return;
    }

    console.log("Earliest Log Found:", startDate);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const clients = await Client.findAll({
      attributes: ["client_id"],
      raw: true,
    });

    let currentDate = new Date(startDate);

    while (currentDate < today) {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);

      console.log(`Generating report for ${start.toISOString().split("T")[0]}`);

      // GLOBAL
      await generateDailyReport({
        startDate: start,
        endDate: end,
        client_id: null,
      });

      // CLIENT REPORTS
      for (const client of clients) {
        await generateDailyReport({
          startDate: start,
          endDate: end,
          client_id: client.client_id,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log("Backfill Completed Successfully");
    process.exit(0);
  } catch (error) {
    console.error("Backfill Error:", error);
    process.exit(1);
  }
}

backfillDailyReports();
