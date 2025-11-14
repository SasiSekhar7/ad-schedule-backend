const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const ExcelJS = require("exceljs");
const logger = require("../utils/logger");
const {
  getCustomUTCDateTime,
  getUTCDate,
  generatePairingCode,
} = require("../helpers");
const {
  Ad,
  Device,
  Schedule,
  sequelize,
  DeviceGroup,
  ScrollText,
  Client,
  ApkVersion,
  ProofOfPlayLog,
  DeviceTelemetryLog,
  DeviceEventLog,
} = require("../models");
const {
  addHours,
  setHours,
  setMinutes,
  formatISO,
  addMinutes,
} = require("date-fns");
const { getBucketURL, getSignedS3Url } = require("./s3Controller");
const { Op, literal, fn, col } = require("sequelize");
const path = require("path");
const {
  pushToGroupQueue,
  pushNewDeviceToQueue,
  convertToPushReadyJSON,
  exitDeviceAppliation,
  updateDeviceGroup,
  updateDeviceMetaData,
} = require("./queueController");
const moment = require("moment");

const { createGroupWithDummyClient } = require("../db/utils");
module.exports.getFullScheduleCalendar = async (req, res) => {
  try {
    // Extract device_id from query params
    const { device_id } = req.query;

    // Fetch schedules from the database with the necessary associations
    const schedules = await Schedule.findAll({
      include: [{ model: Ad }, { model: Device }],
      where: device_id ? { device_id } : {}, // Filter if device_id is provided
    });

    // Create a map to group schedules by device_id
    const deviceScheduleMap = {};

    schedules.forEach((schedule) => {
      const deviceId = schedule.Device.device_id;

      if (!deviceScheduleMap[deviceId]) {
        deviceScheduleMap[deviceId] = {
          device_id: deviceId,
          location: schedule.Device.location,
          events: [],
        };
      }

      deviceScheduleMap[deviceId].events.push({
        id: schedule.schedule_id,
        start: schedule.start_time,
        end: schedule.end_time,
        title: schedule.Ad.name, // Ad name only
        ad_id: schedule.Ad.ad_id, // Store ad_id separately
      });
    });

    // Convert the map values to an array
    const formattedSchedules = Object.values(deviceScheduleMap);

    res.json(formattedSchedules[0]); // Send the transformed data
  } catch (error) {
    logger.logError("Error in getSchedule", error, {
      device_id: req.params.device_id,
    });
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.getFullSchedule = async (req, res) => {
  try {
    const { from, to } = req.query;

    const whereClause = {};

    if (from && to) {
      whereClause.start_time = {
        [Op.between]: [`${from} 00:00:00`, `${to} 23:59:59`],
      };
    }

    if (req.user && req.user.role === "Client" && req.user.client_id) {
      whereClause["$DeviceGroup.client_id$"] = req.user.client_id;
    }

    const schedules = await Schedule.findAll({
      where: whereClause,
      include: [
        { model: Ad, attributes: ["name"] },
        { model: DeviceGroup, attributes: ["name", "client_id"] },
      ],
      order: [["start_time", "DESC"]],
    });

    const result = schedules.map((schedule) => {
      const { Ad, DeviceGroup, ...data } = schedule.dataValues;
      return {
        ...data,
        ad_name: Ad.name,
        group_name: DeviceGroup.name,
        client_id: DeviceGroup.client_id,
      };
    });

    res.json({ schedules: result, total: result.length });
  } catch (error) {
    logger.logError("Error in getFullSchedule", error, {
      from: req.query.from,
      to: req.query.to,
    });
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// module.exports.getFullSchedule_v2 = async (req, res) => {
//   try {
//     const { from, to } = req.query;
//     const whereClause = {};

//     if (from && to) {
//       whereClause.start_time = {
//         [Op.between]: [`${from} 00:00:00`, `${to} 23:59:59`],
//       };
//     }

//     if (req.user && req.user.role === "Client" && req.user.client_id) {
//       whereClause["$DeviceGroup.client_id$"] = req.user.client_id;
//     }

//     // 1. Get filtered schedules (for display)
//     const schedules = await Schedule.findAll({
//       where: whereClause,
//       include: [
//         { model: Ad, attributes: ["ad_id", "name"] },
//         { model: DeviceGroup, attributes: ["group_id", "name", "client_id"] },
//       ],
//       order: [["start_time", "ASC"]],
//     });

//     // 2. Get full ranges for each Ad+Group (ignores filter)
//     const allSchedules = await Schedule.findAll({
//       include: [
//         { model: Ad, attributes: ["ad_id", "name"] },
//         { model: DeviceGroup, attributes: ["group_id", "name", "client_id"] },
//       ],
//       order: [["start_time", "ASC"]],
//     });

//     const fullRanges = {};
//     allSchedules.forEach((s) => {
//       const ad = s.Ad;
//       const group = s.DeviceGroup;
//       const key = `${ad.ad_id}-${group.group_id}`;

//       if (!fullRanges[key]) {
//         fullRanges[key] = {
//           fromDate: moment(s.start_time),
//           toDate: moment(s.end_time),
//         };
//       } else {
//         fullRanges[key].fromDate = moment.min(
//           fullRanges[key].fromDate,
//           moment(s.start_time)
//         );
//         fullRanges[key].toDate = moment.max(
//           fullRanges[key].toDate,
//           moment(s.end_time)
//         );
//       }
//     });

//     // 3. Group filtered schedules by Ad → Groups
//     const adsMap = {};
//     schedules.forEach((s) => {
//       const ad = s.Ad;
//       const group = s.DeviceGroup;
//       const key = `${ad.ad_id}-${group.group_id}`;

//       if (!adsMap[ad.ad_id]) {
//         adsMap[ad.ad_id] = {
//           adId: ad.ad_id,
//           adName: ad.name,
//           adDuration: ad.duration,

//           groups: {},
//         };
//       }

//       if (!adsMap[ad.ad_id].groups[group.group_id]) {
//         const full = fullRanges[key]; // take true min/max
//         adsMap[ad.ad_id].groups[group.group_id] = {
//           groupId: group.group_id,
//           groupName: group.name,
//           clientId: group.client_id,
//           fromDate: full.fromDate,
//           toDate: full.toDate,
//         };
//       }
//     });

//     // 4. Transform results
//     const adsWithGroups = Object.values(adsMap).map((ad) => {
//       const groups = Object.values(ad.groups).map((g) => {
//         const totalDays = g.toDate.diff(g.fromDate, "days") + 1;

//         const today = moment();
//         const completedDays = today.isBefore(g.fromDate)
//           ? 0
//           : Math.min(today.diff(g.fromDate, "days") + 1, totalDays);

//         const completedPercentage = ((completedDays / totalDays) * 100).toFixed(
//           2
//         );

//         return {
//           groupId: g.groupId,
//           groupName: g.groupName,
//           clientId: g.clientId,
//           fromDate: g.fromDate.format("DD-MM-YYYY"),
//           toDate: g.toDate.format("DD-MM-YYYY"),
//           totalDays,
//           completedDays,
//           completedPercentage: `${completedPercentage}%`,
//           lastDate: g.toDate.format("DD-MM-YYYY"),
//         };
//       });

//       return { ...ad, groups };
//     });

//     res.json({ ads: adsWithGroups, total: adsWithGroups.length });
//   } catch (error) {
//     console.error("Error in getFullSchedule_v2:", error);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// };

// module.exports.getFullSchedule_v2 = async (req, res) => {
//   try {
//     const { from, to } = req.query;
//     const whereClause = {};

//     // Today at fixed start time (00:00:00)
//     const todayStart = moment().startOf("day").format("YYYY-MM-DD HH:mm:ss");

//     // If user provided date range, apply it
//     if (from && to) {
//       whereClause.start_time = {
//         [Op.between]: [`${from} 00:00:00`, `${to} 23:59:59`],
//       };
//     }

//     // Always exclude schedules that ended before today (fixed)
//     whereClause.end_time = { [Op.gte]: todayStart };

//     // Apply client filter if user is a client
//     if (req.user && req.user.role === "Client" && req.user.client_id) {
//       whereClause["$DeviceGroup.client_id$"] = req.user.client_id;
//     }

//     // 1. Get filtered schedules (for display)
//     const schedules = await Schedule.findAll({
//       where: whereClause,
//       include: [
//         { model: Ad, attributes: ["ad_id", "name", "duration"] },
//         { model: DeviceGroup, attributes: ["group_id", "name", "client_id"] },
//       ],
//       order: [["start_time", "ASC"]],
//     });

//     // 2. Get full ranges for each Ad+Group (only for ongoing & future schedules)
//     const allSchedules = await Schedule.findAll({
//       where: { end_time: { [Op.gte]: todayStart } }, // <-- only active & future
//       include: [
//         { model: Ad, attributes: ["ad_id", "name", "duration"] },
//         { model: DeviceGroup, attributes: ["group_id", "name", "client_id"] },
//       ],
//       order: [["start_time", "ASC"]],
//     });

//     // 3. Build full ranges for Ad+Group combinations
//     const fullRanges = {};
//     allSchedules.forEach((s) => {
//       const ad = s.Ad;
//       const group = s.DeviceGroup;
//       const key = `${ad.ad_id}-${group.group_id}`;

//       if (!fullRanges[key]) {
//         fullRanges[key] = {
//           fromDate: moment(s.start_time),
//           toDate: moment(s.end_time),
//         };
//       } else {
//         fullRanges[key].fromDate = moment.min(
//           fullRanges[key].fromDate,
//           moment(s.start_time)
//         );
//         fullRanges[key].toDate = moment.max(
//           fullRanges[key].toDate,
//           moment(s.end_time)
//         );
//       }
//     });

//     // 4. Group filtered schedules by Ad → Groups
//     const adsMap = {};
//     schedules.forEach((s) => {
//       const ad = s.Ad;
//       const group = s.DeviceGroup;
//       const key = `${ad.ad_id}-${group.group_id}`;

//       if (!adsMap[ad.ad_id]) {
//         adsMap[ad.ad_id] = {
//           adId: ad.ad_id,
//           adName: ad.name,
//           adDuration: ad.duration,
//           groups: {},
//         };
//       }

//       if (!adsMap[ad.ad_id].groups[group.group_id]) {
//         const full = fullRanges[key];
//         adsMap[ad.ad_id].groups[group.group_id] = {
//           groupId: group.group_id,
//           groupName: group.name,
//           clientId: group.client_id,
//           fromDate: full.fromDate,
//           toDate: full.toDate,
//         };
//       }
//     });

//     // 5. Transform results for response
//     const adsWithGroups = Object.values(adsMap).map((ad) => {
//       const groups = Object.values(ad.groups).map((g) => {
//         const totalDays = g.toDate.diff(g.fromDate, "days") + 1;

//         const today = moment();
//         const completedDays = today.isBefore(g.fromDate)
//           ? 0
//           : Math.min(today.diff(g.fromDate, "days") + 1, totalDays);

//         const completedPercentage = ((completedDays / totalDays) * 100).toFixed(
//           2
//         );

//         return {
//           groupId: g.groupId,
//           groupName: g.groupName,
//           clientId: g.clientId,
//           fromDate: g.fromDate.format("DD-MM-YYYY"),
//           toDate: g.toDate.format("DD-MM-YYYY"),
//           totalDays,
//           completedDays,
//           completedPercentage: `${completedPercentage}%`,
//           lastDate: g.toDate.format("DD-MM-YYYY"),
//         };
//       });

//       return { ...ad, groups };
//     });

//     res.json({ ads: adsWithGroups, total: adsWithGroups.length });
//   } catch (error) {
//     console.error("Error in getFullSchedule_v2:", error);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// };

module.exports.getFullSchedule_v2 = async (req, res) => {
  try {
    const { from, to } = req.query;
    const whereClause = {};

    const fromStart = moment(`${from} 00:00:00`, "YYYY-MM-DD HH:mm:ss");
    const toEnd = moment(`${to} 23:59:59`, "YYYY-MM-DD HH:mm:ss");
    let todayStart = moment().startOf("day");

    if (fromStart.isBefore(todayStart)) {
      logger.logDebug("Adjusted from date to today's start", {
        todayStart: todayStart.format(),
        fromStart: fromStart.format(),
      });
      // Adjust today's start to fromStart
      todayStart = fromStart;
    }

    if (from && to) {
      const fromStart = `${from} 00:00:00`;
      const toEnd = `${to} 23:59:59`;

      // Include schedules that overlap the selected range
      whereClause[Op.and] = [
        { start_time: { [Op.lte]: toEnd } }, // starts before "to"
        { end_time: { [Op.gte]: fromStart } }, // ends after "from"
      ];
    } else {
      // Default: only active and future schedules
      whereClause.end_time = { [Op.gte]: todayStart };
    }

    // Apply client filter
    if (req.user && req.user.role === "Client" && req.user.client_id) {
      whereClause["$DeviceGroup.client_id$"] = req.user.client_id;
    }

    // 1. Get filtered schedules (overlapping the date range)
    const schedules = await Schedule.findAll({
      where: whereClause,
      include: [
        { model: Ad, attributes: ["ad_id", "name", "duration"] },
        { model: DeviceGroup, attributes: ["group_id", "name", "client_id"] },
      ],
      order: [["start_time", "ASC"]],
    });

    // 2. Get full ranges for each Ad+Group (active & future schedules)
    const allSchedules = await Schedule.findAll({
      where: { end_time: { [Op.gte]: todayStart } },
      include: [
        { model: Ad, attributes: ["ad_id", "name", "duration"] },
        { model: DeviceGroup, attributes: ["group_id", "name", "client_id"] },
      ],
      order: [["start_time", "ASC"]],
    });

    // 3. Build full ranges for Ad+Group
    const fullRanges = {};
    allSchedules.forEach((s) => {
      const ad = s.Ad;
      const group = s.DeviceGroup;
      const key = `${ad.ad_id}-${group.group_id}`;

      if (!fullRanges[key]) {
        fullRanges[key] = {
          fromDate: moment(s.start_time),
          toDate: moment(s.end_time),
        };
      } else {
        fullRanges[key].fromDate = moment.min(
          fullRanges[key].fromDate,
          moment(s.start_time)
        );
        fullRanges[key].toDate = moment.max(
          fullRanges[key].toDate,
          moment(s.end_time)
        );
      }
    });

    // 4. Group filtered schedules by Ad → Groups
    const adsMap = {};
    schedules.forEach((s) => {
      const ad = s.Ad;
      const group = s.DeviceGroup;
      const key = `${ad.ad_id}-${group.group_id}`;

      if (!adsMap[ad.ad_id]) {
        adsMap[ad.ad_id] = {
          adId: ad.ad_id,
          adName: ad.name,
          adDuration: ad.duration,
          groups: {},
        };
      }

      if (!adsMap[ad.ad_id].groups[group.group_id]) {
        const full = fullRanges[key];
        adsMap[ad.ad_id].groups[group.group_id] = {
          groupId: group.group_id,
          groupName: group.name,
          clientId: group.client_id,
          fromDate: full.fromDate,
          toDate: full.toDate,
        };
      }
    });

    // 5. Transform for response
    const adsWithGroups = Object.values(adsMap).map((ad) => {
      const groups = Object.values(ad.groups).map((g) => {
        const totalDays = g.toDate.diff(g.fromDate, "days") + 1;

        const today = moment();
        const completedDays = today.isBefore(g.fromDate)
          ? 0
          : Math.min(today.diff(g.fromDate, "days") + 1, totalDays);

        const completedPercentage = ((completedDays / totalDays) * 100).toFixed(
          2
        );

        return {
          groupId: g.groupId,
          groupName: g.groupName,
          clientId: g.clientId,
          fromDate: g.fromDate.format("DD-MM-YYYY"),
          toDate: g.toDate.format("DD-MM-YYYY"),
          totalDays,
          completedDays,
          completedPercentage: `${completedPercentage}%`,
          lastDate: g.toDate.format("DD-MM-YYYY"),
        };
      });

      return { ...ad, groups };
    });

    res.json({ ads: adsWithGroups, total: adsWithGroups.length });
  } catch (error) {
    logger.logError("Error in getFullSchedule_v2", error, {
      from: req.query.from,
      to: req.query.to,
    });
    res.status(500).json({ message: "Internal Server Error" });
  }
};

async function getAddressFromCoordinates(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.display_name || "Unknown Location";
  } catch (error) {
    logger.logError("Error fetching location", error, { lat, lon });
    return "Unknown Location";
  }
}

module.exports.getDeviceList = async (req, res) => {
  try {
    const whereClause =
      req.user && req.user.role === "Client" && req.user.client_id
        ? { client_id: req.user.client_id }
        : {}; // Empty where clause for Admin to fetch all

    const devices = await Device.findAll({
      include: {
        model: DeviceGroup,
        attributes: ["name", "last_pushed"],
        where: whereClause, // Apply the whereClause to DeviceGroup
        required: true, // Only include devices that belong to a group matching the whereClause
      },
      raw: true,
      nest: true,
    });

    // Process each device and add status + location
    const deviceList = devices.map((device) => {
      const last_synced = device.last_synced;
      const last_pushed = device.DeviceGroup?.last_pushed || null;
      const group_name = device.DeviceGroup?.name || null;

      return {
        ...device,
        group_name,
        status: last_pushed && last_synced < last_pushed ? "offline" : "active",
      };
    });

    res.json({ devices: deviceList });
  } catch (error) {
    logger.logError("Error in getAllDevices", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.getApkUrl = async (req, res) => {
  try {
    const latestVersion = await ApkVersion.findOne({
      where: {
        is_active: true, // Only consider versions marked as active
      },
      order: [["version_code", "DESC"]], // Ensure we get the highest version available
      limit: 1, // We only need one (the latest)
    });
    let url;
    if (latestVersion.s3_key) {
      url = await getSignedS3Url(latestVersion.s3_key, 600);
    } else {
      url = await getSignedS3Url("adupPlayer.apk");
    }
    res.json({ message: `Download URL`, url });
  } catch (error) {
    logger.logError("Error in getApkUrl", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.getWgtUrl = async (req, res) => {
  try {
    const url = await getBucketURL("adupPlayer.wgt");
    res.json({ message: `Download URL`, url });
  } catch (error) {
    logger.logError("Error in getWgtUrl", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
const fs = require("fs");

module.exports.getWgt = async (req, res) => {
  try {
    const filePath = path.join(
      __dirname,
      "..",
      "..",
      "assets",
      "adupPlayer.wgt"
    );

    // Check if file exists before sending
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    // Optional: force download rather than displaying in browser
    res.download(filePath, "adupPlayer.wgt"); // second argument sets the filename for the client

    // Or if you prefer streaming it without download prompt:
    // res.sendFile(filePath);
  } catch (error) {
    logger.logError("Error serving .wgt file", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.updateGroupSchedule = async (req, res) => {
  try {
    const { group_id } = req.params;

    await pushToGroupQueue([group_id]);

    res.json({ message: `Successfully updated group schedule` });
  } catch (error) {
    logger.logError("Error in updateGroupSchedule", error, {
      group_id: req.params.group_id,
    });
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.registerDevice = async (req, res) => {
  try {
    const { location, reg_code, android_id } = req.body;

    const groupExists = await DeviceGroup.findOne({
      attributes: ["group_id", "client_id"],
      where: { reg_code }, // Ensure `reg_code` is the actual column name
    });

    if (!groupExists) {
      return res.status(400).json({ message: "Invalid License Key" });
    }

    const group_id = groupExists.group_id; // Safe to access since we checked if it exists
    const client_id = groupExists.client_id;
    const role = req.user?.role; // Safe to access since we checked if it exists

    const deviceExists = await Device.findOne({
      where: {
        android_id,
        group_id,
      },
    });

    if (deviceExists) {
      await Device.update(
        {
          group_id,
          location,
          status: "active",
          last_synced: getCustomUTCDateTime(),
        },
        {
          where: {
            android_id,
          },
        }
      );

      const payload = {
        device_id: deviceExists.device_id,
        group_id: deviceExists.group_id,
        last_synced: deviceExists.last_synced,
      };
      const token = jwt.sign(payload, process.env.JWT_DEVICE_SECRET, {
        expiresIn: "30d",
      });
      let fileName = "placeholder.jpg";
      let url;
      if (role != "Admin") {
        fileName = `${client_id}/placeholder.jpg`;
        url = await getBucketURL(fileName);
        if (!url) {
          fileName = "placeholder.jpg";
        }
      }
      url = await getBucketURL(fileName);

      return res.json({
        message: "Device Registered Successfully",
        token,
        ads: [url],
      });
    }

    const device = await Device.create({
      group_id,
      android_id,
      location,
      status: "active",
      last_synced: getCustomUTCDateTime(),
    });

    const payload = {
      device_id: device.device_id,
      group_id: device.group_id,
      last_synced: device.last_synced,
    };
    const token = jwt.sign(payload, process.env.JWT_DEVICE_SECRET, {
      expiresIn: "30d",
    });
    let fileName = "placeholder.jpg";
    let url;
    if (role != "Admin") {
      fileName = `${client_id}/placeholder.jpg`;
      url = await getBucketURL(fileName);
      if (!url) {
        fileName = "placeholder.jpg";
      }
    }
    url = await getBucketURL(fileName);

    return res
      .status(201)
      .json({ message: "Device enrolled successfully", token, ads: [url] });
    //     return Device.findOrCreate({
    //       where: {
    //         userId:    profile.userId,
    //         name:      profile.name
    //       },
    //       transaction: t
    //     })
    //     .spread(function(userResult, created){
    //       // userResult is the user instance

    //       if (created) {
    //         // created will be true if a new user was created
    //       }
    //     });
    //   });
  } catch (error) {
    logger.logError("Error in registerDevice", error, {
      android_id: req.body.android_id,
      reg_code: req.body.reg_code,
    });
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports.registerNewDevice = async (req, res) => {
  try {
    const {
      android_id,
      device_type,
      device_model,
      device_os_version,
      device_orientation,
      device_resolution,
      device_os,
      device_on_time,
      device_off_time,
    } = req.body;

    // ------------------ VALIDATION ------------------
    if (!android_id || typeof android_id !== "string") {
      return res
        .status(400)
        .json({ message: "android_id is required and must be a string" });
    }
    // ------------------ CONDITIONAL VALIDATION ------------------
    if (
      device_type &&
      ![
        "mobile",
        "laptop",
        "tv",
        "tablet",
        "desktop",
        "display",
        "signage",
      ].includes(device_type)
    ) {
      return res.status(400).json({
        message:
          "device_type must be one of: mobile, laptop, tv, tablet, desktop, display",
      });
    }

    if (
      device_orientation &&
      !["portrait", "landscape", "auto"].includes(device_orientation)
    ) {
      return res.status(400).json({
        message: "device_orientation must be one of: portrait, landscape, auto",
      });
    }

    if (
      device_os &&
      !["tizen", "android", "webos", "ios", "windows", "linux"].includes(
        device_os
      )
    ) {
      return res.status(400).json({
        message:
          "device_os must be one of: tizen, android, webos, ios, windows, linux",
      });
    }

    if (device_resolution && !/^\d+x\d+$/.test(device_resolution)) {
      return res.status(400).json({
        message:
          "device_resolution must be in WIDTHxHEIGHT format, e.g., 1920x1080",
      });
    }

    if (device_on_time && !/^\d{2}:\d{2}:\d{2}$/.test(device_on_time)) {
      return res.status(400).json({
        message: "device_on_time must be in HH:mm:ss format",
      });
    }

    if (device_off_time && !/^\d{2}:\d{2}:\d{2}$/.test(device_off_time)) {
      return res.status(400).json({
        message: "device_off_time must be in HH:mm:ss format",
      });
    }

    const deviceExists = await Device.findOne({
      where: {
        android_id,
      },
    });

    let group = await DeviceGroup.findOne({
      where: { group_id: process.env.DUMMY_GROUP_ID || null }, // Ensure `group_id` is the actual column name
      attributes: ["group_id"],
    });

    if (!group) {
      group = await createGroupWithDummyClient(
        process.env.DUMMY_GROUP_NAME || "Default Group"
      );
    }

    const group_id = group.group_id;

    let pairing_code = generatePairingCode();

    if (deviceExists) {
      await Device.update(
        {
          device_type: device_type || deviceExists.device_type,
          device_model: device_model || deviceExists.device_model,
          device_os: device_os || deviceExists.device_os,
          device_os_version:
            device_os_version || deviceExists.device_os_version,
          device_orientation:
            device_orientation || deviceExists.device_orientation,
          device_resolution:
            device_resolution || deviceExists.device_resolution,
          pairing_code: pairing_code,
          registration_status: "pending",
          location: deviceExists.location || "Unknown",
          status: "active",
          group_id: group_id,
          last_synced: getCustomUTCDateTime(),
        },
        {
          where: {
            android_id,
          },
        }
      );

      return res.status(201).json({
        message: "Device registered successfully",
        device_id: deviceExists.device_id,
        pairing_code: pairing_code,
        android_id: deviceExists.android_id,
      });
    }

    const device = await Device.create({
      android_id,
      group_id: group_id, // Initially set to null, can be updated later
      device_type: device_type || "tv",
      device_model: device_model || "Unknown Model",
      device_os: device_os || null,
      device_os_version: device_os_version || null,
      device_orientation: device_orientation || "auto",
      device_resolution: device_resolution || null,
      location: "Unknown", // Default location, can be updated later
      registration_status: "pending", // Default status
      pairing_code: pairing_code, // Initially set to null
      status: "active", // Default status
      last_synced: getCustomUTCDateTime(),
    });

    return res.status(201).json({
      message: "Device registered successfully",
      device_id: device.device_id,
      pairing_code: pairing_code,
      android_id: device.android_id,
    });
  } catch (error) {
    logger.logError("Error registering new device", error, {
      android_id: req.body.android_id,
    });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports.getDeviceByPairingCode = async (req, res) => {
  try {
    const { pairing_code } = req.params;

    if (!pairing_code) {
      return res.status(400).json({ error: "Pairing code is required" });
    }

    const device = await Device.findOne({
      where: { pairing_code, registration_status: "pending" },
    });

    if (!device) {
      return res
        .status(404)
        .json({ error: "Device not found or already paired" });
    }

    // Return full device details
    return res.status(200).json({
      device_id: device.device_id,
      device_name: device.device_name || "Unknown Device",
      android_id: device.android_id,
      device_type: device.device_type,
      device_model: device.device_model || null,
      device_os_version: device.device_os_version || null,
      device_orientation: device.device_orientation,
      device_resolution: device.device_resolution || null,
      device_os: device.device_os || null,
      device_on_time: device.device_on_time,
      device_off_time: device.device_off_time,
      group_id: device.group_id || null,
      status: device.status,
      registration_status: device.registration_status,
      tags: device.tags || [],
      pairing_code: device.pairing_code,
      location: device.location || "Unknown",
      last_synced: device.last_synced,
      created_at: device.created_at,
      updated_at: device.updated_at,
    });
  } catch (error) {
    logger.logError("Error fetching device by pairing code", error, {
      pairing_code: req.params.pairing_code,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.updateDeviceDetails = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { device_name, tags, group_id, device_on_time, device_off_time } =
      req.body;
    if (!device_id) {
      return res.status(400).json({ error: "Device ID is required" });
    }
    if (!device_name && !tags && !group_id) {
      return res.status(400).json({ error: "At least one field is required" });
    }
    const device = await Device.findOne({ where: { device_id } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }
    // Update only the fields that are provided
    if (device_name) {
      device.device_name = device_name;
    }
    if (tags) {
      device.tags = tags; // Assuming tags is a string or array, adjust as needed
    }

    if (group_id) {
      device.group_id = group_id;
      // device.last_synced = getCustomUTCDateTime();
      // device.status = "active"; // Set status to active when group_id is updated
    }

    if (device_on_time) device.device_on_time = device_on_time;
    if (device_off_time) device.device_off_time = device_off_time;
    await device.save();
    return res.status(200).json({
      message: "Device details updated successfully",
    });
  } catch (error) {
    logger.logError("Error updating device details", error, {
      device_id: req.params.device_id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

// module.exports.updateDeviceDetailsAndLaunch = async (req, res) => {
//   try {
//     const { device_id } = req.params;
//     console.log("body", req.body);

//     const {
//       location,
//       group_id,
//       device_orientation,
//       device_resolution,
//       device_on_time,
//       device_off_time,
//     } = req.body;
//     const role = req.user?.role;
//     if (!device_id) {
//       return res.status(400).json({ error: "Device ID is required" });
//     }
//     if (!location) {
//       return res.status(400).json({ error: "Location is required" });
//     }
//     if (
//       device_orientation &&
//       !["portrait", "landscape", "auto"].includes(device_orientation)
//     ) {
//       return res.status(400).json({
//         message: "device_orientation must be one of: portrait, landscape, auto",
//       });
//     }

//     if (device_resolution && !/^\d+x\d+$/.test(device_resolution)) {
//       return res.status(400).json({
//         message:
//           "device_resolution must be in WIDTHxHEIGHT format, e.g., 1920x1080",
//       });
//     }

//     if (device_on_time && !/^\d{2}:\d{2}:\d{2}$/.test(device_on_time)) {
//       return res.status(400).json({
//         message: "device_on_time must be in HH:mm:ss format",
//       });
//     }

//     if (device_off_time && !/^\d{2}:\d{2}:\d{2}$/.test(device_off_time)) {
//       return res.status(400).json({
//         message: "device_off_time must be in HH:mm:ss format",
//       });
//     }

//     const finalLocation = location.lat + "," + location.lng;
//     const device = await Device.findOne({ where: { device_id } });
//     if (!device) {
//       return res.status(404).json({ error: "Device not found" });
//     }

//     console.log("group_id", group_id);

//     if (group_id) {
//       const groupExists = await DeviceGroup.findOne({
//         where: { group_id }, // Ensure `group_id` is the actual column name
//       });
//       // Update the location field
//       device.location = finalLocation;
//       device.registration_status = "pairing"; // Set status to connected when location is updated

//       let fileName = "placeholder.jpg";
//       let url;
//       if (role != "Admin") {
//         fileName = `${groupExists.client_id}/placeholder.jpg`;
//         url = await getBucketURL(fileName);
//         if (!url) {
//           fileName = "placeholder.jpg";
//         }
//       }

//       url = await getBucketURL(fileName);
//       console.log("url", url);

//       await pushNewDeviceToQueue(device, url);
//     } else {

//       await updateDeviceMetaData(device
//       )
//     }

//     await device.save();
//     return res.status(200).json({
//       message: "Device details updated successfully",
//     });
//   } catch (error) {
//     console.error("Error updating device location:", error);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };

module.exports.updateDeviceDetailsAndLaunch = async (req, res) => {
  try {
    const { device_id } = req.params;
    const {
      location,
      group_id,
      device_type,
      device_orientation,
      device_resolution,
      device_on_time,
      device_off_time,
    } = req.body;
    const role = req.user?.role;

    if (!device_id) {
      return res.status(400).json({ error: "Device ID is required" });
    }

    const device = await Device.findOne({ where: { device_id } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    // Validate optional fields only if provided
    if (
      device_orientation &&
      !["portrait", "landscape", "auto"].includes(device_orientation)
    ) {
      return res.status(400).json({
        message: "device_orientation must be one of: portrait, landscape, auto",
      });
    }

    if (device_resolution && !/^\d+x\d+$/.test(device_resolution)) {
      return res.status(400).json({
        message:
          "device_resolution must be in WIDTHxHEIGHT format, e.g., 1920x1080",
      });
    }

    if (device_on_time && !/^\d{2}:\d{2}:\d{2}$/.test(device_on_time)) {
      return res
        .status(400)
        .json({ message: "device_on_time must be in HH:mm:ss format" });
    }

    if (device_off_time && !/^\d{2}:\d{2}:\d{2}$/.test(device_off_time)) {
      return res
        .status(400)
        .json({ message: "device_off_time must be in HH:mm:ss format" });
    }

    // Location is required only if group_id is provided
    if (group_id && !location) {
      return res
        .status(400)
        .json({ error: "Location is required when group_id is provided" });
    }

    // Only update the fields that are provided
    let device_orientation_val =
      device_orientation ?? device.device_orientation;
    let device_resolution_val = device_resolution ?? device.device_resolution;
    device.device_on_time = device_on_time ?? device.device_on_time;
    device.device_off_time = device_off_time ?? device.device_off_time;
    device.device_type = device_type ?? device.device_type;

    // 🔹 Resolution validation according to orientation
    if (device_resolution_val && device_orientation_val) {
      const [width, height] = device_resolution_val
        .split("x")
        .map((v) => parseInt(v, 10));

      // Only auto-swap for standard resolutions like 1920x1080 or 1080x1920
      const isStandardResolution =
        (width === 1920 && height === 1080) ||
        (width === 1080 && height === 1920);

      if (isStandardResolution) {
        if (device_orientation_val === "portrait" && width > height) {
          // Swap to portrait
          device_resolution_val = `${height}x${width}`;
        } else if (device_orientation_val === "landscape" && height > width) {
          // Swap to landscape
          device_resolution_val = `${height}x${width}`;
        }
      }
    }

    if (group_id) {
      device.device_orientation = device_orientation_val;
      device.device_resolution = device_resolution_val;

      const groupExists = await DeviceGroup.findOne({ where: { group_id } });
      if (!groupExists) {
        return res.status(404).json({ error: "Device group not found" });
      }

      device.group_id = group_id;
      device.location = `${location.lat},${location.lng}`;
      device.registration_status = "pairing"; // Set status to pairing when group_id is updated

      // Placeholder / URL logic
      let fileName =
        role !== "Admin"
          ? `${groupExists.client_id}/placeholder.jpg`
          : "placeholder.jpg";
      const url = (await getBucketURL(fileName)) || "placeholder.jpg";

      // Push to device queue
      await pushNewDeviceToQueue(device, url);
    } else if (device_orientation || device_resolution) {
      // Only metadata update, no group changes

      const metaData = {
        device_orientation: device_orientation_val,
        device_resolution: device_resolution_val,
      };

      await updateDeviceMetaData(device_id, metaData);
    }

    await device.save();

    return res.status(200).json({
      message: "Device details updated successfully",
      device_id: device.device_id,
    });
  } catch (error) {
    logger.logError("Error updating device", error, {
      device_id: req.params.device_id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.confirmUpdateDeviceMetaData = async (req, res) => {
  try {
    const { device_id } = req.params;
    const {
      device_orientation,
      device_resolution,
      device_on_time,
      device_off_time,
    } = req.body;
    const role = req.user?.role;

    if (!device_id) {
      return res.status(400).json({ error: "Device ID is required" });
    }

    const device = await Device.findOne({ where: { device_id } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    // Validate optional fields only if provided
    if (
      device_orientation &&
      !["portrait", "landscape", "auto"].includes(device_orientation)
    ) {
      return res.status(400).json({
        message: "device_orientation must be one of: portrait, landscape, auto",
      });
    }

    if (device_resolution && !/^\d+x\d+$/.test(device_resolution)) {
      return res.status(400).json({
        message:
          "device_resolution must be in WIDTHxHEIGHT format, e.g., 1920x1080",
      });
    }

    if (device_on_time && !/^\d{2}:\d{2}:\d{2}$/.test(device_on_time)) {
      return res
        .status(400)
        .json({ message: "device_on_time must be in HH:mm:ss format" });
    }

    if (device_off_time && !/^\d{2}:\d{2}:\d{2}$/.test(device_off_time)) {
      return res
        .status(400)
        .json({ message: "device_off_time must be in HH:mm:ss format" });
    }

    // Only update the fields that are provided
    device.device_orientation = device_orientation ?? device.device_orientation;
    device.device_resolution = device_resolution ?? device.device_resolution;
    device.device_on_time = device_on_time ?? device.device_on_time;
    device.device_off_time = device_off_time ?? device.device_off_time;

    await device.save();

    return res.status(200).json({
      message: "Device details updated successfully",
      device_id: device.device_id,
    });
  } catch (error) {
    logger.logError("Error updating device", error, {
      device_id: req.params.device_id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.updateDeviceMetadata = async (req, res) => {
  try {
    const { device_id } = req.params;

    const { location, group_id, device_orientation, devi } = req.body;
    const role = req.user?.role;
    if (!device_id) {
      return res.status(400).json({ error: "Device ID is required" });
    }
    if (!location) {
      return res.status(400).json({ error: "Location is required" });
    }

    const finalLocation = location.lat + "," + location.lng;
    const device = await Device.findOne({ where: { device_id } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    // Update the location field
    device.location = finalLocation;

    await updateDeviceGroup(device_id, group_id);

    await device.save();
    return res.status(200).json({
      message: "Device metadata updated successfully",
    });
  } catch (error) {
    logger.logError("Error updating device location", error, {
      device_id: req.params.device_id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.completeRegisterNewDevice = async (req, res) => {
  try {
    const { device_id } = req.body;
    if (!device_id) {
      return res.status(400).json({ error: "Device ID are required" });
    }
    const device = await Device.findOne({ where: { device_id } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    device.last_synced = getCustomUTCDateTime();
    device.status = "active"; // Set status to active when group_id is updated
    device.registration_status = "connected"; // Set registration status to connected
    device.pairing_code = null; // Clear pairing code when group_id is set
    await device.save();
    return res.status(200).json({
      message: "Device registered successfully",
    });
  } catch (error) {
    logger.logError("Error completing device registration", error, {
      device_id: req.body.device_id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getGroutpList = async (req, res) => {
  try {
    const whereClause =
      req.user && req.user.role === "Client" && req.user.client_id
        ? { client_id: req.user.client_id }
        : {}; // Admins get all groups

    const groups = await DeviceGroup.findAll({
      where: whereClause, // <<== Apply filter here
      attributes: [
        "group_id",
        "name",
        "reg_code",
        "client_id",
        "rcs_enabled",
        "placeholder_enabled",
      ],
    });

    const formattedGroups = groups.map((group) => ({
      group_id: group.group_id,
      name: group.name,
      reg_code: group.reg_code,
      client_id: group.client_id,
      rcs_enabled: group.rcs_enabled,
      placeholder_enabled: group.placeholder_enabled,
    }));

    return res.status(200).json({ groups: formattedGroups });
  } catch (error) {
    logger.logError("Error fetching groups", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.syncDevice = async (req, res) => {
  try {
    const { group_id, device_id } = req.device;
    if (!device_id) {
      return res.status(400).json({ error: "Device ID is required" });
    }
    if (!group_id) {
      return res.status(400).json({ error: "Group ID is required" });
    }
    logger.logDebug("Processing group for sync", { group_id });
    const jsonToSend = await convertToPushReadyJSON(group_id);

    return res.json({
      device_id,
      last_sync: getCustomUTCDateTime(),
      ...jsonToSend,
    });
  } catch (error) {
    logger.logError("Sync error", error, {
      device_id: req.device?.device_id,
      group_id: req.device?.group_id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};
module.exports.exitDevice = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Device ID is required" });
    }
    if (req.user.role != "Admin") {
      const device = await Device.findOne({
        include: {
          model: DeviceGroup,
          attributes: ["group_id", "client_id"],

          // Ensure the group_id matches the client's ID
        },

        where: { device_id: id },
      });
      if (!device) {
        return res
          .status(404)
          .json({ error: "Device not found or not authorized" });
      }
      if (device.DeviceGroup.client_id != req.user.client_id) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    await exitDeviceAppliation(id);

    await Device.destroy({ where: { device_id: id } });

    return res.json({
      message: "Device exit request sent successfully",
    });
  } catch (error) {
    logger.logError("Error in exitDevice", error, {
      device_id: req.params.id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.confirmDeviceExit = async (req, res) => {
  try {
    const { device_id } = req.params;
    if (!device_id) {
      return res.status(400).json({ error: "Device ID is required" });
    }
    await Device.update(
      { group_id: process.env.DUMMY_GROUP_ID },
      {
        where: { device_id },
      }
    );
    return res.json({
      message: "Successfully Deleted record",
    });
  } catch (error) {
    logger.logError("Error in confirmDeviceExit", error, {
      device_id: req.params.device_id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.createGroup = async (req, res) => {
  try {
    let { name, reg_code, client_id, rcs_enabled, placeholder_enabled } =
      req.body;

    if (req.user.role != "Admin") {
      client_id = req.user.client_id;
    }

    // Check if reg_code already exists
    const groupExists = await DeviceGroup.findOne({
      where: { reg_code, client_id },
    });

    if (groupExists) {
      return res.status(400).json({ message: "License key already in use." });
    }

    // Create the group
    const group = await DeviceGroup.create({
      name,
      rcs_enabled,
      placeholder_enabled,
      reg_code,
      client_id,
    });

    return res
      .status(201)
      .json({ message: "Group created successfully", group });
  } catch (error) {
    logger.logError("Error creating group", error, {
      reg_code: req.body.reg_code,
      client_id: req.body.client_id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.updateGroup = async (req, res) => {
  try {
    const { group_id } = req.params;
    let { name, rcs_enabled, placeholder_enabled } = req.body;

    if (!group_id) {
      return res.status(400).json({ message: "group_id is required" });
    }

    // Find the group
    const group = await DeviceGroup.findOne({ where: { group_id } });
    if (!group) {
      return res.status(404).json({ message: "Device group not found" });
    }

    // Update only the provided fields
    if (name !== undefined) group.name = name;
    if (rcs_enabled !== undefined) group.rcs_enabled = rcs_enabled;
    if (placeholder_enabled !== undefined)
      group.placeholder_enabled = placeholder_enabled;

    let fileName = group.client_id
      ? `${group.client_id}/placeholder.jpg`
      : "placeholder.jpg";
    const url = (await getBucketURL(fileName)) || "placeholder.jpg";

    await group.save();

    await pushToGroupQueue([group_id], url);

    return res.status(200).json({
      message: "Group updated successfully",
      group,
    });
  } catch (error) {
    logger.logError("Error updating group", error, {
      group_id: req.params.group_id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * @typedef {object} Group
 * @property {string} group_id
 * @property {string} name
 * @property {string} reg_code
 * @property {number} device_count
 * @property {string|null} message
 * @property {object|null} Client - The associated Client object
 * @property {string} Client.client_id
 * @property {string} Client.name - The name of the client
 * // Add other Client properties as needed
 */

module.exports.fetchGroups = async (req, res) => {
  try {
    const whereClause =
      req.user && req.user.role === "Client" && req.user.client_id
        ? { client_id: req.user.client_id }
        : {}; // Empty where clause for Admin to fetch all

    const groups = await DeviceGroup.findAll({
      attributes: [
        "group_id",
        "name",
        "reg_code",
        "rcs_enabled",
        "placeholder_enabled",
        "client_id", // Include client_id from DeviceGroup
        [fn("COUNT", col("Devices.device_id")), "device_count"],
      ],
      where: whereClause,
      include: [
        {
          model: Device,
          attributes: [],
        },
        {
          model: ScrollText,
          attributes: ["message"],
          required: false,
        },
        {
          model: Client,
          attributes: ["client_id", "name"], // Include client_id and name from Client
          required: false, // Make Client association optional
        },
      ],
      group: [
        "DeviceGroup.group_id",
        "ScrollText.scrolltext_id",
        "Client.client_id",
      ], // Include Client.client_id in the group by
      raw: true,
      nest: true,
    });

    /** @type {Group[]} */
    const formattedGroups = groups.map((group) => ({
      group_id: group.group_id,
      name: group.name,
      rcs_enabled: group.rcs_enabled,
      placeholder_enabled: group.placeholder_enabled,
      reg_code: group.reg_code,
      device_count: parseInt(group.device_count, 10),
      message: group.ScrollText ? group.ScrollText.message : null,
      Client: group.Client
        ? {
            client_id: group.Client.client_id,
            name: group.Client.name,
            // Add other Client properties here if needed
          }
        : null,
    }));

    return res.status(200).json({ groups: formattedGroups });
  } catch (error) {
    logger.logError("Error fetching groups", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
module.exports.fetchGroupsOld = async (req, res) => {
  try {
    const today = new Date(getCustomUTCDateTime());

    // Construct the start and end times in ISO format
    const startOfDay = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        6,
        0,
        0,
        0
      )
    ).toISOString(); // 6 AM UTC
    const endOfDay = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        22,
        0,
        0,
        0
      )
    ).toISOString(); // 10 PM UTC

    const groups = await DeviceGroup.findAll({
      attributes: [
        "group_id",
        "name",
        "reg_code",
        [fn("COUNT", sequelize.col("Devices.device_id")), "device_count"],
      ],

      include: [
        {
          model: Device,
          attributes: [],
        },
        {
          model: ScrollText,
          attributes: ["message"],
        },
        {
          model: Schedule,
          attributes: ["total_duration"],
          required: false, // <-- Allows groups without schedules to be included
          where: {
            start_time: {
              [Op.between]: [startOfDay, endOfDay],
            },
          },
        },
      ],
      group: ["DeviceGroup.group_id", "ScrollText.scrolltext_id"],
      raw: true,
      nest: true,
    });

    // Process and format the groups
    const formattedGroups = groups.map((group) => {
      const schedules = group.Schedule || []; // Default to empty array if no schedules exist
      const total720 = schedules.filter((s) => s.total_duration === 720).length;
      const total360 = schedules.filter((s) => s.total_duration === 360).length;
      const totalDuration = total720 * 720 + total360 * 360; // Sum of all ad play durations
      const maxCapacity = 8 * 720; // 8 full schedules of 720-play ads

      const batteryLevel =
        totalDuration > 0
          ? ((totalDuration / maxCapacity) * 100).toFixed(2)
          : "0"; // Default to 0% if empty

      return {
        group_id: group.group_id,
        name: group.name,
        reg_code: group.reg_code,
        device_count: group.device_count,
        message: group.ScrollText ? group.ScrollText.message : null,
        total_schedules: total720 + total360,
        battery_percentage: batteryLevel + "%", // e.g., "75%"
        battery_fill: parseFloat(batteryLevel), // Number for frontend bar width
      };
    });

    return res.status(200).json({ groups: formattedGroups });
  } catch (error) {
    logger.logError("Error in fetchGroupsOld", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// controllers/scrollTextController.js

module.exports.addMessage = async (req, res) => {
  try {
    const { group_id, message } = req.body;

    if (!group_id || !message) {
      return res
        .status(400)
        .json({ message: "group_id and message are required" });
    }

    // Check if a message already exists for the group
    let scrollText = await ScrollText.findOne({ where: { group_id } });

    if (scrollText) {
      // Update the existing message
      scrollText.message = message;
      await scrollText.save();
      await pushToGroupQueue([group_id]);
      return res
        .status(200)
        .json({ message: "Message updated successfully", scrollText });
    } else {
      // Create a new message record
      scrollText = await ScrollText.create({ group_id, message });
      await pushToGroupQueue([group_id]);

      return res
        .status(201)
        .json({ message: "Message added successfully", scrollText });
    }
  } catch (error) {
    logger.logError("Error in addMessage", error, {
      group_id: req.body.group_id,
    });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
// controllers/scrollTextController.js

module.exports.deleteMessage = async (req, res) => {
  try {
    const { group_id } = req.params;

    if (!group_id) {
      return res.status(400).json({ message: "group_id is required" });
    }

    // Find the message for the given group_id
    const scrollText = await ScrollText.findOne({ where: { group_id } });

    if (!scrollText) {
      return res
        .status(404)
        .json({ message: "Message not found for the given group" });
    }

    // Delete the record
    await scrollText.destroy();
    await pushToGroupQueue([group_id]);

    return res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    logger.logError("Error in deleteMessage", error, {
      group_id: req.params.group_id,
    });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

// Utility: get pagination params with defaults
const getPagination = (req) => {
  const page = parseInt(req.query.page, 10) || 1; // default page 1
  const limit = parseInt(req.query.limit, 10) || 50; // default 50 logs
  const offset = (page - 1) * limit;
  return { limit, offset, page };
};

module.exports.getProofOfPlayLog = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Device ID is required" });
    }

    const { limit, offset, page } = getPagination(req);

    const { rows: logs, count } = await ProofOfPlayLog.findAndCountAll({
      where: { device_id: id },
      order: [["start_time", "DESC"]],
      limit,
      offset,
    });

    return res.status(200).json({
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
      data: logs,
    });
  } catch (error) {
    logger.logError("Error fetching ProofOfPlay logs", error, {
      device_id: req.params.id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getDeviceTelemetryLog = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Device ID is required" });
    }

    const { limit, offset, page } = getPagination(req);

    const { rows: logs, count } = await DeviceTelemetryLog.findAndCountAll({
      where: { device_id: id },
      order: [["timestamp", "DESC"]],
      limit,
      offset,
    });

    return res.status(200).json({
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
      data: logs,
    });
  } catch (error) {
    logger.logError("Error fetching DeviceTelemetry logs", error, {
      device_id: req.params.id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getDeviceEventLog = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Device ID is required" });
    }

    const { limit, offset, page } = getPagination(req);

    const { rows: logs, count } = await DeviceEventLog.findAndCountAll({
      where: { device_id: id },
      order: [["timestamp", "DESC"]],
      limit,
      offset,
    });

    return res.status(200).json({
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
      data: logs,
    });
  } catch (error) {
    logger.logError("Error fetching DeviceEvent logs", error, {
      device_id: req.params.id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.addDeviceEvent = async (req, res) => {
  try {
    const { deviceId, sentAt, logs } = req.body;

    // Validate deviceId
    if (!deviceId || typeof deviceId !== "string") {
      return res.status(400).json({ error: "Valid deviceId is required" });
    }

    // Validate logs object
    if (!logs || typeof logs !== "object") {
      return res.status(400).json({ error: "Logs must be a valid object" });
    }

    // Track which logs failed (for partial success response)
    const result = {
      proofOfPlay: "skipped",
      telemetry: "skipped",
      events: "skipped",
    };

    // Insert Proof of Play logs
    if (Array.isArray(logs.proofOfPlay) && logs.proofOfPlay.length > 0) {
      try {
        await ProofOfPlayLog.bulkCreate(
          logs.proofOfPlay.map((log) => ({
            // event_id: log.eventId || null,
            event_id: uuidv4(),
            ad_id: log.adId || null,
            schedule_id: log.scheduleId || null,
            start_time: log.startTime || null,
            end_time: log.endTime || null,
            duration_played_ms: log.durationPlayedMs || 0,
            device_id: deviceId,
            sent_at: sentAt || new Date(),
          }))
        );
        result.proofOfPlay = "success";
      } catch (err) {
        logger.logError("Error inserting ProofOfPlay logs", err, { deviceId });
        result.proofOfPlay = "failed";
      }
    }

    // Insert Telemetry logs
    if (Array.isArray(logs.telemetry) && logs.telemetry.length > 0) {
      try {
        await DeviceTelemetryLog.bulkCreate(
          logs.telemetry.map((log) => ({
            timestamp: log.timestamp || new Date(),
            cpu_usage: log.cpuUsage ?? null,
            ram_free_mb: log.ramFreeMb ?? null,
            device_id: deviceId,
            sent_at: sentAt || new Date(),
          }))
        );
        result.telemetry = "success";
      } catch (err) {
        logger.logError("Error inserting Telemetry logs", err, { deviceId });
        result.telemetry = "failed";
      }
    }

    // Insert Device Events
    if (Array.isArray(logs.events) && logs.events.length > 0) {
      try {
        await DeviceEventLog.bulkCreate(
          logs.events.map((log) => ({
            // event_id: log.eventId || null,
            event_id: uuidv4(),
            timestamp: log.timestamp || new Date(),
            event_type: log.eventType || "unknown",
            payload: JSON.stringify(log.payload || {}),
            device_id: deviceId,
            sent_at: sentAt || new Date(),
          }))
        );
        result.events = "success";
      } catch (err) {
        logger.logError("Error inserting Device Events", err, { deviceId });
        result.events = "failed";
      }
    }

    return res.json({
      message: "Logs processed",
      status: result,
    });
  } catch (error) {
    logger.logError("Unexpected error in addDeviceEvent", error, {
      deviceId: req.body.deviceId,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

// module.exports.getDeviceDetails = async (req, res) => {
//   try {
//     const { id } = req.params;
//     if (!id) {
//       return res.status(400).json({ error: "Device ID is required" });
//     }

//     const device = await Device.findOne({
//       where: { device_id: id },
//       include: [
//         {
//           model: DeviceGroup,
//           attributes: ["name", "reg_code", "group_id"],
//         },
//       ],
//     });

//     const schedules = await Schedule.findAll({
//       where: { group_id: device.DeviceGroup.group_id },
//       include: [{ model: Ad, attributes: ["name"] }],
//     });

//     if (!device) {
//       return res.status(404).json({ error: "Device not found" });
//     }

//     return res.status(200).json({ device, schedules });
//   } catch (error) {
//     console.error("Error fetching device details:", error);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };

// Utility: pagination helper
const getPaginationDeviceData = (req) => {
  const page = parseInt(req.query.page, 10) || 1; // default page = 1
  const limit = parseInt(req.query.limit, 10) || 50; // default 50 schedules
  const offset = (page - 1) * limit;
  return { limit, offset, page };
};

module.exports.getDeviceDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Device ID is required" });
    }

    // Get device with group
    const device = await Device.findOne({
      where: { device_id: id },
      include: [
        {
          model: DeviceGroup,
          attributes: ["name", "group_id"],
        },
      ],
    });

    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    const { limit, offset, page } = getPaginationDeviceData(req);
    const { startDate, endDate } = req.query;

    // Build filter for schedules
    let whereCondition = { group_id: device.DeviceGroup.group_id };

    if (startDate && endDate) {
      // Filter by given date range
      whereCondition.start_time = {
        [Op.between]: [
          moment(startDate).startOf("day").toDate(),
          moment(endDate).endOf("day").toDate(),
        ],
      };
    } else {
      // Default: today's schedules
      whereCondition.start_time = {
        [Op.between]: [
          moment().startOf("day").toDate(),
          moment().endOf("day").toDate(),
        ],
      };
    }

    // Fetch schedules with pagination
    const { rows: schedules, count } = await Schedule.findAndCountAll({
      where: whereCondition,
      include: [{ model: Ad, attributes: ["name"] }],
      order: [["start_time", "ASC"]],
      limit,
      offset,
    });

    return res.status(200).json({
      device,
      schedules: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
        data: schedules,
      },
    });
  } catch (error) {
    logger.logError("Error fetching device details", error, {
      device_id: req.params.id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.exportProofOfPlayReport = async (req, res) => {
  try {
    const { filter, device_id, start_date, end_date } = req.query;

    let whereCondition = {};

    // --- Date filter ---
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      whereCondition.start_time = { [Op.between]: [start, end] };
    } else if (filter === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      whereCondition.start_time = { [Op.between]: [start, end] };
    } else if (filter === "yesterday") {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      whereCondition.start_time = { [Op.between]: [start, end] };
    }
    // if filter = full → no date condition

    // --- Device filter ---
    if (device_id) {
      whereCondition.device_id = device_id;
    }

    // --- Fetch logs with Ad + Device joins ---
    const logs = await ProofOfPlayLog.findAll({
      where: whereCondition,
      attributes: ["ad_id", "device_id", "start_time"],
      include: [
        {
          model: Ad,
          attributes: ["name", "duration"],
          required: false,
        },
        {
          model: Device,
          attributes: ["device_name"],
          required: false,
        },
      ],
      raw: true,
      nest: true,
    });

    if (!logs.length) {
      return res.status(404).json({ message: "No proof of play logs found" });
    }

    // --- Group and aggregate ---
    const reportData = logs.reduce((acc, log) => {
      const key = `${log.device_id}_${log.ad_id}`;
      const adDuration = log.Ad?.duration || 0;

      if (!acc[key]) {
        acc[key] = {
          device_id: log.device_id,
          device_name: log.Device?.device_name || "Unknown Device",
          ad_id: log.ad_id,
          ad_name: log.Ad?.name || "Unknown Ad",
          ad_duration: adDuration,
          total_plays: 0,
        };
      }

      acc[key].total_plays += 1;
      return acc;
    }, {});

    // --- Add total play time ---
    const reportArray = Object.values(reportData).map((item) => ({
      ...item,
      total_play_time: item.total_plays * item.ad_duration,
    }));

    // --- Create Excel workbook ---
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("ProofOfPlayReport");

    // Header columns
    worksheet.columns = [
      { header: "Device ID", key: "device_id", width: 25 },
      { header: "Device Name", key: "device_name", width: 30 },
      { header: "Ad ID", key: "ad_id", width: 25 },
      { header: "Ad Name", key: "ad_name", width: 35 },
      { header: "Ad Duration (sec)", key: "ad_duration", width: 20 },
      { header: "Total Plays", key: "total_plays", width: 15 },
      { header: "Total Play Time (sec)", key: "total_play_time", width: 20 },
    ];

    // Add data rows
    reportArray.forEach((row) => worksheet.addRow(row));

    // --- Style header ---
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFCCE5FF" },
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // --- Generate Excel file ---
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `proof_of_play_report_${device_id || "all"}_${
      filter || `${start_date || "from"}-${end_date || "to"}`
    }.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(buffer);
  } catch (error) {
    logger.logError("Error exporting ProofOfPlay report", error, {
      device_id: req.query.device_id,
      filter: req.query.filter,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Helper function to format date and time
const formatDateTime = (dateValue) => {
  if (!dateValue) return "N/A";

  const m = moment(dateValue).tz("Asia/Kolkata");
  if (!m.isValid()) return "N/A";

  return m.format("DD/MM/YYYY, hh:mm:ss A");
};

module.exports.exportAdsProofOfPlayReport = async (req, res) => {
  try {
    const { ad_id, filter, start_date, end_date } = req.query;

    // Validate ad_id parameter
    if (!ad_id) {
      return res.status(400).json({
        error:
          "ad_id parameter is required (single ID, comma-separated IDs, or 'all')",
      });
    }

    // Build ad filter
    let adFilter = {};
    let adIds = [];

    if (ad_id.toLowerCase() === "all") {
      // No filter - get all ads
      adFilter = {};
    } else if (ad_id.includes(",")) {
      // Multiple ad IDs
      adIds = ad_id.split(",").map((id) => id.trim());
      adFilter = { ad_id: { [Op.in]: adIds } };
    } else {
      // Single ad ID
      adIds = [ad_id];
      adFilter = { ad_id };
    }

    // Build date filter
    let dateFilter = {};
    let filterLabel = "All Time";

    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      dateFilter.start_time = { [Op.between]: [start, end] };
      filterLabel = `${start_date} to ${end_date}`;
    } else if (filter === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      dateFilter.start_time = { [Op.between]: [start, end] };
      filterLabel = "Today";
    } else if (filter === "yesterday") {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      dateFilter.start_time = { [Op.between]: [start, end] };
      filterLabel = "Yesterday";
    } else if (filter === "week") {
      const start = new Date();
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(end.getDate() - end.getDay() + 6);
      end.setHours(23, 59, 59, 999);
      dateFilter.start_time = { [Op.between]: [start, end] };
      filterLabel = "This Week";
    } else if (filter === "month") {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      dateFilter.start_time = { [Op.between]: [start, end] };
      filterLabel = "This Month";
    } else if (filter === "year") {
      const start = new Date();
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      dateFilter.start_time = { [Op.between]: [start, end] };
      filterLabel = "This Year";
    } else if (filter === "all") {
      // No filter
      filterLabel = "All Time";
    } else if (filter) {
      return res.status(400).json({
        error:
          "Invalid filter. Use: today, yesterday, week, month, year, or all",
      });
    }

    // Fetch proof of play logs for the specified ads
    const logs = await ProofOfPlayLog.findAll({
      where: { ...adFilter, ...dateFilter },
      attributes: [
        "id",
        "event_id",
        "ad_id",
        "device_id",
        "start_time",
        "end_time",
        "duration_played_ms",
      ],
      include: [
        {
          model: Ad,
          attributes: ["name", "duration"],
          required: true,
        },
        {
          model: Device,
          attributes: ["device_id", "device_name"],
          required: true,
        },
      ],
      order: [
        ["device_id", "ASC"],
        ["start_time", "DESC"],
      ],
    });

    if (!logs.length) {
      return res.status(404).json({
        message: "No proof of play logs found for the specified ads",
      });
    }

    // Group logs by device (keep all individual entries)
    const logsByDevice = {};
    logs.forEach((log) => {
      const deviceId = log.Device.device_id;
      if (!logsByDevice[deviceId]) {
        logsByDevice[deviceId] = {
          device_id: deviceId,
          device_name: log.Device.device_name,
          logs: [],
        };
      }
      logsByDevice[deviceId].logs.push(log);
    });

    // Create workbook with multiple sheets (one per device)
    const workbook = new ExcelJS.Workbook();

    // Add summary sheet with aggregated data by device and ad
    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.columns = [
      { header: "Device ID", key: "device_id", width: 40 },
      { header: "Device Name", key: "device_name", width: 30 },
      { header: "Ad ID", key: "ad_id", width: 40 },
      { header: "Ad Name", key: "ad_name", width: 30 },
      { header: "Ad Duration (sec)", key: "ad_duration", width: 18 },
      { header: "Total Plays", key: "total_plays", width: 15 },
      {
        header: "Total Play Time (sec)",
        key: "total_play_time_sec",
        width: 20,
      },
    ];

    // Aggregate data by device and ad
    const summaryData = [];
    logs.forEach((log) => {
      const existing = summaryData.find(
        (item) =>
          item.device_id === log.Device.device_id && item.ad_id === log.ad_id
      );

      if (existing) {
        existing.total_plays += 1;
        existing.total_play_time_ms += log.duration_played_ms || 0;
      } else {
        summaryData.push({
          device_id: log.Device.device_id,
          device_name: log.Device.device_name,
          ad_id: log.ad_id,
          ad_name: log.Ad?.name || "Unknown Ad",
          ad_duration: log.Ad?.duration || 0,
          total_plays: 1,
          total_play_time_ms: log.duration_played_ms || 0,
        });
      }
    });

    // Add aggregated rows to summary sheet
    summaryData.forEach((item) => {
      summarySheet.addRow({
        device_id: item.device_id,
        device_name: item.device_name,
        ad_id: item.ad_id,
        ad_name: item.ad_name,
        ad_duration: item.ad_duration,
        total_plays: item.total_plays,
        total_play_time_sec: (item.total_play_time_ms / 1000).toFixed(2),
      });
    });

    // Style summary header
    summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    summarySheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };

    // Add a sheet for each device
    let sheetCounter = 0;
    Object.values(logsByDevice).forEach((deviceData) => {
      sheetCounter++;
      // Create unique sheet name: device_name (device_id) - max 31 chars
      let sheetName =
        `${deviceData.device_name} (${deviceData.device_id})`.substring(0, 31);

      // If still duplicate, add counter
      let finalSheetName = sheetName;
      let counter = 1;
      const existingSheets = workbook.worksheets.map((ws) => ws.name);
      while (existingSheets.includes(finalSheetName)) {
        finalSheetName = `${sheetName.substring(0, 25)}_${counter}`.substring(
          0,
          31
        );
        counter++;
      }

      const sheet = workbook.addWorksheet(finalSheetName);

      sheet.columns = [
        { header: "Event ID", key: "event_id", width: 20 },
        { header: "Ad ID", key: "ad_id", width: 20 },
        { header: "Ad Name", key: "ad_name", width: 30 },
        { header: "Play Start Time", key: "start_time", width: 25 },
        {
          header: "Play End Time",
          key: "end_time",
          width: 25,
          // style: { numFmt: "dd/mm/yyyy hh:mm:ss" },
        },
        // {
        //   header: "Duration Played (ms)",
        //   key: "duration_played_ms",
        //   width: 20,
        // },
        { header: "Ad Duration (sec)", key: "ad_duration", width: 18 },
      ];

      // Add individual entry rows
      deviceData.logs.forEach((log) => {
        sheet.addRow({
          event_id: log.event_id || "N/A",
          ad_id: log.ad_id,
          ad_name: log.Ad?.name || "Unknown Ad",
          start_time: formatDateTime(log.start_time),
          end_time: formatDateTime(log.end_time),
          // end_time: log.end_time,
          // duration_played_ms: log.duration_played_ms || "N/A",
          ad_duration: log.Ad?.duration || "N/A",
        });
      });

      // Style header
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF70AD47" },
      };
    });

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();

    const adLabel =
      ad_id.toLowerCase() === "all"
        ? "all_ads"
        : ad_id.replace(/,/g, "_").substring(0, 20);
    const filename = `ads_proof_of_play_${adLabel}_${filterLabel.replace(
      / /g,
      "_"
    )}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(buffer);
  } catch (error) {
    logger.logError("Error exporting Ads ProofOfPlay report", error, {
      ad_id: req.query.ad_id,
      filter: req.query.filter,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.exportDeviceEventLogs = async (req, res) => {
  try {
    const { device_id, start_date, end_date, filter } = req.query;
    let whereCondition = {};

    // --- Date Filter ---
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      whereCondition.timestamp = { [Op.between]: [start, end] };
    } else if (filter === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      whereCondition.timestamp = { [Op.between]: [start, end] };
    } else if (filter === "yesterday") {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      whereCondition.timestamp = { [Op.between]: [start, end] };
    }

    if (device_id) {
      whereCondition.device_id = device_id;
    }

    // --- Fetch logs ---
    const logs = await DeviceEventLog.findAll({
      where: whereCondition,
      attributes: [
        "event_id",
        "device_id",
        "timestamp",
        "event_type",
        "payload",
      ],
      raw: true,
      nest: true,
    });

    if (!logs.length) {
      return res.status(404).json({ message: "No device event logs found" });
    }

    // --- Format timestamps with time (e.g. 2025-10-26 14:35:22) ---
    const formattedLogs = logs.map((log) => ({
      ...log,
      timestamp: new Date(log.timestamp).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: true,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    }));

    // --- Create Excel ---
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("DeviceEventLogs");

    worksheet.columns = [
      { header: "Event ID", key: "event_id", width: 25 },
      { header: "Device ID", key: "device_id", width: 25 },
      { header: "Timestamp", key: "timestamp", width: 30 },
      { header: "Event Type", key: "event_type", width: 20 },
      { header: "Payload", key: "payload", width: 50 },
    ];

    formattedLogs.forEach((row) => worksheet.addRow(row));

    // --- Header Style ---
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFCCE5FF" },
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `device_event_logs_${device_id || "all"}_${
      filter || `${start_date || "from"}-${end_date || "to"}`
    }.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(buffer);
  } catch (error) {
    logger.logError("Error exporting DeviceEvent logs", error, {
      device_id: req.query.device_id,
      filter: req.query.filter,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Export full device details with all related data to Excel
 * Includes: Device Info, Schedules, Proof of Play, Telemetry, Event Logs
 * Multiple sheets for different data types
 */
module.exports.exportDeviceDetailsToExcel = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { start_date, end_date, filter } = req.query;

    if (!device_id) {
      return res.status(400).json({ error: "Device ID is required" });
    }

    // Fetch device with all related data
    const device = await Device.findOne({
      where: { device_id },
      include: [
        {
          model: DeviceGroup,
          attributes: ["group_id", "name", "client_id", "reg_code"],
        },
      ],
    });

    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    // Authorization check for non-admin users
    if (req.user && req.user.role === "Client" && req.user.client_id) {
      if (device.DeviceGroup.client_id !== req.user.client_id) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // Build date filter based on filter parameter or start_date/end_date
    const dateFilter = {};
    let filterLabel = "All Time";

    if (start_date && end_date) {
      // Custom date range
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      dateFilter.timestamp = { [Op.between]: [start, end] };
      filterLabel = `${start_date} to ${end_date}`;
    } else if (filter === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      dateFilter.timestamp = { [Op.between]: [start, end] };
      filterLabel = "Today";
    } else if (filter === "yesterday") {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      dateFilter.timestamp = { [Op.between]: [start, end] };
      filterLabel = "Yesterday";
    } else if (filter === "week") {
      const start = new Date();
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(end.getDate() - end.getDay() + 6);
      end.setHours(23, 59, 59, 999);
      dateFilter.timestamp = { [Op.between]: [start, end] };
      filterLabel = "This Week";
    } else if (filter === "month") {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      dateFilter.timestamp = { [Op.between]: [start, end] };
      filterLabel = "This Month";
    } else if (filter === "year") {
      const start = new Date();
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      dateFilter.timestamp = { [Op.between]: [start, end] };
      filterLabel = "This Year";
    } else if (filter === "all") {
      // No filter, get all data
      filterLabel = "All Time";
    } else if (filter) {
      return res.status(400).json({
        error:
          "Invalid filter. Use: today, yesterday, week, month, year, or all",
      });
    }

    // Fetch all related data
    const [schedules, proofOfPlayLogs, telemetryLogs, eventLogs] =
      await Promise.all([
        Schedule.findAll({
          where: { group_id: device.group_id },
          include: [
            {
              model: Ad,
              attributes: ["name", "duration"],
            },
          ],
          order: [["start_time", "DESC"]],
        }),
        ProofOfPlayLog.findAll({
          where: {
            device_id,
            ...(Object.keys(dateFilter).length > 0 && {
              start_time: dateFilter.timestamp,
            }),
          },
          include: [
            {
              model: Ad,
              attributes: ["name"],
            },
          ],
          order: [["start_time", "DESC"]],
        }),
        DeviceTelemetryLog.findAll({
          where: { device_id, ...dateFilter },
          order: [["timestamp", "DESC"]],
        }),
        DeviceEventLog.findAll({
          where: { device_id, ...dateFilter },
          order: [["timestamp", "DESC"]],
        }),
      ]);

    // Create workbook
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Device Information
    const deviceSheet = workbook.addWorksheet("Device Info");
    deviceSheet.columns = [
      { header: "Field", key: "field", width: 25 },
      { header: "Value", key: "value", width: 40 },
    ];

    // Helper function to format date and time
    const formatDateTime = (dateValue) => {
      if (!dateValue) return "N/A";
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return "N/A";

      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();

      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      const ampm = hours >= 12 ? "pm" : "am";
      hours = hours % 12;
      hours = hours ? hours : 12;
      const hoursStr = String(hours).padStart(2, "0");

      return `${day}/${month}/${year}, ${hoursStr}:${minutes}:${seconds} ${ampm}`;
    };

    const deviceData = [
      { field: "Report Generated", value: formatDateTime(new Date()) },
      { field: "Data Range", value: filterLabel },
      { field: "Device ID", value: device.device_id },
      { field: "Device Name", value: device.device_name || "N/A" },
      { field: "Android ID", value: device.android_id },
      { field: "Device Type", value: device.device_type },
      { field: "Device Model", value: device.device_model || "N/A" },
      { field: "Device OS", value: device.device_os || "N/A" },
      { field: "OS Version", value: device.device_os_version || "N/A" },
      { field: "Resolution", value: device.device_resolution || "N/A" },
      { field: "Orientation", value: device.device_orientation },
      { field: "Location", value: device.location },
      { field: "Status", value: device.status },
      { field: "Registration Status", value: device.registration_status },
      { field: "Device On Time", value: device.device_on_time },
      { field: "Device Off Time", value: device.device_off_time },
      { field: "Group Name", value: device.DeviceGroup?.name || "N/A" },
      { field: "Group ID", value: device.DeviceGroup?.group_id || "N/A" },
      { field: "License Key", value: device.DeviceGroup?.reg_code || "N/A" },
      { field: "Last Synced", value: formatDateTime(device.last_synced) },
      { field: "Tags", value: device.tags?.join(", ") || "N/A" },
    ];

    deviceSheet.addRows(deviceData);

    // Style header row
    deviceSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    deviceSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };

    // Sheet 2: Schedules
    const scheduleSheet = workbook.addWorksheet("Schedules");
    scheduleSheet.columns = [
      { header: "Schedule ID", key: "schedule_id", width: 20 },
      { header: "Ad Name", key: "ad_name", width: 25 },
      { header: "Ad Duration (sec)", key: "duration", width: 15 },
      { header: "Schedule Start Time", key: "start_time", width: 20 },
      { header: "Schedule End Time", key: "end_time", width: 20 },
      { header: "Priority", key: "priority", width: 10 },
    ];

    const scheduleData = schedules.map((s) => ({
      schedule_id: s.schedule_id,
      ad_name: s.Ad?.name || "N/A",
      duration: s.Ad?.duration || "N/A",
      start_time: formatDateTime(s.start_time),
      end_time: formatDateTime(s.end_time),
      priority: s.priority,
    }));

    scheduleSheet.addRows(scheduleData);

    // Style header row
    scheduleSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    scheduleSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF70AD47" },
    };

    // Sheet 3: Proof of Play Logs
    const proofOfPlaySheet = workbook.addWorksheet("Proof of Play");
    proofOfPlaySheet.columns = [
      { header: "Event ID", key: "event_id", width: 20 },
      { header: "Ad Name", key: "ad_name", width: 25 },
      { header: "Play Start Time", key: "start_time", width: 20 },
      { header: "Play End Time", key: "end_time", width: 20 },
      { header: "Duration Played (ms)", key: "duration_played_ms", width: 18 },
    ];

    const proofOfPlayData = proofOfPlayLogs.map((p) => ({
      event_id: p.event_id,
      ad_name: p.Ad?.name || "N/A",
      start_time: formatDateTime(p.start_time),
      end_time: formatDateTime(p.end_time),
      duration_played_ms: p.duration_played_ms,
    }));

    proofOfPlaySheet.addRows(proofOfPlayData);

    // Style header row
    proofOfPlaySheet.getRow(1).font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    proofOfPlaySheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFC55A11" },
    };

    // Sheet 4: Telemetry Logs
    const telemetrySheet = workbook.addWorksheet("Telemetry");
    telemetrySheet.columns = [
      { header: "Timestamp", key: "timestamp", width: 20 },
      { header: "CPU Usage (%)", key: "cpu_usage", width: 15 },
      { header: "RAM Free (MB)", key: "ram_free_mb", width: 15 },
      { header: "Storage Free (MB)", key: "storage_free_mb", width: 18 },
      { header: "Network Type", key: "network_type", width: 15 },
      { header: "App Version Code", key: "app_version_code", width: 15 },
    ];

    const telemetryData = telemetryLogs.map((t) => ({
      timestamp: formatDateTime(t.timestamp),
      cpu_usage: t.cpu_usage || "N/A",
      ram_free_mb: t.ram_free_mb || "N/A",
      storage_free_mb: t.storage_free_mb || "N/A",
      network_type: t.network_type || "N/A",
      app_version_code: t.app_version_code || "N/A",
    }));

    telemetrySheet.addRows(telemetryData);

    // Style header row
    telemetrySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    telemetrySheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF5B9BD5" },
    };

    // Sheet 5: Event Logs
    const eventSheet = workbook.addWorksheet("Event Logs");
    eventSheet.columns = [
      { header: "Event ID", key: "event_id", width: 20 },
      { header: "Event Type", key: "event_type", width: 20 },
      { header: "Timestamp", key: "timestamp", width: 20 },
      { header: "Payload", key: "payload", width: 50 },
    ];

    const eventData = eventLogs.map((e) => ({
      event_id: e.event_id,
      event_type: e.event_type,
      timestamp: formatDateTime(e.timestamp),
      payload: JSON.stringify(e.payload),
    }));

    eventSheet.addRows(eventData);

    // Style header row
    eventSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    eventSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF9E480E" },
    };

    // Generate filename
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `Device_Report_${
      device.device_name || device.device_id
    }_${timestamp}.xlsx`;

    // Send file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.logError("Error exporting device details", error, {
      device_id: req.params.id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};
