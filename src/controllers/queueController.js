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
// const { getBucketURL } = require("./s3Controller");

const brokerUrl = process.env.MQTT_URL;
const options = {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
};

// Debug MQTT connection
console.log(`📡 Connecting to MQTT broker at ${brokerUrl}...`);
console.log(`🔑 Using username: ${JSON.stringify(options)}`);
const mqttClient = mqtt.connect(brokerUrl, options);

mqttClient.on("connect", () => {
  console.log("✅ MQTT Connected!");
  // const topics = ["device/sync", "device/register/#"];
  // const topics = ["device/#"]; // matches device/sync, device/register/123, etc.

  // Subscribe to the "device/sync" topic upon connection
  mqttClient.subscribe("device/sync", { qos: 2 }, (err, granted) => {
    if (err) {
      console.error("❌ Error subscribing to topics:", err);
    } else {
      console.log(
        "📡 Subscribed to topics:",
        granted.map((g) => g.topic).join(", ")
      );
    }
  });
});
mqttClient.on("error", (err) =>
  console.error("❌ MQTT Connection Error:", err)
);

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

  console.log(
    `📊 Found ${scheduledAds.length} scheduled ads for group ${group_id}`
  );

  if (scheduledAds.length === 0) {
    console.log(`⚠️ No ads found for group ${group_id}, skipping.`);
  }

  // Process ads asynchronously
  const ads = await Promise.all(
    scheduledAds.map(async (schedule) => {
      console.log(`📦 Processing ad: ${JSON.stringify(schedule.Ad)}`);
      try {
        const { getBucketURL } = require("./s3Controller"); // Require inside function
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
  let scrollingMessage;
  const message = await ScrollText.findOne({
    where: {
      group_id,
    },
    attributes: ["message"],
  });

  const matchData = await SelectedSeries.findOne({
    attributes: ["match_list"],
    where: { series_name: "IPL" },
  });
  const matchList = matchData?.match_list;

  scrollingMessage = message
    ? message.message
    : "AdUp By demokrito Contact 98987687876";

  if (matchList) {
    scrollingMessage = `${scrollingMessage} | Upcoming Fixtures: ${matchList}`;
  }

  // Remove null ads (failed URL fetch)
  const validAds = ads.filter((ad) => ad !== null);
  console.log(
    `✅ Ready to publish ${validAds.length} ads for group ${group_id}`
  );

  const jsonToSend = {
    rcs: scrollingMessage,
    ads: validAds,
    placeholder,
  };
  return jsonToSend;
};

module.exports.pushToGroupQueue = async (groups, placeholder = null) => {
  try {
    console.log(`🔄 Processing groups: ${JSON.stringify(groups)}`);

    for (const group_id of groups) {
      console.log(`📌 Processing group: ${group_id}`);

      const topic = `ads/${group_id}`;

      const jsonToSend = await this.convertToPushReadyJSON(
        group_id,
        placeholder
      );
      // if (validAds.length > 0) {
      mqttClient.publish(
        topic,
        JSON.stringify(jsonToSend),
        { qos: 2, retain: true },
        (err) => {
          if (err) {
            console.error(`❌ Failed to publish to ${topic}:`, err);
          } else {
            console.log(
              `📡 Successfully published ads to ${topic} with QoS 2 and retain flag`
            );
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
      // } else {
      //   console.log(`⚠️ No valid ads to publish for group ${group_id}`);
      // }
    }
  } catch (error) {
    console.error("❌ Error in pushToGroupQueue:", error);
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
          console.error(`❌ Failed to publish to ${topic}:`, err);
        } else {
          console.log(
            `📡 Successfully published ads to ${topic} with QoS 2 and retain flag`
          );
        }
      }
    );
  } catch (error) {
    console.error("❌ Error in pushToGroupQueue:", error);
  }
};
module.exports.pushToCricketQueue = async (matchData) => {
  try {
    const topic = "cricket/live";

    mqttClient.publish(topic, matchData, { qos: 2, retain: true }, (err) => {
      if (err) {
        console.error(`❌ Failed to publish to ${topic}:`, err);
      } else {
        console.log(
          `📡 Successfully published ads to ${topic} with QoS 2 and retain flag`
        );
      }
    });

    // } else {
    //   console.log(`⚠️ No valid ads to publish for group ${group_id}`);
    //
  } catch (error) {
    console.error("❌ Error in pushToGroupQueue:", error);
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
        console.error(`Failed to update ${android_id}:`, err);
      }
    )
  );

  await Promise.allSettled(promises);
  console.log(`Batch update: ${updates.length} devices at ${now}`);
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
      console.error("Invalid JSON or malformed payload:", err);
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
      ...jsonToSend,
    };
    console.log(
      `📲 Pushing new device registration to ${topic}: ${JSON.stringify(
        payload
      )}`
    );

    mqttClient.publish(
      topic,
      JSON.stringify(payload),
      { qos: 2, retain: false },
      (err) => {
        if (err) {
          console.error(`❌ Failed to publish to ${topic}:`, err);
        } else {
          console.log(
            `📡 Successfully published new device registration to ${topic} with QoS 2 and retain flag`
          );
        }
      }
    );
  } catch (error) {
    console.error("❌ Error in pushNewDeviceToQueue:", error);
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
          console.error(`❌ Failed to publish to ${topic}:`, err);
        } else {
          console.log(
            `📡 Successfully published update group to ${topic} with QoS 2 and retain flag`
          );
        }
      }
    );
  } catch (error) {
    console.error("❌ Error in pushToGroupQueue:", error);
  }
};
