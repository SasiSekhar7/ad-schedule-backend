const { Op, fn, col } = require("sequelize");
const {
  ProofOfPlayLog,
  DeviceEventLog,
  DeviceTelemetryLog,
  Device,
  DeviceGroup,
} = require("../models");

async function generateStats({ startDate, endDate, client_id = null }) {
  // ----------------------------------
  // 1️Base Filter for Client Scope
  // ----------------------------------

  const deviceIncludeFilter = {
    model: Device,
    attributes: [],
    required: true,
    include: client_id
      ? [
          {
            model: DeviceGroup,
            attributes: [],
            required: true,
            where: { client_id },
          },
        ]
      : [],
  };

  // ----------------------------------
  // 2Proof Of Play Stats
  // ----------------------------------

  const popStats = await ProofOfPlayLog.findOne({
    attributes: [
      [fn("COUNT", col("ProofOfPlayLog.id")), "totalImpressions"],
      [
        fn("COUNT", fn("DISTINCT", col("ProofOfPlayLog.ad_id"))),
        "adsScheduledInRange",
      ],
      [
        fn("COUNT", fn("DISTINCT", col("ProofOfPlayLog.device_id"))),
        "activeDevicesInRange",
      ],
    ],
    where: {
      start_time: {
        [Op.between]: [startDate, endDate],
      },
    },
    include: [deviceIncludeFilter],
    raw: true,
  });

  const kpiData = {
    totalImpressions: Number(popStats?.totalImpressions) || 0,
    adsScheduledInRange: Number(popStats?.adsScheduledInRange) || 0,
    activeDevicesInRange: Number(popStats?.activeDevicesInRange) || 0,
  };

  // ----------------------------------
  // 3️Event KPIs
  // ----------------------------------

  const EVENT_KPI_MAP = {
    deviceCrashes: ["APP_CRASH"],
    networkIssues: ["NETWORK_DISCONNECTED", "NETWORK_ERROR", "NETWORK_SLOW"],
    storageIssues: ["STORAGE_WARNING"],
    diagnosticErrors: ["DIAGNOSTIC_ERROR"],
    playbackErrors: ["PLAYBACK_ERROR"],
  };

  const countEvents = async (eventTypes) => {
    return DeviceEventLog.count({
      where: {
        event_type: { [Op.in]: eventTypes },
        timestamp: { [Op.between]: [startDate, endDate] },
      },
      include: [deviceIncludeFilter],
    });
  };

  const [
    networkIssues,
    storageIssues,
    deviceCrashes,
    diagnosticErrors,
    playbackErrors,
  ] = await Promise.all([
    countEvents(EVENT_KPI_MAP.networkIssues),
    countEvents(EVENT_KPI_MAP.storageIssues),
    countEvents(EVENT_KPI_MAP.deviceCrashes),
    countEvents(EVENT_KPI_MAP.diagnosticErrors),
    countEvents(EVENT_KPI_MAP.playbackErrors),
  ]);

  kpiData.networkIssues = networkIssues;
  kpiData.storageIssues = storageIssues;
  kpiData.deviceCrashes = deviceCrashes;
  kpiData.diagnosticErrors = diagnosticErrors;
  kpiData.playbackErrors = playbackErrors;

  // ----------------------------------
  // 4️Network Health %
  // ----------------------------------

  const [withNetwork, totalTelemetry] = await Promise.all([
    DeviceTelemetryLog.count({
      where: {
        timestamp: { [Op.between]: [startDate, endDate] },
        network_type: { [Op.not]: null },
      },
      include: [deviceIncludeFilter],
    }),
    DeviceTelemetryLog.count({
      where: {
        timestamp: { [Op.between]: [startDate, endDate] },
      },
      include: [deviceIncludeFilter],
    }),
  ]);

  const networkHealth =
    totalTelemetry > 0 ? Math.round((withNetwork / totalTelemetry) * 100) : 0;

  // ----------------------------------
  // 5️System Health (Averages)
  // ----------------------------------

  const telemetryStats = await DeviceTelemetryLog.findOne({
    attributes: [
      [fn("AVG", col("DeviceTelemetryLog.cpu_usage")), "avgCpuUsage"],
      [fn("AVG", col("DeviceTelemetryLog.ram_free_mb")), "avgRamFree"],
      [fn("AVG", col("DeviceTelemetryLog.storage_free_mb")), "avgStorageFree"],
    ],
    where: {
      timestamp: { [Op.between]: [startDate, endDate] },
    },
    include: [deviceIncludeFilter],
    raw: true,
  });

  kpiData.systemHealth = {
    avgCpuUsage: Number(telemetryStats?.avgCpuUsage || 0),
    avgRamFree: Number(telemetryStats?.avgRamFree || 0),
    avgStorageFree: Number(telemetryStats?.avgStorageFree || 0),
    networkHealth,
  };

  // ----------------------------------
  // 6Performance Outliers
  // ----------------------------------

  const latestTelemetry = await DeviceTelemetryLog.findAll({
    attributes: [
      "device_id",
      "cpu_usage",
      "ram_free_mb",
      "storage_free_mb",
      "timestamp",
    ],
    include: [
      {
        model: Device,
        attributes: ["device_name", "location"],
        required: true,
        include: client_id
          ? [
              {
                model: DeviceGroup,
                attributes: [],
                required: true,
                where: { client_id },
              },
            ]
          : [],
      },
    ],
    order: [["timestamp", "DESC"]],
    raw: true,
  });

  const outliers = [];

  latestTelemetry.forEach((row) => {
    if (row.cpu_usage > 85) {
      outliers.push({
        device: row["Device.device_name"] || row.device_id,
        location: row["Device.location"],
        metric: "CPU Usage",
        value: `${Math.round(row.cpu_usage)}%`,
        severity: "critical",
      });
    }

    if (row.ram_free_mb < 300) {
      outliers.push({
        device: row["Device.device_name"] || row.device_id,
        location: row["Device.location"],
        metric: "RAM Free",
        value: `${row.ram_free_mb} MB`,
        severity: "warning",
      });
    }

    if (row.storage_free_mb < 500) {
      outliers.push({
        device: row["Device.device_name"] || row.device_id,
        location: row["Device.location"],
        metric: "Storage Free",
        value: `${row.storage_free_mb} MB`,
        severity: "warning",
      });
    }
  });

  kpiData.performanceOutliers = outliers.slice(0, 10);

  // ----------------------------------
  // 7️Recent Critical Events
  // ----------------------------------

  const recentEventsRaw = await DeviceEventLog.findAll({
    attributes: ["event_type", "timestamp", "device_id"],
    where: {
      timestamp: { [Op.between]: [startDate, endDate] },
      event_type: {
        [Op.in]: [
          "APP_CRASH",
          "NETWORK_ERROR",
          "PLAYBACK_ERROR",
          "DIAGNOSTIC_ERROR",
          "STORAGE_WARNING",
        ],
      },
    },
    include: [
      {
        model: Device,
        attributes: ["device_name", "location"],
        required: true,
        include: client_id
          ? [
              {
                model: DeviceGroup,
                attributes: [],
                required: true,
                where: { client_id },
              },
            ]
          : [],
      },
    ],
    order: [["timestamp", "DESC"]],
    limit: 10,
    raw: true,
  });

  kpiData.recentEvents = recentEventsRaw.map((row, index) => ({
    id: index + 1,
    event_type: row.event_type,
    timestamp: row.timestamp,
    device: row["Device.device_name"] || row.device_id,
    location: row["Device.location"],
  }));

  return kpiData;
}

module.exports = { generateStats };
