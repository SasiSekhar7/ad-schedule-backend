// controllers/dashboardController.js
const asyncHandler = require("express-async-handler");
const { Op, sequelize, fn, col, literal } = require("sequelize"); // Import necessary Sequelize components
const {
  DailyImpressionSummary,
  Ad,
  DeviceGroup,
  Device,
  DeviceEventLog,
  DeviceTelemetryLog,
  ProofOfPlayLog,
  DailyReport,
  ReportEvent,
  ReportOutlier,
} = require("../models"); // Adjust path
const moment = require("moment");
const logger = require("../utils/logger");

// --- HELPER for date validation ---
const validateDateRange = (startDateStr, endDateStr) => {
  const startDate = moment(startDateStr, "YYYY-MM-DD", true);
  const endDate = moment(endDateStr, "YYYY-MM-DD", true);
  if (
    !startDate.isValid() ||
    !endDate.isValid() ||
    startDate.isAfter(endDate)
  ) {
    throw new Error(
      "Invalid date range. Use YYYY-MM-DD format and ensure start date is not after end date.",
    );
  }
  // Return dates suitable for Sequelize query (e.g., Date objects or formatted strings)
  // Using Date objects is generally safer for timestamp comparisons if needed,
  // but YYYY-MM-DD strings work well with DATEONLY columns.
  return {
    startDate: startDate.format("YYYY-MM-DD"),
    endDate: endDate.format("YYYY-MM-DD"),
  };
};

// --- HELPER for pagination ---
const getPagination = (page, pageSize) => {
  const pageNum = parseInt(page, 10);
  const pageSizeNum = parseInt(pageSize, 10);

  if (isNaN(pageNum) || pageNum <= 0)
    throw new Error("Invalid page parameter.");
  if (isNaN(pageSizeNum) || pageSizeNum <= 0)
    throw new Error("Invalid pageSize parameter.");

  const limit = pageSizeNum;
  const offset = (pageNum - 1) * limit;

  return { limit, offset, pageNum, pageSizeNum };
};

// --- HELPER for sorting ---
// Add more mappings as needed based on your UI sort options
const getAdTableOrder = (sortBy, sortOrder = "DESC") => {
  const orderDir = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
  switch (sortBy) {
    case "name":
      // Ensure 'Ad' matches the alias used in your include
      return [[{ model: Ad, as: "Ad" }, "name", orderDir]];
    case "duration":
      return [[{ model: Ad, as: "Ad" }, "duration", orderDir]];
    case "groupsScheduled":
      // Sorting by aggregated counts requires using the alias defined in attributes
      return [[literal("groupsScheduled"), orderDir]]; // Use literal for aggregated alias
    case "impressions":
    default:
      return [[literal("impressions"), orderDir]]; // Default sort by impressions
  }
};

const getGroupTableOrder = (sortBy, sortOrder = "DESC") => {
  const orderDir = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
  switch (sortBy) {
    case "name":
      return [[{ model: DeviceGroup, as: "DeviceGroup" }, "name", orderDir]];
    case "lastPushed":
      return [
        [{ model: DeviceGroup, as: "DeviceGroup" }, "last_pushed", orderDir],
      ];
    case "deviceCount":
      return [[literal("deviceCount"), orderDir]];
    case "impressions":
    default:
      return [[literal("impressions"), orderDir]];
  }
};

// --- Controller Methods ---

// GET /api/dashboard/performance/ads/table
exports.getAdPerformanceTable = asyncHandler(async (req, res) => {
  const {
    startDate: startDateStr,
    endDate: endDateStr,
    page = 1,
    pageSize = 10,
    sortBy,
    sortOrder,
    search,
  } = req.query;
  const { role, client_id } = req.user;

  try {
    const { startDate, endDate } = validateDateRange(startDateStr, endDateStr);
    const { limit, offset, pageNum, pageSizeNum } = getPagination(
      page,
      pageSize,
    );
    const order = getAdTableOrder(sortBy, sortOrder);

    // Base Where Clause for DailyImpressionSummary
    const summaryWhere = {
      summary_date: { [Op.between]: [startDate, endDate] },
    };
    if (role === "Client") {
      summaryWhere.client_id = client_id;
    }

    // Where Clause for included Ad model (for search)
    const adWhere = {};
    if (search) {
      adWhere.name = { [Op.like]: `%${search}%` };
    }

    // const { count, rows } = await DailyImpressionSummary.findAndCountAll({
    //   attributes: [
    //     // Important: Group by Ad attributes, select them via the 'Ad' alias
    //     [col("Ad.ad_id"), "adId"], // Get adId from the Ad model
    //     [col("Ad.name"), "name"],
    //     [col("Ad.duration"), "duration"],
    //     // Aggregations from DailyImpressionSummary
    //     [fn("SUM", col("DailyImpressionSummary.impressions")), "impressions"],
    //     [
    //       fn("COUNT", fn("DISTINCT", col("DailyImpressionSummary.group_id"))),
    //       "groupsScheduled",
    //     ],
    //   ],
    //   include: [
    //     {
    //       model: Ad,
    //       as: "Ad", // *** Crucial: Must match the alias in your association definition ***
    //       attributes: [], // Select Ad attributes in the main attributes array above
    //       where: adWhere,
    //       required: true, // INNER JOIN to filter by ad name search
    //     },
    //   ],
    //   where: summaryWhere,
    //   group: [
    //     // Group by the Ad attributes we are selecting/joining on
    //     col("Ad.ad_id"),
    //     col("Ad.name"),
    //     col("Ad.duration"),
    //   ],
    //   order: order,
    //   limit: limit,
    //   offset: offset,
    //   subQuery: false, // Often needed with limit/offset when including and grouping
    // });

    const { count, rows } = await ProofOfPlayLog.findAndCountAll({
      attributes: [
        [col("Ad.ad_id"), "adId"],
        [col("Ad.name"), "name"],
        [col("Ad.duration"), "duration"],

        [fn("COUNT", col("ProofOfPlayLog.id")), "impressions"],

        [
          fn("COUNT", fn("DISTINCT", col("Device.group_id"))),
          "groupsScheduled",
        ],
      ],

      include: [
        {
          model: Ad,
          as: "Ad",
          attributes: [],
          where: adWhere,
          required: true,
        },
        {
          model: Device,
          attributes: [],
          required: true,
        },
      ],

      where: {
        start_time: { [Op.between]: [startDate, endDate] },
      },

      group: [col("Ad.ad_id"), col("Ad.name"), col("Ad.duration")],

      order,
      limit,
      offset,
      subQuery: false,
    });
    const totalItems = count.length; // findAndCountAll with group returns array of counts, length is total unique groups
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      data: rows.map((row) => row.get({ plain: true })), // Convert Sequelize instances to plain objects
      pagination: {
        currentPage: pageNum,
        pageSize: pageSizeNum,
        totalItems: totalItems,
        totalPages: totalPages,
      },
    });
  } catch (error) {
    logger.logError("Error fetching ads table", error);
    // Return specific validation errors or a generic server error
    res
      .status(error.message.startsWith("Invalid") ? 400 : 500)
      .json({ message: error.message || "Internal server error" });
  }
});

// GET /api/dashboard/performance/groups/table
exports.getGroupPerformanceTable = asyncHandler(async (req, res) => {
  const {
    startDate: startDateStr,
    endDate: endDateStr,
    page = 1,
    pageSize = 10,
    sortBy,
    sortOrder,
    search,
  } = req.query;
  const { role, client_id } = req.user;

  try {
    const { startDate, endDate } = validateDateRange(startDateStr, endDateStr);
    const { limit, offset, pageNum, pageSizeNum } = getPagination(
      page,
      pageSize,
    );
    const order = getGroupTableOrder(sortBy, sortOrder);

    const summaryWhere = {
      summary_date: { [Op.between]: [startDate, endDate] },
    };
    if (role === "Client") {
      summaryWhere.client_id = client_id;
    }

    const groupWhere = {};
    if (search) {
      groupWhere.name = { [Op.like]: `%${search}%` };
    }

    // const { count, rows } = await DailyImpressionSummary.findAndCountAll({
    //   attributes: [
    //     [col("DeviceGroup.group_id"), "groupId"],
    //     [col("DeviceGroup.name"), "name"],
    //     [col("DeviceGroup.last_pushed"), "lastPushed"],
    //     [fn("SUM", col("DailyImpressionSummary.impressions")), "impressions"],
    //     // Count distinct devices associated with the group via the include
    //     [
    //       fn("COUNT", fn("DISTINCT", col("DeviceGroup.Devices.device_id"))),
    //       "deviceCount",
    //     ],
    //   ],
    //   include: [
    //     {
    //       model: DeviceGroup,
    //       as: "DeviceGroup", // *** Crucial: Match association alias ***
    //       attributes: [], // Select group attributes in the main attributes list
    //       where: groupWhere,
    //       required: true, // INNER JOIN
    //       include: [
    //         {
    //           // Include Devices THROUGH DeviceGroup to count them
    //           model: Device,
    //           as: "Devices", // *** Crucial: Match association alias ***
    //           attributes: [], // No need to select device attributes, just counting
    //           required: false, // LEFT JOIN - count groups even if they have 0 devices? Or true for INNER? Let's use false for now.
    //         },
    //       ],
    //     },
    //   ],
    //   where: summaryWhere,
    //   group: [
    //     col("DeviceGroup.group_id"),
    //     col("DeviceGroup.name"),
    //     col("DeviceGroup.last_pushed"),
    //   ],
    //   order: order,
    //   limit: limit,
    //   offset: offset,
    //   subQuery: false, // Important for aggregations + limit with includes
    // });

    const { count, rows } = await ProofOfPlayLog.findAndCountAll({
      attributes: [
        [col("Device.DeviceGroup.group_id"), "groupId"],
        [col("Device.DeviceGroup.name"), "name"],
        [col("Device.DeviceGroup.last_pushed"), "lastPushed"],

        [fn("COUNT", col("ProofOfPlayLog.id")), "impressions"],

        [fn("COUNT", fn("DISTINCT", col("Device.device_id"))), "deviceCount"],
      ],

      include: [
        {
          model: Device,
          attributes: [],
          required: true,
          include: [
            {
              model: DeviceGroup,
              as: "DeviceGroup",
              attributes: [],
              where: groupWhere,
              required: true,
            },
          ],
        },
      ],

      where: {
        start_time: { [Op.between]: [startDate, endDate] },
      },

      group: [
        col("Device.DeviceGroup.group_id"),
        col("Device.DeviceGroup.name"),
        col("Device.DeviceGroup.last_pushed"),
      ],

      order,
      limit,
      offset,
      subQuery: false,
    });
    const totalItems = count.length; // findAndCountAll with group returns array
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      data: rows.map((row) => row.get({ plain: true })),
      pagination: {
        currentPage: pageNum,
        pageSize: pageSizeNum,
        totalItems: totalItems,
        totalPages: totalPages,
      },
    });
  } catch (error) {
    logger.logError("Error fetching groups table", error);
    res
      .status(error.message.startsWith("Invalid") ? 400 : 500)
      .json({ message: error.message || "Internal server error" });
  }
});

// exports.getStats = asyncHandler(async (req, res) => {
//   const { startDate: startDateStr, endDate: endDateStr } = req.query;
//   const { role, client_id } = req.user; // Assumes auth middleware provides this

//   try {
//     // 1. Validate Dates
//     const { startDate, endDate } = validateDateRange(startDateStr, endDateStr);
//     logger.logDebug("Fetching date-range stats", {
//       role,
//       client_id: client_id || "N/A",
//       startDate: startDateStr,
//       endDate: endDateStr,
//     });

//     // 2. Build Base Where Clause for filtering DailyImpressionSummary
//     const summaryWhereClause = {
//       summary_date: { [Op.between]: [startDate, endDate] },
//     };
//     if (role === "Client") {
//       if (!client_id) {
//         // This case should ideally be prevented by auth logic if client ID is mandatory for client role
//         logger.logError("Client role user missing client_id", null, {
//           user_id: req.user.id,
//         });
//         res.status(403);
//         throw new Error("Forbidden: Client ID not found for user.");
//       }
//       summaryWhereClause.client_id = client_id;
//     }

//     // 3. Query Aggregations from DailyImpressionSummary
//     const summaryStats = await DailyImpressionSummary.findOne({
//       attributes: [
//         [fn("SUM", col("impressions")), "totalImpressions"],
//         [fn("COUNT", fn("DISTINCT", col("ad_id"))), "adsScheduledInRange"],
//         [fn("COUNT", fn("DISTINCT", col("group_id"))), "activeGroupsInRange"],
//         // Note: We get activeDevicesInRange in a separate step
//       ],

//       where: summaryWhereClause,
//       raw: true, // Get plain objects directly
//     });

//     // Initialize stats, defaulting nulls to 0
//     const kpiData = {
//       totalImpressions: Number(summaryStats?.totalImpressions) || 0,
//       adsScheduledInRange: Number(summaryStats?.adsScheduledInRange) || 0,
//       activeGroupsInRange: Number(summaryStats?.activeGroupsInRange) || 0,
//       activeDevicesInRange: 0, // Calculate next
//     };

//     // 4. Calculate Active Devices based on Active Groups found
//     if (kpiData.activeGroupsInRange > 0) {
//       // Find the actual group IDs that had summaries in the period/client scope
//       const activeGroupsResult = await DailyImpressionSummary.findAll({
//         attributes: [[fn("DISTINCT", col("group_id")), "groupId"]],
//         where: summaryWhereClause,
//         raw: true,
//       });

//       const activeGroupIds = activeGroupsResult.map((item) => item.groupId);

//       if (activeGroupIds.length > 0) {
//         // Count distinct devices ONLY within those active groups
//         // No need to filter by client_id here again, as groups are already filtered
//         const deviceCount = await Device.count({
//           where: {
//             group_id: { [Op.in]: activeGroupIds },
//           },
//           distinct: true,
//           col: "device_id", // Ensure counting distinct devices
//         });
//         kpiData.activeDevicesInRange = deviceCount;
//       }
//     }

//     // 5. Send Response (wrapped in 'data' object as expected by frontend)
//     res.status(200).json({ data: kpiData });
//   } catch (error) {
//     logger.logError("Error fetching dashboard stats", error);
//     // Return specific validation errors or a generic server error
//     res
//       .status(error.message.startsWith("Invalid") ? 400 : 500)
//       .json({ message: error.message || "Internal server error" });
//   }
// });

// GET /api/dashboard/stats
// Calculates date-range sensitive KPIs
// exports.getStats = asyncHandler(async (req, res) => {
//   const { startDate: startDateStr, endDate: endDateStr } = req.query;
//   const { role, client_id } = req.user; // Assumes auth middleware provides this

//   try {
//     // 1. Validate Dates
//     const { startDate, endDate } = validateDateRange(startDateStr, endDateStr);
//     logger.logDebug("Fetching date-range stats", {
//       role,
//       client_id: client_id || "N/A",
//       startDate: startDateStr,
//       endDate: endDateStr,
//     });

//     // 2. Build Base Where Clause for filtering DailyImpressionSummary
//     const summaryWhereClause = {
//       summary_date: { [Op.between]: [startDate, endDate] },
//     };
//     if (role === "Client") {
//       if (!client_id) {
//         // This case should ideally be prevented by auth logic if client ID is mandatory for client role
//         logger.logError("Client role user missing client_id", null, {
//           user_id: req.user.id,
//         });
//         res.status(403);
//         throw new Error("Forbidden: Client ID not found for user.");
//       }
//       summaryWhereClause.client_id = client_id;
//     }

//     // 3. Query Aggregations from DailyImpressionSummary
//     const summaryStats = await ProofOfPlayLog.findOne({
//       attributes: [
//         [fn("COUNT", col("id")), "totalImpressions"],

//         // Distinct ads played in range
//         [fn("COUNT", fn("DISTINCT", col("ad_id"))), "adsScheduledInRange"],

//         // Distinct devices active in range
//         [fn("COUNT", fn("DISTINCT", col("device_id"))), "activeDevicesInRange"],
//       ],

//       where: {
//         start_time: {
//           [Op.between]: [startDate, endDate],
//         },
//       },

//       raw: true,
//     });

//     // Initialize stats, defaulting nulls to 0
//     const kpiData = {
//       totalImpressions: Number(summaryStats?.totalImpressions) || 0,
//       adsScheduledInRange: Number(summaryStats?.adsScheduledInRange) || 0,
//       activeGroupsInRange: Number(summaryStats?.activeGroupsInRange) || 0,
//       activeDevicesInRange: 0, // Calculate next
//       //add field
//     };

//     const EVENT_KPI_MAP = {
//       deviceCrashes: ["APP_CRASH"],

//       networkIssues: ["NETWORK_DISCONNECTED", "NETWORK_ERROR", "NETWORK_SLOW"],

//       storageIssues: ["STORAGE_WARNING"],

//       diagnosticErrors: ["DIAGNOSTIC_ERROR"],

//       playbackErrors: ["PLAYBACK_ERROR"],
//     };
//     const countEvents = async (eventTypes) => {
//       return DeviceEventLog.count({
//         where: {
//           event_type: { [Op.in]: eventTypes },
//           timestamp: { [Op.between]: [startDate, endDate] },
//         },
//         include: [
//           {
//             model: Device,
//             attributes: [],
//             required: true,
//             ...(role === "Client" && { where: { client_id } }),
//           },
//         ],
//       });
//     };

//     const [
//       networkIssues,
//       storageIssues,
//       deviceCrashes,
//       diagnosticErrors,
//       playbackErrors,
//     ] = await Promise.all([
//       countEvents(EVENT_KPI_MAP.networkIssues),
//       countEvents(EVENT_KPI_MAP.storageIssues),
//       countEvents(EVENT_KPI_MAP.deviceCrashes),
//       countEvents(EVENT_KPI_MAP.diagnosticErrors),
//       countEvents(EVENT_KPI_MAP.playbackErrors),
//     ]);

//     kpiData.networkIssues = networkIssues;
//     kpiData.storageIssues = storageIssues;
//     kpiData.deviceCrashes = deviceCrashes;
//     kpiData.diagnosticErrors = diagnosticErrors;
//     kpiData.playbackErrors = playbackErrors;

//     const [withNetwork, total] = await Promise.all([
//       DeviceTelemetryLog.count({
//         where: {
//           timestamp: { [Op.between]: [startDate, endDate] },
//           network_type: { [Op.not]: null }, // Filter out rows where network_type is null
//         },
//         include: [
//           {
//             model: Device,
//             attributes: [],
//             required: true,
//             ...(role === "Client" && { where: { client_id } }),
//           },
//         ],
//       }),

//       DeviceTelemetryLog.count({
//         where: {
//           timestamp: { [Op.between]: [startDate, endDate] },
//         },
//         include: [
//           {
//             model: Device,
//             attributes: [],
//             required: true,
//             ...(role === "Client" && { where: { client_id } }),
//           },
//         ],
//       }),
//     ]);

//     const networkHealth =
//       total > 0 ? Math.round((withNetwork / total) * 100) : 0;

//     const telemetryStats = await DeviceTelemetryLog.findOne({
//       attributes: [
//         [fn("AVG", col("cpu_usage")), "avgCpuUsage"],
//         [fn("AVG", col("ram_free_mb")), "avgRamFree"],
//         [fn("AVG", col("storage_free_mb")), "avgStorageFree"],
//       ],
//       where: {
//         timestamp: { [Op.between]: [startDate, endDate] },
//       },
//       include: [
//         {
//           model: Device,
//           attributes: [],
//           required: true,
//           ...(role === "Client" && { where: { client_id } }),
//         },
//       ],
//       raw: true,
//     });

//     kpiData.systemHealth = {
//       avgCpuUsage: Number(telemetryStats?.avgCpuUsage || 0),
//       avgRamFree: Number(telemetryStats?.avgRamFree || 0),
//       avgStorageFree: Number(telemetryStats?.avgStorageFree || 0),
//       networkHealth,
//     };

//     const latestTelemetry = await DeviceTelemetryLog.findAll({
//       attributes: [
//         "device_id",
//         "cpu_usage",
//         "ram_free_mb",
//         "storage_free_mb",
//         "timestamp",
//       ],
//       include: [
//         {
//           model: Device,
//           attributes: ["device_name", "location"],
//           required: true,
//           ...(role === "Client" && { where: { client_id } }),
//         },
//       ],
//       order: [["timestamp", "DESC"]],
//       raw: true,
//     });

//     const outliers = [];

//     latestTelemetry.forEach((row) => {
//       if (row.cpu_usage > 85) {
//         outliers.push({
//           device_id: row["Device.device_name"] || row.device_id,
//           location: row["Device.location"],
//           metric: "CPU Usage",
//           value: `${Math.round(row.cpu_usage)}%`,
//           severity: "critical",
//         });
//       }

//       if (row.ram_free_mb < 300) {
//         outliers.push({
//           device_id: row["Device.device_name"] || row.device_id,
//           location: row["Device.location"],
//           metric: "RAM Free",
//           value: `${row.ram_free_mb} MB`,
//           severity: "warning",
//         });
//       }

//       if (row.storage_free_mb < 500) {
//         outliers.push({
//           device_id: row["Device.device_name"] || row.device_id,
//           location: row["Device.location"],
//           metric: "Storage Free",
//           value: `${row.storage_free_mb} MB`,
//           severity: "warning",
//         });
//       }
//     });

//     kpiData.performanceOutliers = outliers.slice(0, 10);

//     const recentEventsRaw = await DeviceEventLog.findAll({
//       attributes: ["event_type", "timestamp", "device_id"],
//       where: {
//         timestamp: { [Op.between]: [startDate, endDate] },
//         event_type: {
//           [Op.in]: [
//             "APP_CRASH",
//             "NETWORK_ERROR",
//             "PLAYBACK_ERROR",
//             "DIAGNOSTIC_ERROR",
//             "STORAGE_WARNING",
//           ],
//         },
//       },
//       include: [
//         {
//           model: Device,
//           attributes: ["device_name", "location"],
//           required: true,
//           ...(role === "Client" && { where: { client_id } }),
//         },
//       ],
//       order: [["timestamp", "DESC"]],
//       limit: 10,
//       raw: true,
//     });

//     const recentEvents = recentEventsRaw.map((row, index) => ({
//       id: index + 1,
//       event_type: row.event_type,
//       timestamp: row.timestamp,
//       device: row["Device.device_name"] || row.device_id,
//       location: row["Device.location"],
//     }));

//     kpiData.recentEvents = recentEvents;

//     // 4. Calculate Active Devices based on Active Groups found
//     if (kpiData.activeGroupsInRange > 0) {
//       // Find the actual group IDs that had summaries in the period/client scope
//       const activeGroupsResult = await DailyImpressionSummary.findAll({
//         attributes: [[fn("DISTINCT", col("group_id")), "groupId"]],
//         where: summaryWhereClause,
//         raw: true,
//       });

//       const activeGroupIds = activeGroupsResult.map((item) => item.groupId);

//       if (activeGroupIds.length > 0) {
//         // Count distinct devices ONLY within those active groups
//         // No need to filter by client_id here again, as groups are already filtered
//         const deviceCount = await Device.count({
//           where: {
//             group_id: { [Op.in]: activeGroupIds },
//           },
//           distinct: true,
//           col: "device_id", // Ensure counting distinct devices
//         });
//         kpiData.activeDevicesInRange = deviceCount;
//       }
//     }

//     // 5. Send Response (wrapped in 'data' object as expected by frontend)
//     res.status(200).json({ data: kpiData });
//   } catch (error) {
//     logger.logError("Error fetching dashboard stats", error);
//     // Return specific validation errors or a generic server error
//     res
//       .status(error.message.startsWith("Invalid") ? 400 : 500)
//       .json({ message: error.message || "Internal server error" });
//   }
// });

exports.getStats = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const { role, client_id } = req.user;

  const whereClause = {
    report_date: {
      [Op.between]: [startDate, endDate],
    },
  };

  if (role === "Client") {
    whereClause.client_id = client_id;
  }

  const reports = await DailyReport.findAll({
    where: whereClause,
    order: [["report_date", "ASC"]],
    raw: true,
  });

  if (!reports.length) {
    return res.status(200).json({ data: null });
  }

  const reportIds = reports.map((r) => r.report_id);

  const events = await ReportEvent.findAll({
    where: { report_id: { [Op.in]: reportIds } },
    order: [["event_timestamp", "DESC"]],
    raw: true,
  });

  const outliers = await ReportOutlier.findAll({
    where: { report_id: { [Op.in]: reportIds } },
    raw: true,
  });

  const finalData = {
    totalImpressions: 0,
    adsScheduledInRange: 0,
    activeDevicesInRange: 0,
    networkIssues: 0,
    storageIssues: 0,
    deviceCrashes: 0,
    diagnosticErrors: 0,
    playbackErrors: 0,
    systemHealth: {
      avgCpuUsage: 0,
      avgRamFree: 0,
      avgStorageFree: 0,
      networkHealth: 0,
    },
  };

  reports.forEach((row) => {
    finalData.totalImpressions += Number(row.total_impressions || 0);
    finalData.adsScheduledInRange += Number(row.ads_scheduled || 0);
    finalData.activeDevicesInRange += Number(row.active_devices || 0);

    finalData.networkIssues += Number(row.network_issues || 0);
    finalData.storageIssues += Number(row.storage_issues || 0);
    finalData.deviceCrashes += Number(row.device_crashes || 0);
    finalData.diagnosticErrors += Number(row.diagnostic_errors || 0);
    finalData.playbackErrors += Number(row.playback_errors || 0);

    finalData.systemHealth.avgCpuUsage += Number(row.avg_cpu_usage || 0);
    finalData.systemHealth.avgRamFree += Number(row.avg_ram_free || 0);
    finalData.systemHealth.avgStorageFree += Number(row.avg_storage_free || 0);
    finalData.systemHealth.networkHealth += Number(row.network_health || 0);
  });

  const days = reports.length;

  finalData.systemHealth.avgCpuUsage /= days;
  finalData.systemHealth.avgRamFree /= days;
  finalData.systemHealth.avgStorageFree /= days;
  finalData.systemHealth.networkHealth /= days;

  outliers.sort((a, b) => (a.severity === "critical" ? -1 : 1));

  const finalOutliers = outliers.slice(0, 10);

  const finalEvents = events.slice(0, 10).map((e) => ({
    device: e.device_name,
    location: e.location,
    event_type: e.event_type,
    timestamp: e.event_timestamp,
  }));

  return res.status(200).json({
    data: {
      ...finalData,
      performanceOutliers: finalOutliers,
      recentEvents: finalEvents,
    },
  });
});
