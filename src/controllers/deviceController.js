const jwt = require("jsonwebtoken");
const { getCustomUTCDateTime, getUTCDate } = require("../helpers");
const { Ad, Device, Schedule, sequelize, DeviceGroup, ScrollText } = require("../models");
const { addHours, setHours, setMinutes, formatISO } = require("date-fns");
const { getBucketURL } = require("./s3Controller");
const { Op, literal, fn } = require("sequelize");
const { pushToGroupQueue } = require("./queueController");
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
      await Device.update(
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

    const payload = {
      device_id: device.device_id,
      group_id: device.group_id,
      last_synced: device.last_synced,
    };
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
      console.log(`📌 Processing group: ${group_id}`);

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

      console.log(
        `📅 Filtering ads between ${startOfDay} and ${endOfDay} for group ${group_id}`
      );

      const scheduledAds = await Schedule.findAll({
        where: {
          group_id,
          start_time: {
            [Op.between]: [startOfDay, endOfDay],
          },
        },
        include: [{ model: Ad }],
      });

      let ads = [];
      // Process ads asynchronously
      if(scheduledAds.length>0 ){
        ads = await Promise.all(
        scheduledAds.map(async (schedule) => {
          console.log(`📦 Processing ad: ${JSON.stringify(schedule.Ad)}`);
          try {
            const url = await getBucketURL(schedule.Ad.url);
            console.log(`🔗 Resolved URL for ad ${schedule.Ad.ad_id}: ${url}`);
            return {
              ad_id: schedule.Ad.ad_id,
              name: schedule.Ad.name,
              url,
              duration: schedule.Ad.duration,
              total_plays: schedule.total_duration,
              start_time: schedule.start_time,
            };
          } catch (urlError) {
            console.error(
              `❌ Error fetching URL for ad ${schedule.Ad.ad_id}:`,
              urlError
            );
            return null; // Skip this ad
          }
        })
      );
    }else{
      const url = await getBucketURL("placeholder.jpg");

      ads.push(url)
    }
    let scrollingMessage;
    const message = await ScrollText.findOne({
      where: {
        group_id,
      },
      attributes: ['message']
    });
    
    // Extract the message if found, otherwise set a default value
    scrollingMessage = message ? message.message : "AdUp By demokrito Contact 98987687876";
    
     
      // Remove null ads (failed URL fetch)
      const validAds = ads.filter((ad) => ad !== null);
      console.log(
        `✅ Ready to publish ${validAds.length} ads for group ${group_id}`
      );
    return res.json({
      device_id,
      last_sync: getCustomUTCDateTime(),
      ads: validAds,
      rcs: scrollingMessage,

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
        [
          fn("COUNT", sequelize.col("Devices.device_id")),
          "device_count",
        ],
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
      const total720 = schedules.filter(s => s.total_duration === 720).length;
      const total360 = schedules.filter(s => s.total_duration === 360).length;
      const totalDuration = total720 * 720 + total360 * 360; // Sum of all ad play durations
      const maxCapacity = 8 * 720; // 8 full schedules of 720-play ads

      const batteryLevel = totalDuration > 0 ? ((totalDuration / maxCapacity) * 100).toFixed(2) : "0"; // Default to 0% if empty

      return {
        group_id: group.group_id,
        name: group.name,
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
      return res.status(400).json({ message: "group_id and message are required" });
    }

    // Check if a message already exists for the group
    let scrollText = await ScrollText.findOne({ where: { group_id } });

    if (scrollText) {
      // Update the existing message
      scrollText.message = message;
      await scrollText.save();
      await pushToGroupQueue([group_id])
      return res.status(200).json({ message: "Message updated successfully", scrollText });
    } else {
      // Create a new message record
      scrollText = await ScrollText.create({ group_id, message });
      await pushToGroupQueue([group_id])

      return res.status(201).json({ message: "Message added successfully", scrollText });
    }
  } catch (error) {
    console.error("Error in addMessage:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
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
      return res.status(404).json({ message: "Message not found for the given group" });
    }

    // Delete the record
    await scrollText.destroy();
    await pushToGroupQueue([group_id])

    return res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    console.error("Error in deleteMessage:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
