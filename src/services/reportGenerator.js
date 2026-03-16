const {
  DailyReport,
  ReportEvent,
  ReportOutlier,
  Client,
} = require("../models");
const { generateStats } = require("./generateStats");

async function generateDailyReport({ startDate, endDate, client_id = null }) {
  const stats = await generateStats({
    startDate,
    endDate,
    client_id,
  });

  const [report] = await DailyReport.upsert({
    report_date: startDate,
    client_id,

    total_impressions: stats.totalImpressions,
    ads_scheduled: stats.adsScheduledInRange,
    active_devices: stats.activeDevicesInRange,

    network_issues: stats.networkIssues,
    storage_issues: stats.storageIssues,
    device_crashes: stats.deviceCrashes,
    diagnostic_errors: stats.diagnosticErrors,
    playback_errors: stats.playbackErrors,

    avg_cpu_usage: stats.systemHealth.avgCpuUsage,
    avg_ram_free: stats.systemHealth.avgRamFree,
    avg_storage_free: stats.systemHealth.avgStorageFree,
    network_health: stats.systemHealth.networkHealth,
  });

  const reportId = report.report_id || report[0].report_id;

  // Insert Events
  if (stats.recentEvents?.length) {
    await ReportEvent.bulkCreate(
      stats.recentEvents.map((e) => ({
        report_id: reportId,
        device_name: e.device,
        location: e.location,
        event_type: e.event_type,
        event_timestamp: e.timestamp,
      })),
    );
  }

  // Insert Outliers
  if (stats.performanceOutliers?.length) {
    await ReportOutlier.bulkCreate(
      stats.performanceOutliers.map((o) => ({
        report_id: reportId,
        device_name: o.device,
        location: o.location,
        metric: o.metric,
        value: o.value,
        severity: o.severity,
      })),
    );
  }

  return report;
}

async function generateDailyReportsForAllClients() {
  const today = new Date();
  const yesterday = new Date(today);

  yesterday.setDate(today.getDate() - 1);

  const startDate = new Date(yesterday.setHours(0, 0, 0, 0));
  const endDate = new Date(yesterday.setHours(23, 59, 59, 999));

  // GLOBAL REPORT
  // await generateDailyReport({
  //   startDate,
  //   endDate,
  //   client_id: null,
  // });

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
}

module.exports = { generateDailyReport, generateDailyReportsForAllClients };
