const jwt = require("jsonwebtoken");
const { getCustomUTCDateTime, getUTCDate } = require("../helpers");
const { Ad, Device, Schedule, sequelize, DeviceGroup } = require("../models");
const { addHours, setHours, setMinutes, formatISO } = require("date-fns");
const { getBucketURL } = require("./s3Controller");
const { Op } = require("sequelize");
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
    const schedules = await Schedule.findAll({
      include: [
        { model: Ad, attributes: ["name"] },
        { model: DeviceGroup, attributes: ["name"] },
      ],
      order: [["start_time", "DESC"]],
    });

    //   console.log(schedules)

    //
    const result = schedules.map((schedule) => {
      const { Ad, DeviceGroup, ...data } = schedule.dataValues;

      return {
        ...data,
        ad_name: Ad.name,
        group_name: DeviceGroup.name,
      };
    });

    res.json({ schedules: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
module.exports.getDeviceList = async (req, res) => {
  try {
    const devices = await Device.findAll({
      include: { model: DeviceGroup, attributes: ["name"] },
      raw: true,
      nest: true,
    });

    // Flatten the Client name field
    const flattenedDevices = devices.map((device) => ({
      ...device,
      group_name: device.DeviceGroup?.name || null, // Extracts 'name' from 'Client' and puts it in 'client_name'
    }));
    res.json({ devices: flattenedDevices });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
module.exports.registerDevice = async (req, res) => {
  try {
    const { location, group_id, android_id } = req.body;
    console.log("andorid id", android_id, location, group_id);
    const deviceExists = await Device.findOne({
      where: {
        android_id,
        group_id,
      },
    });
console.log('device Exists',deviceExists)
    if (deviceExists) {
      const deviceUpdate = await Device.update(
        {
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
      console.log('device update',deviceUpdate)

      const payload = {
        device_id: deviceExists.device_id,
        group_id: deviceExists.group_id,
        last_synced: deviceExists.last_synced,
      };
      console.log('payload -------->',payload)
      const token = jwt.sign(payload
        , process.env.JWT_DEVICE_SECRET, {
        expiresIn: "30d",
      });

      const url = await getBucketURL("placeholder.jpg");

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
    console.log('device',device)

    const payload = {
      device_id: device.device_id,
      group_id: device.group_id,
      last_synced: device.last_synced,
    };
    console.log('payload -------->',payload)
    const token = jwt.sign(
     payload,
      process.env.JWT_DEVICE_SECRET,
      { expiresIn: "30d" }
    );

    const url = await getBucketURL("placeholder.jpg");

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

module.exports.syncDevice = async (req, res) => {
  try {
    const { group_id, device_id } = req.device;
    if (!device_id) {
      return res.status(400).json({ error: "Device ID is required" });
    }
    if (!group_id) {
      return res.status(400).json({ error: "Group ID is required" });
    }

    const today = new Date(getCustomUTCDateTime()); 

    // Construct the start and end times in ISO format
    const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 6, 0, 0, 0)).toISOString(); // 6 AM UTC
    const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 22, 0, 0, 0)).toISOString(); // 10 PM UTC

    const scheduledAds = await Schedule.findAll({
      where: {
        group_id,
        start_time: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
      include: [{ model: Ad }],
    });

    // Update last sync time in the database
    await Device.update(
      { last_synced: getCustomUTCDateTime() },
      { where: { device_id } }
    );

    // Process ads asynchronously
    const ads = await Promise.all(
      scheduledAds.map(async (schedule) => {
        console.log(schedule);
        const url = await getBucketURL(schedule.Ad.url);
        return {
          ad_id: schedule.Ad.ad_id,
          name: schedule.Ad.name,
          url,
          duration: schedule.Ad.duration,
          start_time: schedule.start_time,
        };
      })
    );


    return res.json({
      device_id,
      last_sync: getCustomUTCDateTime(),
      ads,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};


module.exports.createGroup = async (req, res) => {
  try {
    const { name } = req.body;

    const group = await DeviceGroup.create({ name });

    return res
      .status(201)
      .json({ message: "group created succesfully", group });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.fetchGroups = async (req, res) => {
  try {
    const groups = await DeviceGroup.findAll({
      attributes: [
        "group_id",
        "name",
        [
          sequelize.fn("COUNT", sequelize.col("Devices.device_id")),
          "device_count",
        ],
      ],
      include: [
        {
          model: Device,
          attributes: [],
        },
      ],
      group: ["DeviceGroup.group_id"],
      raw: true,
    });
    return res.status(201).json({ groups });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
