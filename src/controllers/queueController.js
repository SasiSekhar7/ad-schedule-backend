const { Op } = require("sequelize");
const { getCustomUTCDateTime } = require("../helpers");
const { Schedule, Ad, ScrollText, Device, DeviceGroup } = require("../models");
const { default: mqtt } = require("mqtt");
// const { getBucketURL } = require("./s3Controller");

const brokerUrl = process.env.MQTT_URL;
const options = {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
};

// Debug MQTT connection
console.log(`📡 Connecting to MQTT broker at ${brokerUrl}...`);
const mqttClient = mqtt.connect(brokerUrl, options);

mqttClient.on("connect", () => {
  console.log("✅ MQTT Connected!");

  // Subscribe to the "device/sync" topic upon connection
  mqttClient.subscribe("device/sync", (err) => {
    if (err) {
      console.error("Error subscribing to device/sync:", err);
    } else {
      console.log("Subscribed to device/sync topic.");
    }
  });
});
mqttClient.on("error", (err) =>
  console.error("❌ MQTT Connection Error:", err)
);

module.exports.convertToPushReadyJSON = async (group_id, placeholder= null) => {
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

  // Extract the message if found, otherwise set a default value
  scrollingMessage = message
    ? message.message
    : "AdUp By demokrito Contact 98987687876";

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

      const jsonToSend = await this.convertToPushReadyJSON(group_id, placeholder);
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

      await DeviceGroup.update({
        last_pushed: getCustomUTCDateTime(),
       },{
        where:{
          group_id
        }
       })
      // } else {
      //   console.log(`⚠️ No valid ads to publish for group ${group_id}`);
      // }
    }
  } catch (error) {
    console.error("❌ Error in pushToGroupQueue:", error);
  }
};
mqttClient.on("message", async (topic, message) => {
  if (topic === "device/sync") {
    try {
      const payload = JSON.parse(message);
      const { android_id } = payload;

      const [updatedCount] = await Device.update(
        { last_synced: getCustomUTCDateTime() },
        { where: { android_id } }
      );

      if (updatedCount > 0) {
        console.log(
          `Device with android_id ${android_id} updated with last_synced ${getCustomUTCDateTime()}`
        );
      } else {
        console.warn(
          `No device found with android_id ${android_id} to update.`
        );
      }
    } catch (error) {
      console.error("Error processing device/sync message:", error);
    }
  }
});
