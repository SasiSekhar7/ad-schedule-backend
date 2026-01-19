const { Op } = require("sequelize");
const { getCustomUTCDateTime } = require("../helpers");
const {
  Schedule,
  Ad,
  ScrollText,
  Device,
  DeviceGroup,
  SelectedSeries,
  LiveContent,
  Carousel,
  CarouselItem,
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

/**
 * Convert scheduled content to push-ready JSON format for MQTT publish
 *
 * TODO: UPDATE THIS FUNCTION TO SUPPORT LIVE CONTENT AND CAROUSEL
 *
 * Currently this function only handles 'ad' content type.
 * After the Schedule model now uses content_id and content_type instead of ad_id,
 * this function needs to be updated to:
 *
 * 1. Query schedules and check the content_type field
 * 2. Based on content_type, fetch the appropriate content:
 *    - 'ad': Fetch from Ad table (current behavior)
 *    - 'live_content': Fetch from LiveContent table
 *    - 'carousel': Fetch from Carousel table and include CarouselItem with nested Ads
 *
 * 3. Format the response JSON to include separate arrays for each content type:
 *    {
 *      rcs: scrollingMessage,
 *      ads: [...],           // Regular ads (content_type = 'ad')
 *      live_contents: [...], // Live content items (content_type = 'live_content')
 *      carousels: [...],     // Carousel items with nested ads (content_type = 'carousel')
 *      placeholder: placeholder,
 *      rcs_enabled: boolean,
 *      placeholder_enabled: boolean,
 *      logo_enabled: boolean,
 *    }
 *
 * 4. For live_content items, include:
 *    - live_content_id
 *    - name
 *    - content_type (streaming, website, etc.)
 *    - url
 *    - duration
 *    - config (JSON configuration)
 *
 * 5. For carousel items, include:
 *    - carousel_id
 *    - name
 *    - total_duration
 *    - items: array of ads with their order
 */
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

  logger.logDebug(`Filtering content for group`, {
    group_id,
    startOfDay,
    endOfDay,
  });

  // TODO: Update this query to handle all content types
  // Current query only handles content_type = 'ad'
  // Need to:
  // 1. Fetch all schedules for this group
  // 2. Group them by content_type
  // 3. For each content_type, fetch the related content from appropriate table
  const scheduledContent = await Schedule.findAll({
    where: {
      group_id,
      start_time: {
        [Op.between]: [startOfDay, endOfDay],
      },
      // TODO: Add filter for content_type when processing different types
      // content_type: 'ad', // For now only processing ads
    },
    // include: [
    //   {
    //     model: Ad,
    //     where: {
    //       isDeleted: false, // ✅ only non-deleted ads
    //     },
    //     required: true, // ✅ ensures Schedule is returned ONLY if Ad exists
    //   },
    // ],
  });

  logger.logDebug(`Found scheduled content for group`, {
    group_id,
    count: scheduledContent.length,
  });

  if (scheduledContent.length === 0) {
    logger.logDebug(`No content found for group, skipping`, { group_id });
  }

  const DeviceGroupData = await DeviceGroup.findOne({
    where: { group_id },
  });

  // TODO: Process each content type separately
  // For now, only processing 'ad' content type
  // Filter schedules by content_type = 'ad'
  const scheduledAds = scheduledContent.filter(s => s.content_type === 'ad');

  // Process live_content schedules
  const liveContentSchedules = scheduledContent.filter(s => s.content_type === 'live_content');
  const liveContents = await Promise.all(liveContentSchedules.map(async (schedule) => {
    try {
      const liveContent = await LiveContent.findOne({ where: { live_content_id: schedule.content_id } });
      if (!liveContent) {
        logger.logError(`LiveContent not found for content_id`, null, { content_id: schedule.content_id });
        return null;
      }
      return {
        live_content_id: liveContent.live_content_id,
        name: liveContent.name,
        content_type: liveContent.content_type, // streaming, website, etc.
        url: liveContent.url,
        duration: liveContent.duration,
        config: liveContent.config,
        total_plays: schedule.total_duration,
        start_time: schedule.start_time,
        weekdays: schedule.weekdays || null,
        time_slots: schedule.time_slots || null,
      };
    } catch (err) {
      logger.logError(`Error processing live content`, err, { content_id: schedule.content_id });
      return null;
    }
  }));

  // Process carousel schedules
  const carouselSchedules = scheduledContent.filter(s => s.content_type === 'carousel');
  const carousels = await Promise.all(carouselSchedules.map(async (schedule) => {
    try {
      const carousel = await Carousel.findOne({
        where: { carousel_id: schedule.content_id },
        include: [{
          model: CarouselItem,
          as: 'items',
          include: [{ model: Ad }],
          order: [['display_order', 'ASC']]
        }]
      });
      if (!carousel) {
        logger.logError(`Carousel not found for content_id`, null, { content_id: schedule.content_id });
        return null;
      }
      // Get signed URLs for carousel items
      const items = await Promise.all(carousel.items.map(async (item) => {
        let url;
        let file_extension;
        if (use_ad_egress_lambda == "true" || use_ad_egress_lambda == true) {
          url = ad_Egress_lambda_url + "/" + item.Ad.ad_id + "." + item.Ad.url.split(".").pop();
          file_extension = item.Ad.url.split(".").pop();
        } else {
          const { getBucketURL } = require("./s3Controller");
          url = await getBucketURL(item.Ad.url);
          file_extension = item.Ad.url.split("?")[0].split(".").pop();
        }
        return {
          ad_id: item.Ad.ad_id,
          name: item.Ad.name,
          url,
          file_extension,
          duration: item.Ad.duration,
          display_order: item.display_order,
        };
      }));
      return {
        carousel_id: carousel.carousel_id,
        name: carousel.name,
        total_duration: carousel.total_duration,
        items,
        total_plays: schedule.total_duration,
        start_time: schedule.start_time,
        weekdays: schedule.weekdays || null,
        time_slots: schedule.time_slots || null,
      };
    } catch (err) {
      logger.logError(`Error processing carousel`, err, { content_id: schedule.content_id });
      return null;
    }
  }));

  // Fetch Ad details for ad schedules
  const ads = await Promise.all(
    scheduledAds.map(async (schedule) => {

      // if (schedule.Ad.isDeleted || !schedule.Ad.url) {
      //   logger.logError(`Ad url is null`, { ad_id: schedule.Ad.ad_id });
      //   return null; // Skip this ad
      // }
      try {
        // Fetch the Ad using content_id
        const ad = await Ad.findOne({ where: { ad_id: schedule.content_id } });
        if (!ad) {
          logger.logError(`Ad not found for content_id`, null, { content_id: schedule.content_id });
          return null;
        }

        let url;
        let file_extension;
        if (use_ad_egress_lambda == "true" || use_ad_egress_lambda == true) {
          url =
            ad_Egress_lambda_url +
            "/" +
            ad.ad_id +
            "." +
            ad.url.split(".").pop();
          file_extension = ad.url.split(".").pop();
        } else {
          const { getBucketURL } = require("./s3Controller"); // Require inside function
          url = await getBucketURL(ad.url);
          file_extension = ad.url.split("?")[0].split(".").pop();
        }
        return {
          ad_id: ad.ad_id,
          name: ad.name,
          url,
          file_extension: file_extension,
          duration: ad.duration,
          total_plays: schedule.total_duration,
          start_time: schedule.start_time,
          weekdays: schedule.weekdays || null,
          time_slots: schedule.time_slots || null,
        };
      } catch (urlError) {
        logger.logError(`Error fetching URL for ad`, urlError, {
          content_id: schedule.content_id,
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

  scrollingMessage = message ? message.message : rcs_message_default;

  // Remove null items (failed URL fetch or not found)
  const validAds = ads.filter((ad) => ad !== null);
  const validLiveContents = liveContents.filter((lc) => lc !== null);
  const validCarousels = carousels.filter((c) => c !== null);

  logger.logDebug(`Ready to publish content for group`, {
    group_id,
    validAdsCount: validAds.length,
    validLiveContentsCount: validLiveContents.length,
    validCarouselsCount: validCarousels.length,
  });

  // New structure: content object with separate arrays
  // const content = {
  //   ads: validAds.map(ad => ({ ...ad, content_type: 'ad' })),
  //   live_contents: validLiveContents.map(lc => ({ ...lc, content_type: 'live_content' })),
  //   carousels: validCarousels.map(c => ({ ...c, content_type: 'carousel' })),
  // };


  const unifiedContent = [
  ...validAds.map(ad => ({
    type: 'ad',
    id: ad.ad_id,
    name: ad.name,
    url: ad.url,
    file_extension: ad.file_extension,
    duration: ad.duration,
    total_plays: ad.total_plays,
    start_time: ad.start_time,
    weekdays: ad.weekdays,
    time_slots: ad.time_slots
  })),

  ...validLiveContents.map(lc => ({
    type: 'live_content',
    id: lc.live_content_id,
    name: lc.name,
    live_type: lc.content_type, // streaming, website
    url: lc.url,
    duration: lc.duration,
    config: lc.config,
    total_plays: lc.total_plays,
    start_time: lc.start_time,
    weekdays: lc.weekdays,
    time_slots: lc.time_slots
  })),

  ...validCarousels.map(c => ({
    type: 'carousel',
    id: c.carousel_id,
    name: c.name,
    total_duration: c.total_duration,
    items: c.items,
    total_plays: c.total_plays,
    start_time: c.start_time,
    weekdays: c.weekdays,
    time_slots: c.time_slots
  }))
];


  // JSON structure with backward compatibility and new content object
  const jsonToSend = {
    rcs: scrollingMessage,
    // Backward compatible - only ads in "ads" array (original structure)
    ads: validAds,
    // New structure - content object with separate arrays
    content: unifiedContent,
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
    console.log("groups", groups);

    for (const group_id of groups) {
      logger.logDebug(`Processing group`, { group_id });

      const topic = `ads/${group_id}`;

      const jsonToSend = await this.convertToPushReadyJSON(
        group_id,
        placeholder
      );

      mqttClient.publish(
        topic,
        JSON.stringify(j+sonToSend),
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
    console.log(" pushToGroupQueue ",error);
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
