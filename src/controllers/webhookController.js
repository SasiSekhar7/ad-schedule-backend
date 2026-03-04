const { StreamChannel, StreamUsage } = require("../models");
const logger = require("../utils/logger");

module.exports.dacastWebhook = async (req, res) => {
  try {
    const { event, channel_id } = req.body;

    logger.logInfo("Dacast webhook received", { event, channel_id });

    const channel = await StreamChannel.findOne({
      where: { external_channel_id: channel_id },
    });

    if (!channel) {
      logger.logError("Channel not found for webhook", { channel_id });
      return res.sendStatus(200);
    }

    // 🔴 STREAM STARTED
    if (event === "stream.live") {
      await channel.update({ status: "live" });

      await StreamUsage.create({
        channel_id: channel.channel_id,
        start_time: new Date(),
      });

      logger.logInfo("Stream session started", {
        channel_id: channel.channel_id,
      });
    }

    // 🔵 STREAM STOPPED
    if (event === "stream.stopped") {
      await channel.update({ status: "stopped" });

      const activeUsage = await StreamUsage.findOne({
        where: {
          channel_id: channel.channel_id,
          end_time: null,
        },
      });

      if (activeUsage) {
        await activeUsage.update({
          end_time: new Date(),
        });
      }

      logger.logInfo("Stream session ended", {
        channel_id: channel.channel_id,
      });
    }

    return res.sendStatus(200);
  } catch (error) {
    logger.logError("Webhook error", error);
    return res.sendStatus(500);
  }
};