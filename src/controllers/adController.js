const path = require("path");
const fs = require("fs");
const {
  Ad,
  ProofOfPlayLog,
  Device,
  DeviceTelemetryLog,
  DeviceEventLog,
  Schedule,
} = require("../models");

// const { where } = require("sequelize");
const { Op, fn, col, literal } = require("sequelize");
const { getBucketURL } = require("./s3Controller");
const logger = require("../utils/logger");

const ad_Egress_lambda_url = process.env.AD_EGRESS_LAMBDA_URL;
const use_ad_egress_lambda = process.env.USE_AD_EGRESS_LAMBDA;

module.exports.sendAdDetails = async (req, res) => {
  try {
    if (!req.params.id) {
      res.status(400).json({ message: "no poarameter ad_id found " });
    }
    const ad = await Ad.findOne({ where: { ad_id: req.params.id } });
    let url;
    if (use_ad_egress_lambda == "true" || use_ad_egress_lambda == true) {
      url =
        ad_Egress_lambda_url + "/" + ad.ad_id + "." + ad.url.split(".").pop();
    } else {
      url = await getBucketURL(ad.url);
    }

    const data = {
      ...ad.dataValues,
      url,
    };
    res.json({ data });
  } catch (error) {
    logger.logError("Error sending ad details", error, {
      ad_id: req.params.id,
    });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports.sendAdFile = async (req, res) => {
  try {
    const filePath = path.join(__dirname, "..", "uploads/ads", req.params.path);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "Video not found!" });
    }
  } catch (error) {
    logger.logError("Error sending ad file", error, { path: req.params.path });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};



module.exports.getAdDetails = async (req, res) => {
  try {
    const { ad_id } = req.params;
    const { start_date, end_date } = req.query;

    // ---------------------------
    // 1. DATE RANGE (DEFAULT: WEEKLY)
    // ---------------------------
    let startDate, endDate;

    if (start_date && end_date) {
      startDate = new Date(start_date);
      endDate = new Date(end_date);
    } else {
      endDate = new Date();
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    // ---------------------------
    // 2. GET AD INFO
    // ---------------------------
    const ad = await Ad.findOne({
      where: { ad_id },
    });

    if (!ad) {
      return res.status(404).json({ message: "Ad not found" });
    }

    // ---------------------------
    // 3. KPI CALCULATIONS
    // ---------------------------
    const totalStats = await ProofOfPlayLog.findAll({
      where: {
        ad_id,
        start_time: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        [fn("COUNT", col("id")), "total_plays"],
        [fn("AVG", col("duration_played_ms")), "avg_duration"],
      ],
      raw: true,
    });

    const totalPlays = parseInt(totalStats[0]?.total_plays || 0);
    const avgDuration = parseFloat(totalStats[0]?.avg_duration || 0);

    // ---------------------------
    // 4. PERFORMANCE TREND
    // ---------------------------
    const rawPerformance = await ProofOfPlayLog.findAll({
      where: {
        ad_id,
        start_time: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        [fn("DATE", col("start_time")), "date"],
        [fn("COUNT", col("id")), "plays"],
      ],
      group: [fn("DATE", col("start_time"))],
      order: [[fn("DATE", col("start_time")), "ASC"]],
      raw: true,
    });

    const performance = rawPerformance.map((p) => {
      const dateObj = new Date(p.date);

      return {
        date: dateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        plays: Number(p.plays),
        impressions: Number(p.plays),
      };
    });

    // ---------------------------
    // 5. DEVICE DISTRIBUTION
    // ---------------------------
    const deviceStats = await ProofOfPlayLog.findAll({
      where: {
        ad_id,
        start_time: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        [col("Device.device_type"), "device_type"],
        [fn("COUNT", col("ProofOfPlayLog.id")), "plays"],
      ],
      include: [
        {
          model: Device,
          attributes: [],
        },
      ],
      group: ["Device.device_type"],
      raw: true,
    });

    const totalDevicePlays = deviceStats.reduce(
      (sum, d) => sum + parseInt(d.plays || 0),
      0,
    );

    const deviceDistribution = deviceStats.map((d) => ({
      name: d.device_type,
      plays: parseInt(d.plays),
      value:
        totalDevicePlays > 0
          ? Math.round((d.plays / totalDevicePlays) * 100)
          : 0,
    }));

    // ---------------------------
    // 6. HOURLY DATA
    // ---------------------------
    const hourlyStats = await ProofOfPlayLog.findAll({
      where: {
        ad_id,
        start_time: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        [fn("DATE_TRUNC", "hour", col("start_time")), "hour"],
        [fn("COUNT", col("id")), "plays"],
      ],
      group: [fn("DATE_TRUNC", "hour", col("start_time"))],
      order: [[fn("DATE_TRUNC", "hour", col("start_time")), "ASC"]],
      raw: true,
    });

    const hourlyData = hourlyStats.map((h) => ({
      hour: new Date(h.hour).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      plays: parseInt(h.plays),
    }));

    // ---------------------------
    // 7. PLAY LOGS
    // ---------------------------
    const logs = await ProofOfPlayLog.findAll({
      where: {
        ad_id,
        start_time: {
          [Op.between]: [startDate, endDate],
        },
      },
      include: [
        {
          model: Device,
          attributes: ["device_name", "device_type", "location"],
        },
      ],
      order: [["start_time", "DESC"]],
      limit: 50,
    });

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      device: log.Device?.device_name,
      deviceType: log.Device?.device_type,
      location: log.Device?.location,
      playDate: log.start_time,
      duration: Math.round(log.duration_played_ms / 1000),
      engagement: Math.min(
        100,
        Math.round((log.duration_played_ms / (ad.duration * 1000)) * 100),
      ),
      status: "completed",
    }));

    // ---------------------------
    // 8. FINAL CALCULATIONS
    // ---------------------------
    const cappedAvgDuration = Math.min(avgDuration, ad.duration * 1000);

    const engagementRate =
      totalPlays > 0
        ? Math.round((cappedAvgDuration / (ad.duration * 1000)) * 100)
        : 0;

    // ---------------------------
    // FINAL RESPONSE
    // ---------------------------
    res.json({
      ad: {
        id: ad.ad_id,
        name: ad.name,
        status: ad.status,
        duration: ad.duration,
        createdDate: ad.created_at,
      },

      filters: {
        startDate,
        endDate,
      },

      kpis: {
        totalPlays,
        avgWatchTime: totalPlays > 0 ? Math.floor(cappedAvgDuration / 1000) : 0,
        engagementRate: Math.min(100, engagementRate),
        impressions: totalPlays,
      },

      performance,
      deviceDistribution,
      hourlyData,
      logs: formattedLogs,
    });
  } catch (error) {
    logger.logError("Error fetching ad details", error, {
      ad_id: req.params.ad_id,
    });
    res.status(500).json({ message: "Server Error", error });
  }
};
module.exports.getDeviceDetailsStatistics = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { start_date, end_date } = req.query;

    let startDate, endDate;

    if (start_date && end_date) {
      startDate = new Date(start_date);
      endDate = new Date(end_date);
    } else {
      endDate = new Date();
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    // ---------------------------
    // 1. DEVICE INFO
    // ---------------------------
    const device = await Device.findOne({
      where: { device_id },
    });

    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    // ---------------------------
    // 2. KPI METRICS (24h)
    // ---------------------------
    const kpiStats = await ProofOfPlayLog.findAll({
      where: {
        device_id,
        start_time: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        [fn("COUNT", col("id")), "total_plays"],
        [fn("AVG", col("duration_played_ms")), "avg_duration"],
      ],
      raw: true,
    });

    const totalPlays = parseInt(kpiStats[0]?.total_plays || 0);
    const avgDuration = parseFloat(kpiStats[0]?.avg_duration || 0);

    // ---------------------------
    // 3. PERFORMANCE TREND (30 days)
    // ---------------------------
    const rawPerformance = await ProofOfPlayLog.findAll({
      where: {
        device_id,
        start_time: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        [fn("DATE", col("start_time")), "date"],
        [fn("COUNT", col("id")), "plays"],
      ],
      group: [fn("DATE", col("start_time"))],
      order: [[fn("DATE", col("start_time")), "ASC"]],
      raw: true,
    });

    const performance = rawPerformance.map((p) => {
      const d = new Date(p.date);
      return {
        date: d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        plays: Number(p.plays),
        impressions: Number(p.plays),
        errors: 0, // optional
      };
    });

    // ---------------------------
    // 4. NETWORK DISTRIBUTION
    // ---------------------------
    const networkStats = await DeviceTelemetryLog.findAll({
      where: {
        device_id,
        timestamp: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: ["network_type", [fn("COUNT", col("network_type")), "count"]],
      group: ["network_type"],
      raw: true,
    });

    const totalNetwork = networkStats.reduce(
      (sum, n) => sum + parseInt(n.count),
      0,
    );

    const networkDistribution = networkStats.map((n) => ({
      name: n.network_type || "Unknown",
      value: Math.round((n.count / totalNetwork) * 100),
    }));

    // ---------------------------
    // 5. PLAY LOGS
    // ---------------------------
    const logs = await ProofOfPlayLog.findAll({
      where: { device_id ,

        start_time: {
          [Op.between]: [startDate, endDate],
        },

      },
      
      include: [
        {
          model: Ad,
          attributes: ["name", "duration"],
        },
        {
          model: Schedule,
          attributes: ["schedule_id"],
        },
      ],
      order: [["start_time", "DESC"]],
      limit: 20,
    });

    const formattedLogs = logs.map((log) => {
      const duration = log.duration_played_ms / 1000;
      const completion = log.Ad?.duration
        ? (duration / log.Ad.duration) * 100
        : 0;

      return {
        id: log.id,
        ad_name: log.Ad?.name,
        ad_id: log.ad_id,
        duration: duration,
        completion: Math.min(100, Math.round(completion)),
        schedule: log.Schedule?.schedule_id || "N/A",
      };
    });

    // ---------------------------
    // 6. TELEMETRY (HOURLY)
    // ---------------------------
    const selectedDate = "2026-02-25";
    const telemetry = await DeviceTelemetryLog.findAll({
      where: {
        device_id,
        timestamp: {
          [Op.between]: [startDate, endDate],
        },
      },
      order: [["timestamp", "ASC"]],
      raw: true,
    });

    const telemetryData = telemetry.map((t) => ({
      time: new Date(t.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      cpu_usage: t.cpu_usage,
      ram_free_mb: t.ram_free_mb,
      storage_free_mb: t.storage_free_mb,
      network_type: t.network_type,
    }));

    // ---------------------------
    // 7. DEVICE EVENTS
    // ---------------------------
    const events = await DeviceEventLog.findAll({
      where: { device_id },
      order: [["timestamp", "DESC"]],
      limit: 20,
      raw: true,
    });

    const formattedEvents = events.map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      event_type: e.event_type,
      payload: e.payload,
    }));

    const eventTypes = [
      "APP_CRASH",
      "CONTENT_DOWNLOAD_FAILED",
      "PLAYBACK_ERROR",
      "PLAYBACK_SKIPPED",
      "NETWORK_ERROR",
      "NETWORK_SLOW",
      "DIAGNOSTIC_WARNING",
      "DIAGNOSTIC_ERROR",
      "SETTINGS_CHANGED",
      "MEMORY_WARNING",
      "STORAGE_WARNING",
      "PERFORMANCE_ISSUE",
    ];

    const aggregatedEvents = await DeviceEventLog.findAll({
      where: {
        device_id,
        timestamp: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        [
          literal(`
        date_trunc('hour', "timestamp") +
        floor(date_part('minute', "timestamp") / 30) * interval '30 min'
      `),
          "time_bucket",
        ],
        "event_type",
        [fn("COUNT", col("id")), "count"],
      ],
      group: ["time_bucket", "event_type"],
      order: [[literal("time_bucket"), "ASC"]],
      raw: true,
    });

    const intervalMinutes = 30;
    const start = new Date(`${selectedDate} 00:00:00`);
    const end = new Date(`${selectedDate} 23:59:59`);

    const buckets = new Map();

    // ✅ Pre-fill ALL time buckets
    for (let d = new Date(start); d <= end; ) {
      const key = d.getTime();

      const obj = {
        time: d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      eventTypes.forEach((type) => (obj[type] = 0));

      buckets.set(key, obj);

      d = new Date(d.getTime() + intervalMinutes * 60000);
    }

    // ✅ Fill aggregated DB data
    for (const row of aggregatedEvents) {
      const date = new Date(row.time_bucket);
      const key = date.getTime();

      const bucket = buckets.get(key);
      if (bucket && bucket[row.event_type] !== undefined) {
        bucket[row.event_type] = Number(row.count);
      }
    }

    // ✅ Final chart data
    const chartData = Array.from(buckets.values());

    // ---------------------------
    // FINAL RESPONSE
    // ---------------------------
    res.json({
      device: {
        device_id: device.device_id,
        device_name: device.device_name,
        location: device.location,
        status: device.status,
        device_type: device.device_type,
        app_version: device.device_os_version,
        last_synced: device.last_synced,
      },

      kpis: {
        totalPlays,
        avgCompletion:
          totalPlays > 0 ? Math.round((avgDuration / 30000) * 100) : 0,
        avgCpu: telemetryData.length
          ? Math.round(
              telemetryData.reduce((a, b) => a + (b.cpu_usage || 0), 0) /
                telemetryData.length,
            )
          : 0,
        storageUsed: 100 - (telemetryData[0]?.storage_free_mb || 0) / 1000,
      },

      performance,
      networkDistribution,
      logs: formattedLogs,
      telemetry: telemetryData,
      events: formattedEvents,
      chartdata: chartData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
};
