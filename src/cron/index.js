const cron = require("node-cron");
const { DeviceGroup, DailyReport, Client } = require("../models");
const { pushToGroupQueue } = require("../controllers/queueController");
const { updateUpcomingMatches } = require("../controllers/cricketController");
const logger = require("../utils/logger");
const { checkClientExpiry } = require("../services/subscriptionService");
const {
  generateDailyPerformanceReports,
} = require("../services/generatePerformanceSummary");

const { generateDailyReport } = require("../services/reportGenerator");

// Function to be executed at 6 AM daily
async function dailySchedulePush() {
  try {
    logger.logInfo("Starting daily schedule push");
    const groups = await DeviceGroup.findAll({ attributes: ["group_id"] });

    const groupIds = groups.map((grp) => grp.group_id);
    logger.logInfo("Pushing schedules to groups", {
      groupCount: groupIds.length,
    });

    await pushToGroupQueue(groupIds);
    logger.logInfo("Daily schedule push completed successfully");
  } catch (error) {
    logger.logError("Error in daily schedule push", error);
  }
}

// Schedule the task to run every day at 6 AM
cron.schedule(
  "05 06 * * *",
  async () => {
    logger.logInfo("Running scheduled task at 6:05 AM IST");
    await dailySchedulePush();
    await updateUpcomingMatches();
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata", // India timezone
  },
);

cron.schedule(
  "12 15 * * *",
  async () => {
    logger.logInfo("Running scheduled task at 3:12 PM IST");
    await dailySchedulePush();
    await updateUpcomingMatches();
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata", // India timezone
  },
);

logger.logInfo("Cron jobs initialized", {
  jobs: [
    "Daily schedule push at 6:05 AM IST",
    "Daily schedule push at 3:12 PM IST",
  ],
});

// cron.schedule('15 15 * * *', async() => {
//     // await updateUpcomingMatches();
//     await startLiveMatchStreaming();

// }, {
//     scheduled: true,
//     timezone: "Asia/Kolkata" // India timezone
// });

// cron.schedule('15 19 * * *', async() => {
//     // await updateUpcomingMatches();
//     await startLiveMatchStreaming();

// }, {
//     scheduled: true,
//     timezone: "Asia/Kolkata" // India timezone
// });

//client plan expiry check cron ,Subscription expiry cron
cron.schedule(
  "30 02 * * *", // 2:30 AM IST (best practice → night)
  async () => {
    logger.logInfo("Running subscription expiry cron");
    await checkClientExpiry();
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata",
  },
);

cron.schedule("11 10 * * *", async () => {
  //   console.log("Running daily JSON report cron 👉 every day at 3:30 PM...");
  //   });

  // cron.schedule("0 1 * * *", async () => {
  console.log("Running Daily Report Cron...");

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const startDate = new Date(yesterday.setHours(0, 0, 0, 0));
  const endDate = new Date(yesterday.setHours(23, 59, 59, 999));

  try {
    // GLOBAL REPORT
    await generateDailyReport({
      startDate,
      endDate,
      client_id: null,
    });

    // CLIENT REPORTS
    const clients = await Client.findAll({
      attributes: ["client_id"],
      raw: true,
    });

    for (const client of clients) {
      await generateDailyReport({
        startDate,
        endDate,
        client_id: client.client_id,
      });
    }

    console.log("Daily Reports Generated Successfully");
  } catch (error) {
    console.error("Cron Error:", error);
  }
});

cron.schedule("28 12 * * *", async () => {
  await generateDailyPerformanceReports();
});
