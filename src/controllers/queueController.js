const { Op } = require("sequelize");
const { getCustomUTCDateTime } = require("../helpers");
const {
  Schedule,
  Ad,
  ScrollText,
  Device,
  DeviceGroup,
  SelectedSeries,
} = require("../models");
const { default: mqtt } = require("mqtt");
const logger = require("../utils/logger");

const ad_Egress_lambda_url = process.env.AD_EGRESS_LAMBDA_URL;
const use_ad_egress_lambda = process.env.USE_AD_EGRESS_LAMBDA;
const rcs_message_default =
  process.env.RCS_MESSAGE || "AdUp By demokrito Contact 98987687876";
const brokerUrl = process.env.MQTT_URL;
const options = {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
};

// MQTT connection
logger.logInfo(`Connecting to MQTT broker`, { brokerUrl });
const mqttClient = mqtt.connect(brokerUrl, options);

mqttClient.on("connect", () => {
  logger.logInfo("MQTT Connected successfully");

  // Subscribe to the "device/sync" topic upon connection
  mqttClient.subscribe("device/sync", { qos: 2 }, (err, granted) => {
    if (err) {
      logger.logError("Error subscribing to MQTT topics", err);
    } else {
      logger.logInfo("Subscribed to MQTT topics", {
        topics: granted.map((g) => g.topic).join(", "),
      });
    }
  });
});
mqttClient.on("error", (err) => logger.logError("MQTT Connection Error", err));

module.exports.convertToPushReadyJSON = async (
  group_id,
  placeholder = null
) => {
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

  logger.logDebug(`Filtering ads for group`, {
    group_id,
    startOfDay,
    endOfDay,
  });

  const scheduledAds = await Schedule.findAll({
    where: {
      group_id,
      start_time: {
        [Op.between]: [startOfDay, endOfDay],
      },
    },
    include: [
      {
        model: Ad,
        where: {
          isDeleted: false, // ✅ only non-deleted ads
        },
        required: true, // ✅ ensures Schedule is returned ONLY if Ad exists
      },
    ],
  });

  logger.logDebug(`Found scheduled ads for group`, {
    group_id,
    count: scheduledAds.length,
  });

  if (scheduledAds.length === 0) {
    logger.logDebug(`No ads found for group, skipping`, { group_id });
  }

  const DeviceGroupData = await DeviceGroup.findOne({
    where: { group_id }, // Ensure `group_id` is the actual column name
  });

  // Process ads asynchronously
  const ads = await Promise.all(
    scheduledAds.map(async (schedule) => {
      try {
        let url;
        let file_extension;
        if (use_ad_egress_lambda == "true" || use_ad_egress_lambda == true) {
          url =
            ad_Egress_lambda_url +
            "/" +
            schedule.Ad.ad_id +
            "." +
            schedule.Ad.url.split(".").pop();
          file_extension = schedule.Ad.url.split(".").pop();
        } else {
          const { getBucketURL } = require("./s3Controller"); // Require inside function
          url = await getBucketURL(schedule.Ad.url);
          file_extension = schedule.Ad.url.split("?")[0].split(".").pop();
        }
        return {
          ad_id: schedule.Ad.ad_id,
          name: schedule.Ad.name,
          url,

          file_extension: file_extension,
          duration: schedule.Ad.duration,
          total_plays: schedule.total_duration,
          start_time: schedule.start_time,
        };
      } catch (urlError) {
        logger.logError(`Error fetching URL for ad`, urlError, {
          ad_id: schedule.Ad.ad_id,
        });
        return null; // Skip this ad
      }
    })
  );
  let scrollingMessage;
  const message = await ScrollText.findOne({
    where: {
      group_id,
    },
    attributes: ["message"],
  });

  // const matchData = await SelectedSeries.findOne({
  //   attributes: ["match_list"],
  //   where: { series_name: "IPL" },
  // });
  // const matchList = matchData?.match_list;

  scrollingMessage = message ? message.message : rcs_message_default;

  // if (matchList) {
  //   scrollingMessage = `${scrollingMessage} | Upcoming Fixtures: ${matchList}`;
  // }

  // Remove null ads (failed URL fetch)
  const validAds = ads.filter((ad) => ad !== null);
  logger.logDebug(`Ready to publish ads for group`, {
    group_id,
    validAdsCount: validAds.length,
  });

  const jsonToSend = {
    rcs: scrollingMessage,
    ads: validAds,
    placeholder: placeholder,
    rcs_enabled: DeviceGroupData.rcs_enabled ?? false,
    placeholder_enabled: DeviceGroupData.placeholder_enabled ?? false,
    logo_enabled: DeviceGroupData.logo_enabled ?? false,
  };
  return jsonToSend;
};

module.exports.pushToGroupQueue = async (groups, placeholder = null) => {
  try {
    logger.logInfo(`Processing groups for MQTT publish`, {
      groupCount: groups.length,
    });

    for (const group_id of groups) {
      logger.logDebug(`Processing group`, { group_id });

      const topic = `ads/${group_id}`;

      const jsonToSend = await this.convertToPushReadyJSON(
        group_id,
        placeholder
      );

      mqttClient.publish(
        topic,
        JSON.stringify(jsonToSend),
        { qos: 2, retain: true },
        (err) => {
          if (err) {
            logger.logError(`Failed to publish to MQTT topic`, err, { topic });
          } else {
            logger.logInfo(`Successfully published ads to MQTT topic`, {
              topic,
              qos: 2,
              retain: true,
            });
          }
        }
      );

      await DeviceGroup.update(
        {
          last_pushed: getCustomUTCDateTime(),
        },
        {
          where: {
            group_id,
          },
        }
      );
    }
  } catch (error) {
    logger.logError("Error in pushToGroupQueue", error);
  }
};

module.exports.exitDeviceAppliation = async (device_id) => {
  try {
    const topic = `device/${device_id}`;
    const message = {
      action: "exit",
    };

    mqttClient.publish(
      topic,
      JSON.stringify(message),
      { qos: 2, retain: false },
      (err) => {
        if (err) {
          logger.logError(`Failed to publish exit command to device`, err, {
            topic,
            device_id,
          });
        } else {
          logger.logInfo(`Successfully published exit command to device`, {
            topic,
            device_id,
          });
        }
      }
    );
    return true;
  } catch (error) {
    logger.logError("Error in exitDeviceApplication", error, { device_id });
    return false;
  }
};
module.exports.pushToCricketQueue = async (matchData) => {
  try {
    const topic = "cricket/live";

    mqttClient.publish(topic, matchData, { qos: 2, retain: true }, (err) => {
      if (err) {
        logger.logError(`Failed to publish cricket data to MQTT`, err, {
          topic,
        });
      } else {
        logger.logInfo(`Successfully published cricket data to MQTT`, {
          topic,
        });
      }
    });
  } catch (error) {
    logger.logError("Error in pushToCricketQueue", error);
  }
};
const deviceUpdateQueue = new Map(); // android_id => timestamp
const BATCH_INTERVAL_MS = 60000;

// Batch processing loop
setInterval(async () => {
  if (deviceUpdateQueue.size === 0) return;

  const updates = Array.from(deviceUpdateQueue.entries());
  deviceUpdateQueue.clear();

  const now = getCustomUTCDateTime(); // or new Date().toISOString()

  const promises = updates.map(([android_id]) =>
    Device.update({ last_synced: now }, { where: { android_id } }).catch(
      (err) => {
        logger.logError(`Failed to update device last_synced`, err, {
          android_id,
        });
      }
    )
  );

  await Promise.allSettled(promises);
  logger.logDebug(`Batch update completed`, {
    deviceCount: updates.length,
    timestamp: now,
  });
}, BATCH_INTERVAL_MS);

// On MQTT message
mqttClient.on("message", (topic, message) => {
  if (topic === "device/sync") {
    try {
      const payload = JSON.parse(message);
      const { android_id } = payload;

      if (android_id) {
        deviceUpdateQueue.set(android_id, Date.now()); // deduplicated
      }
    } catch (err) {
      logger.logError(
        "Invalid JSON or malformed payload from device sync",
        err
      );
    }
  }
});

module.exports.pushNewDeviceToQueue = async (device, placeholder = null) => {
  try {
    const topic = `device/register/${device.device_id}`;
    const jsonToSend = await this.convertToPushReadyJSON(
      device.group_id,
      placeholder
    );

    const payload = {
      action: "register",
      config: {
        mqtt_url: process.env.MQTT_URL,
      },
      android_id: device.android_id,
      device_id: device.device_id,
      device_name: device.device_name,
      group_id: device.group_id,
      device_orientation: device.device_orientation,
      device_resolution: device.device_resolution,
      device_type: device.device_type,
      ...jsonToSend,
    };
    logger.logInfo(`Pushing new device registration to MQTT`, {
      topic,
      device_id: device.device_id,
    });

    mqttClient.publish(
      topic,
      JSON.stringify(payload),
      { qos: 2, retain: false },
      (err) => {
        if (err) {
          logger.logError(`Failed to publish device registration`, err, {
            topic,
            device_id: device.device_id,
          });
        } else {
          logger.logInfo(`Successfully published device registration`, {
            topic,
            device_id: device.device_id,
          });
        }
      }
    );
  } catch (error) {
    logger.logError("Error in pushNewDeviceToQueue", error, {
      device_id: device?.device_id,
    });
  }
};

module.exports.updateDeviceGroup = async (device_id, group_id) => {
  try {
    const topic = `device/${device_id}`;
    const message = {
      action: "updateGroup",
      group_id: group_id,
      device_id: device_id,
    };

    mqttClient.publish(
      topic,
      JSON.stringify(message),
      { qos: 2, retain: false },
      (err) => {
        if (err) {
          logger.logError(`Failed to publish group update to device`, err, {
            topic,
            device_id,
            group_id,
          });
        } else {
          logger.logInfo(`Successfully published group update to device`, {
            topic,
            device_id,
            group_id,
          });
        }
      }
    );
  } catch (error) {
    logger.logError("Error in updateDeviceGroup", error, {
      device_id,
      group_id,
    });
  }
};

module.exports.updateDeviceMetaData = async (device_id, metadata) => {
  try {
    const topic = `device/${device_id}`;
    const message = {
      action: "updateDeviceMetaData",
      device_orientation: metadata.device_orientation,
      device_resolution: metadata.device_resolution,
    };

    mqttClient.publish(
      topic,
      JSON.stringify(message),
      { qos: 2, retain: false },
      (err) => {
        if (err) {
          logger.logError(`Failed to publish metadata update to device`, err, {
            topic,
            device_id,
          });
        } else {
          logger.logInfo(`Successfully published metadata update to device`, {
            topic,
            device_id,
          });
        }
      }
    );
  } catch (error) {
    logger.logError("Error in updateDeviceMetaData", error, { device_id });
  }
};

module.exports.DeviceOnOff = async (device_id, action) => {
  try {
    const topic = `device/${device_id}`;
    const message = {
      action: action,
    };

    mqttClient.publish(
      topic,
      JSON.stringify(message),
      { qos: 2, retain: false },
      (err) => {
        if (err) {
          logger.logError(`Failed to publish device on/off command`, err, {
            topic,
            device_id,
            action,
          });
        } else {
          logger.logInfo(`Successfully published device on/off command`, {
            topic,
            device_id,
            action,
          });
        }
      }
    );
  } catch (error) {
    logger.logError("Error in DeviceOnOff", error, { device_id, action });
  }
};

module.exports.sendCustomMQTTMessage = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { message } = req.body;

    if (!device_id || !message) {
      return res
        .status(400)
        .json({ error: "Device ID and message are required" });
    }
    const topic = `device/${device_id}`;
    mqttClient.publish(
      topic,
      JSON.stringify(message),
      { qos: 2, retain: false },
      (err) => {
        if (err) {
          logger.logError(`Failed to publish custom MQTT message`, err, {
            topic,
            device_id,
          });
        } else {
          logger.logInfo(`Successfully published custom MQTT message`, {
            topic,
            device_id,
          });
        }
      }
    );

    return res
      .status(200)
      .json({ message: "Custom message sent successfully" });
  } catch (error) {
    logger.logError("Error sending custom MQTT message", error, {
      device_id: req.params?.device_id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};
