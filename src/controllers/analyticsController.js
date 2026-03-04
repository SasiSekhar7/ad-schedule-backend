// analytics.controller.js
const axios = require("axios");
const { StreamChannel, StreamingProvider, StreamUsage } = require("../models");

module.exports.syncChannelAnalytics = async (req, res) => {
  try {
    const { id } = req.params;

    const channel = await StreamChannel.findByPk(id);
    if (!channel) return res.status(404).json({ error: "Channel not found" });

    const provider = await StreamingProvider.findOne({
      where: { provider_type: "dacast", is_active: true },
    });

    const { api_key } = provider.config;

    const response = await axios.get(
      `${provider.api_base_url}/v2/analytics/channel/${channel.external_channel_id}`,
      {
        headers: { "X-Api-Key": api_key },
      }
    );

    const data = response.data;

    await StreamUsage.create({
      channel_id: channel.channel_id,
      total_viewers: data.total_viewers || 0,
      bandwidth_used: data.bandwidth || 0,
      watch_time: data.watch_time || 0,
    });

    return res.json({ message: "Analytics synced" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to sync analytics" });
  }
};