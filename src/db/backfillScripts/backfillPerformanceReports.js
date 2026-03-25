const {
  generateDailyAdPerformance,
  generateDailyGroupPerformance,
} = require("../../services/generatePerformanceSummary");

const { ProofOfPlayLog } = require("../../models");

async function getEarliestDate() {
  const earliest = await ProofOfPlayLog.min("start_time");

  if (!earliest) return null;

  const date = new Date(earliest);
  date.setHours(0, 0, 0, 0);

  return date;
}

async function backfillPerformanceReports() {
  try {
    console.log("Starting Performance Backfill...");

    const startDate = new Date('2025-01-01');

    if (!startDate) {
      console.log("No ProofOfPlayLog data found.");
      return;
    }

    console.log("Earliest Log Date:", startDate);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let currentDate = new Date(startDate);

    while (currentDate < today) {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);

      console.log(
        `Generating performance for ${start.toISOString().split("T")[0]}`,
      );

      await generateDailyAdPerformance({
        startDate: start,
        endDate: end,
      });

      await generateDailyGroupPerformance({
        startDate: start,
        endDate: end,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log("Performance Backfill Completed");
    process.exit(0);
  } catch (error) {
    console.error("Backfill Error:", error);
    process.exit(1);
  }
}

backfillPerformanceReports();
