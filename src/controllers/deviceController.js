const jwt = require("jsonwebtoken");
const { getCustomUTCDateTime, getUTCDate } = require("../helpers");
const { Ad, Device, Schedule, sequelize, DeviceGroup, ScrollText } = require("../models");
const { addHours, setHours, setMinutes, formatISO } = require("date-fns");
const { getBucketURL } = require("./s3Controller");
const { Op, literal, fn } = require("sequelize");

const { pushToGroupQueue, convertToPushReadyJSON, exitDeviceAppliation } = require("./queueController");
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
    let { page = 1, limit = 10, date } = req.query; 
    page = parseInt(page);
    limit = parseInt(limit);
    
    const whereClause = {};
    
    if (date) {
      whereClause.start_time = {
        [Op.between]: [`${date} 00:00:00`, `${date} 23:59:59`]
      };
    }

    const { count, rows: schedules } = await Schedule.findAndCountAll({
      where: whereClause,
      include: [
        { model: Ad, attributes: ["name"] },
        { model: DeviceGroup, attributes: ["name"] },
      ],
      order: [["start_time", "DESC"]],
      limit,
      offset: (page - 1) * limit
    });

    const result = schedules.map((schedule) => {
      const { Ad, DeviceGroup, ...data } = schedule.dataValues;
      return { ...data, ad_name: Ad.name, group_name: DeviceGroup.name };
    });

    res.json({ schedules: result, total: count, page, limit });
  } catch (error) {
    console.error(error);
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
    const devices = await Device.findAll({
      include: {
        model: DeviceGroup,
        attributes: ["name", "last_pushed"],
      },
      raw: true,
      nest: true,
    });

    // Process each device and add status + location
    const deviceList = await Promise.all(
      devices.map(async (device) => {
        const last_synced = device.last_synced;
        const last_pushed = device.DeviceGroup?.last_pushed || null;
        const group_name = device.DeviceGroup?.name || null;


        return {
          ...device,
          group_name,
          status: last_pushed && last_synced < last_pushed ? "offline" : "active",
        };
      })
    );

    res.json({ devices: deviceList });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};



module.exports.getApkUrl = async (req, res) => {
  try {
    const url = await getBucketURL('adupPlayer.apk')
    res.json({message: `Download URL`, url});
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
module.exports.updateGroupSchedule = async (req, res) => {
  try {
    const {group_id} = req.params;

    await pushToGroupQueue([group_id])
   
    res.json({message: `Successfully updated group schedule`});
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.registerDevice = async (req, res) => {
  try {
    const { location, reg_code, android_id } = req.body;

    const groupExists = await DeviceGroup.findOne({
        attributes: ['group_id'],
        where: { reg_code } // Ensure `reg_code` is the actual column name
    });
    
    if (!groupExists) {
        return res.status(400).json({ message: "Invalid License Key" });
    }
    
    const group_id = groupExists.group_id; // Safe to access since we checked if it exists
    
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
      const jsonToSend = await convertToPushReadyJSON(group_id)
      
    return res.json({
      device_id,
      last_sync: getCustomUTCDateTime(),
      ...jsonToSend
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
    
    await exitDeviceAppliation(id);

    await Device.destroy({where:{device_id: id}});

    return res.json({
      message:"Successfully Deleted record"
  });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};


module.exports.createGroup = async (req, res) => {
  try {
    const { name, reg_code } = req.body;

    // Check if reg_code already exists
    const groupExists = await DeviceGroup.findOne({ where: { reg_code } });

    if (groupExists) {
      return res.status(400).json({ message: "License key already in use." });
    }

    // Create the group
    const group = await DeviceGroup.create({ name, reg_code });

    return res.status(201).json({ message: "Group created successfully", group });
  } catch (error) {
    console.error("Error creating group:", error);
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
        "reg_code",
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
