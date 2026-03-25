const { Op, fn, col } = require("sequelize");

const {
  ProofOfPlayLog,
  Ad,
  Device,
  DeviceGroup,
  DailyAdPerformance,
  DailyGroupPerformance,
} = require("../models");

/*
|--------------------------------------------------------------------------
| Generate Daily Ad Performance
|--------------------------------------------------------------------------
|
| Aggregates impressions per Ad from ProofOfPlayLog
|
*/

async function generateDailyAdPerformance({ startDate, endDate }) {
  try {
    const rows = await ProofOfPlayLog.findAll({
      attributes: [
        [col("Ad.ad_id"), "ad_id"],
        [col("Ad.name"), "ad_name"],
        [col("Ad.duration"), "duration"],
        [col("Device.DeviceGroup.client_id"), "client_id"],

        [fn("COUNT", col("ProofOfPlayLog.id")), "impressions"],

        [
          fn("COUNT", fn("DISTINCT", col("Device.group_id"))),
          "groups_scheduled",
        ],
      ],

      include: [
        {
          model: Ad,
          as: "Ad",
          attributes: [],
          required: true,
        },
        {
          model: Device,
          attributes: [],
          required: true,
          include: [
            {
              model: DeviceGroup,
              as: "DeviceGroup",
              attributes: [],
              required: true,
            },
          ],
        },
      ],

      where: {
        start_time: {
          [Op.between]: [startDate, endDate],
        },
      },

      group: [
        col("Ad.ad_id"),
        col("Ad.name"),
        col("Ad.duration"),
        col("Device.DeviceGroup.client_id"),
      ],

      raw: true,
    });

    if (!rows.length) {
      console.log("No Ad Performance data found for date:", startDate);
      return;
    }

    await DailyAdPerformance.bulkCreate(
      rows.map((r) => ({
        summary_date: startDate,
        client_id: r.client_id,
        ad_id: r.ad_id,
        ad_name: r.ad_name,
        duration: r.duration,
        impressions: Number(r.impressions),
        groups_scheduled: Number(r.groups_scheduled),
      })),
    );

    console.log("Daily Ad Performance generated:", rows.length);
  } catch (error) {
    console.error("Error generating Daily Ad Performance:", error);
  }
}

/*
|--------------------------------------------------------------------------
| Generate Daily Group Performance
|--------------------------------------------------------------------------
|
| Aggregates impressions per Device Group
|
*/

async function generateDailyGroupPerformance({ startDate, endDate }) {
  try {
    const rows = await ProofOfPlayLog.findAll({
      attributes: [
        [col("Device.DeviceGroup.group_id"), "group_id"],
        [col("Device.DeviceGroup.name"), "group_name"],
        [col("Device.DeviceGroup.last_pushed"), "last_pushed"],
        [col("Device.DeviceGroup.client_id"), "client_id"],

        [fn("COUNT", col("ProofOfPlayLog.id")), "impressions"],

        [fn("COUNT", fn("DISTINCT", col("Device.device_id"))), "device_count"],
      ],

      include: [
        {
          model: Device,
          attributes: [],
          required: true,
          include: [
            {
              model: DeviceGroup,
              as: "DeviceGroup",
              attributes: [],
              required: true,
            },
          ],
        },
      ],

      where: {
        start_time: {
          [Op.between]: [startDate, endDate],
        },
      },

      group: [
        col("Device.DeviceGroup.group_id"),
        col("Device.DeviceGroup.name"),
        col("Device.DeviceGroup.last_pushed"),
        col("Device.DeviceGroup.client_id"),
      ],

      raw: true,
    });

    if (!rows.length) {
      console.log("No Group Performance data found for date:", startDate);
      return;
    }

    await DailyGroupPerformance.bulkCreate(
      rows.map((r) => ({
        summary_date: startDate,
        client_id: r.client_id,
        group_id: r.group_id,
        group_name: r.group_name,
        last_pushed: r.last_pushed,
        impressions: Number(r.impressions),
        device_count: Number(r.device_count),
      })),
    );

    console.log("Daily Group Performance generated:", rows.length);
  } catch (error) {
    console.error("Error generating Daily Group Performance:", error);
  }
}

/*
|--------------------------------------------------------------------------
| Run Daily Performance Generation
|--------------------------------------------------------------------------
|
| Used by CRON
|
*/

async function generateDailyPerformanceReports() {
  const today = new Date();
  const yesterday = new Date(today);

  yesterday.setDate(today.getDate() - 1);

  const startDate = new Date(yesterday.setHours(0, 0, 0, 0));
  const endDate = new Date(yesterday.setHours(23, 59, 59, 999));

  console.log("Running Performance Summary Cron...");

  await generateDailyAdPerformance({ startDate, endDate });
  await generateDailyGroupPerformance({ startDate, endDate });

  console.log("Performance Summary Cron Completed");
}

module.exports = {
  generateDailyAdPerformance,
  generateDailyGroupPerformance,
  generateDailyPerformanceReports,
};
