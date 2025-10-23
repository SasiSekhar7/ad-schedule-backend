const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
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
    console.error(error);
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
    console.error(error);
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
    const todayStart = moment().startOf("day").format("YYYY-MM-DD HH:mm:ss");

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
    console.error("Error in getFullSchedule_v2:", error);
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
    console.error("Error fetching location:", error);
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
    console.error(error);
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
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.getWgtUrl = async (req, res) => {
  try {
    const url = await getBucketURL("adupPlayer.wgt");
    res.json({ message: `Download URL`, url });
  } catch (error) {
    console.error(error);
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
    console.error("Error serving .wgt file:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.updateGroupSchedule = async (req, res) => {
  try {
    const { group_id } = req.params;

    await pushToGroupQueue([group_id]);

    res.json({ message: `Successfully updated group schedule` });
  } catch (error) {
    console.error(error);
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
    console.log("groupExists", groupExists);

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
    console.log("device Exists", deviceExists);
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
      console.log("payload -------->", payload);
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
    console.error(error);
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
      !["mobile", "laptop", "tv", "tablet", "desktop"].includes(device_type)
    ) {
      return res.status(400).json({
        message:
          "device_type must be one of: mobile, laptop, tv, tablet, desktop",
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
    console.error("Error registering new device:", error);
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
    console.error("Error fetching device by pairing code:", error);
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
    console.error("Error updating device details:", error);
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

    if (group_id) {
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
    console.error("Error updating device:", error);
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
    device.last_sync = await device.save();

    return res.status(200).json({
      message: "Device details updated successfully",
      device_id: device.device_id,
    });
  } catch (error) {
    console.error("Error updating device:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.updateDeviceMetadata = async (req, res) => {
  try {
    const { device_id } = req.params;
    console.log("body", req.body);

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
    console.error("Error updating device location:", error);
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
    console.error("Error completing device registration:", error);
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
    console.error("Error fetching groups:", error);
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
    console.log(`📌 Processing group: ${group_id}`);
    const jsonToSend = await convertToPushReadyJSON(group_id);

    return res.json({
      device_id,
      last_sync: getCustomUTCDateTime(),
      ...jsonToSend,
    });
  } catch (error) {
    console.error("Sync error:", error);
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
      message: "Successfully Deleted record",
    });
  } catch (error) {
    console.error("Sync error:", error);
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
    console.error("Error creating group:", error);
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

    await group.save();

    await pushToGroupQueue([group_id]);

    return res.status(200).json({
      message: "Group updated successfully",
      group,
    });
  } catch (error) {
    console.error("Error updating group:", error);
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
    console.error("Error fetching groups:", error);
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
    console.error("Sync error:", error);
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
    console.error("Error in addMessage:", error);
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
    console.error("Error in deleteMessage:", error);
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
    console.error("Error fetching ProofOfPlay logs:", error);
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
    console.error("Error fetching DeviceTelemetry logs:", error);
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
    console.error("Error fetching DeviceEvent logs:", error);
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
        console.error("Error inserting ProofOfPlay logs:", err);
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
        console.error("Error inserting Telemetry logs:", err);
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
        console.error("Error inserting Device Events:", err);
        result.events = "failed";
      }
    }

    return res.json({
      message: "Logs processed",
      status: result,
    });
  } catch (error) {
    console.error("Unexpected error in addDeviceEvent:", error);
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
    console.error("Error fetching device details:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
