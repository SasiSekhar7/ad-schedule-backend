const cron = require("node-cron");
const { DeviceGroup } = require("../models");
const { pushToGroupQueue } = require("../controllers/queueController");
const { updateUpcomingMatches } = require("../controllers/cricketController");
const logger = require("../utils/logger");

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
  }
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
  }
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
