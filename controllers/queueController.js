const { Op } = require("sequelize");
const { getCustomUTCDateTime } = require("../helpers");
const { Schedule, Ad } = require("../models");
const { getBucketURL } = require("./s3Controller");
const mqttClient = require("..");

module.exports.pushToGroupQueue = async (groups) => {
  try {
    groups.forEach(async (group_id) => {
      const topic  = `ads/${group_id}`
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

      const scheduledAds = await Schedule.findAll({
        where: {
          group_id,
          start_time: {
            [Op.between]: [startOfDay, endOfDay],
          },
        },
        include: [{ model: Ad }],
      });

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

      mqttClient.publish(topic, JSON.stringify(ads));
    });
  } catch (error) {
    console.log(error);
  }
};
