const axios = require("axios");
const {
  StreamChannel,
  StreamingProvider,
  LiveContent,
  Schedule,
  Client,
} = require("../models");
const logger = require("../utils/logger");
const { Op } = require("sequelize");
const { pushToGroupQueue } = require("./queueController");

async function getProvider() {
  return await StreamingProvider.findOne({
    where: { provider_type: "dacast", is_active: true, isDeleted: false },
  });
}

/**
 * Create Stream Channel (Dacast)
 */
module.exports.createStreamChannel = async (req, res) => {
  try {
    const { name, description, client_id } = req.body;
    // const client_id = req.user?.client_id;

    if (!client_id)
      return res.status(400).json({ error: "Client ID is required" });

    if (!name)
      return res.status(400).json({ error: "Channel name is required" });

    //CHECK IF CHANNEL ALREADY EXISTS
    const existingChannel = await StreamChannel.findOne({
      where: { client_id },
    });

    if (existingChannel) {
      return res.status(400).json({
        error: "Channel already exists for this client",
        data: {
          channel_id: existingChannel.channel_id,
          name: existingChannel.name,
        },
      });
    }

    // 1️⃣ Get provider
    const provider = await getProvider();
    if (!provider)
      return res
        .status(400)
        .json({ error: "Streaming provider not configured" });

    const { api_key } = provider.config;

    console.log("api key...", api_key);

    // 2️⃣ Call Dacast API
    const response = await axios.post(
      `${provider.api_base_url}/v2/channel`,
      {
        title: name,
        description: description || "",
        channel_type: "transmux",
        online: true,
        live_recording_enabled: false,
      },
      {
        headers: {
          "X-Api-Key": api_key,
          "Content-Type": "application/json",
          "X-Format": "default",
        },
      },
    );

    const data = response.data;

    //  Save in DB
    const channel = await StreamChannel.create({
      provider_id: provider.provider_id,
      client_id,
      external_channel_id: data.id,
      name,
      ingest_url: data.config?.publishing_point_primary || null,
      stream_key: data.config?.stream_name || null,
      playback_url: data.hls || null,
      status: "idle",
      metadata: data,
    });

    // CREATE LIVE CONTENT ENTRY
    await LiveContent.create({
      client_id,
      name: `${name} Live`,
      content_type: "provider", // ✅ important
      channel_id: channel.channel_id,
      url: channel.playback_url, // HLS / playback URL
      duration: 0,
      status: "active",
      start_time: null, // current time
      end_time: null, // +24 hours

      config: {
        autoplay: true,
        mute: false,
      },
    });

    logger.logInfo("Stream channel created", {
      channel_id: channel.channel_id,
      external_id: data.id,
    });

    return res.status(201).json({
      message: "Stream channel created successfully",
      data: {
        channel_id: channel.channel_id,
        name: channel.name,
        ingest_url: channel.ingest_url,
        stream_key: channel.stream_key,
        playback_url: channel.playback_url,
        status: channel.status,
      },
    });
  } catch (error) {
    logger.logError("Create channel failed", error);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data,
      });
    }

    return res.status(500).json({ error: "Failed to create channel" });
  }
};

module.exports.getAllStreamChannels = async (req, res) => {
  try {
    const client_id = req.user?.client_id;

    const channels = await StreamChannel.findAll({
      where: { client_id },
      order: [["created_at", "DESC"]],
      include: [
        {
          model: Client,
          attributes: [],
        },
      ],
      attributes: [
        "channel_id",
        "name",
        "status",
        "playback_url",
        "created_at",
      ],
    });

    return res.json({
      count: channels.length,
      data: channels,
    });
  } catch (error) {
    console.log("erroroooo", error.message);
    return res.status(500).json({
      error: "Failed to fetch stream channels",
    });
  }
};

module.exports.getStreamChannelById = async (req, res) => {
  try {
    const { id } = req.params;
    const client_id = req.user?.client_id;

    const channel = await StreamChannel.findOne({
      where: {
        channel_id: id,
        client_id,
      },
    });

    if (!channel) return res.status(404).json({ error: "Channel not found" });

    return res.json({
      data: {
        channel_id: channel.channel_id,
        name: channel.name,
        status: channel.status,
        ingest_url: channel.ingest_url,
        stream_key: channel.stream_key,
        playback_url: channel.playback_url,
        metadata: channel.metadata,
        createdAt: channel.created_at,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch channel",
    });
  }
};

module.exports.getStreamChannelsByClient = async (req, res) => {
  try {
    const client_id = req.user?.client_id;

    console.log("client_id", client_id);

    const channels = await StreamChannel.findOne({
      where: {
        client_id,
      },
      order: [["created_at", "DESC"]],
    });

    if (!channels || channels.length === 0) {
      return res.status(404).json({
        error: "No channels found",
      });
    }

    return res.json({
      // data: channels.map((channel) => ({
      //   channel_id: channel.channel_id,
      //   name: channel.name,
      //   status: channel.status,
      //   ingest_url: channel.ingest_url,
      //   stream_key: channel.stream_key,
      //   playback_url: channel.playback_url,
      //   metadata: channel.metadata,
      //   createdAt: channel.created_at,
      // })),
      data: channels,
    });
  } catch (error) {
    console.log("error", error);
    return res.status(500).json({
      error: "Failed to fetch channels",
    });
  }
};

/**
 * Update Stream Channel (Title / Metadata)
 */
module.exports.updateStreamChannel = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const client_id = req.user?.client_id;

    const channel = await StreamChannel.findOne({
      where: { channel_id: id, client_id },
    });

    if (!channel) return res.status(404).json({ error: "Channel not found" });

    const provider = await getProvider();
    if (!provider)
      return res
        .status(400)
        .json({ error: "Streaming provider not configured" });

    const { api_key } = provider.config;

    await axios.put(
      `${provider.api_base_url}/v2/channel/${channel.external_channel_id}`,
      { title: name },
      {
        headers: {
          "X-Api-Key": api_key,
          "Content-Type": "application/json",
        },
      },
    );

    await channel.update({ name });

    return res.json({ message: "Channel updated successfully" });
  } catch (error) {
    logger.logError("Update channel failed", error);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data,
      });
    }

    return res.status(500).json({ error: "Failed to update channel" });
  }
};

/**
 * Start Stream Channel (Set Online)
 */
module.exports.startStreamChannel = async (req, res) => {
  try {
    const { id } = req.params;
    const client_id = req.user?.client_id;
    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const channel = await StreamChannel.findOne({
      where: { channel_id: id, client_id },
    });

    if (!channel) return res.status(404).json({ error: "Channel not found" });

    // 🔥 1️⃣ Find LiveContents using this channel
    const liveContents = await LiveContent.findAll({
      where: {
        channel_id: channel.channel_id,
        isDeleted: false,
      },
      attributes: ["live_content_id"],
    });

    const liveContentIds = liveContents.map((lc) => lc.live_content_id);

    let groupIds = [];

    if (liveContentIds.length > 0) {
      // 🔥 2️⃣ Find active schedules
      const schedules = await Schedule.findAll({
        where: {
          content_type: "live_content",
          content_id: { [Op.in]: liveContentIds },

          // 🔥 Only schedules that overlap TODAY
          start_time: { [Op.lte]: endOfDay },
          end_time: { [Op.gte]: startOfDay },
        },
        attributes: ["group_id"],
      });

      groupIds = [...new Set(schedules.map((s) => s.group_id))];
    }

    console.log("groupIds,", groupIds);

    const provider = await getProvider();
    if (!provider)
      return res
        .status(400)
        .json({ error: "Streaming provider not configured" });

    const { api_key } = provider.config;

    await axios.put(
      `${provider.api_base_url}/v2/channel/${channel.external_channel_id}`,
      { online: true },
      { headers: { "X-Api-Key": api_key } },
    );

    // ⚠️ Do NOT set status to live immediately.
    // Let webhook confirm actual stream start.
    await channel.update({ status: "live" });

    await pushToGroupQueue(groupIds);

    return res.json({ message: "Channel set to online (waiting for stream)" });
  } catch (error) {
    logger.logError("Start channel failed", error);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data,
      });
    }

    return res.status(500).json({ error: "Failed to start channel" });
  }
};

/**
 * Stop Stream Channel
 */
module.exports.stopStreamChannel = async (req, res) => {
  try {
    const { id } = req.params;
    const client_id = req.user?.client_id;

    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const channel = await StreamChannel.findOne({
      where: { channel_id: id, client_id },
    });

    if (!channel) return res.status(404).json({ error: "Channel not found" });

    // 🔥 1️⃣ Find LiveContents using this channel
    const liveContents = await LiveContent.findAll({
      where: {
        channel_id: channel.channel_id,
        isDeleted: false,
      },
      attributes: ["live_content_id"],
    });

    const liveContentIds = liveContents.map((lc) => lc.live_content_id);

    let groupIds = [];

    if (liveContentIds.length > 0) {
      // 🔥 2️⃣ Find active schedules
      const schedules = await Schedule.findAll({
        where: {
          content_type: "live_content",
          content_id: { [Op.in]: liveContentIds },

          // 🔥 Only schedules that overlap TODAY
          start_time: { [Op.lte]: endOfDay },
          end_time: { [Op.gte]: startOfDay },
        },
        attributes: ["group_id"],
      });

      groupIds = [...new Set(schedules.map((s) => s.group_id))];
    }

    console.log("groupIds,", groupIds);

    const provider = await getProvider();
    if (!provider)
      return res
        .status(400)
        .json({ error: "Streaming provider not configured" });

    const { api_key } = provider.config;

    await axios.put(
      `${provider.api_base_url}/v2/channel/${channel.external_channel_id}`,
      { online: false },
      { headers: { "X-Api-Key": api_key } },
    );

    await channel.update({ status: "stopped" });

    await pushToGroupQueue(groupIds);

    return res.json({ message: "Channel stopping..." });
  } catch (error) {
    logger.logError("Stop channel failed", error);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data,
      });
    }

    return res.status(500).json({ error: "Failed to stop channel" });
  }
};

/**
 * Delete Stream Channel
 */
module.exports.deleteStreamChannel = async (req, res) => {
  try {
    const { id } = req.params;
    const client_id = req.user?.client_id;

    const channel = await StreamChannel.findOne({
      where: { channel_id: id, client_id },
    });

    if (!channel) return res.status(404).json({ error: "Channel not found" });

    const provider = await getProvider();
    if (!provider)
      return res
        .status(400)
        .json({ error: "Streaming provider not configured" });

    const { api_key } = provider.config;

    await axios.delete(
      `${provider.api_base_url}/v2/channel/${channel.external_channel_id}`,
      { headers: { "X-Api-Key": api_key } },
    );

    await channel.destroy();

    return res.json({ message: "Channel deleted successfully" });
  } catch (error) {
    logger.logError("Delete channel failed", error);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data,
      });
    }

    return res.status(500).json({ error: "Failed to delete channel" });
  }
};

/**
 * Sync All Existing Dacast Channels Into DB
 */
module.exports.syncDacastChannels = async (req, res) => {
  try {
    const client_id = req.user?.client_id;

    if (!client_id) {
      return res.status(400).json({ error: "Client ID is required" });
    }

    const provider = await getProvider();
    if (!provider) {
      return res
        .status(400)
        .json({ error: "Streaming provider not configured" });
    }

    const { api_key } = provider.config;

    let page = 1;
    const per_page = 100;
    let hasMore = true;

    let createdCount = 0;
    let updatedCount = 0;

    while (hasMore) {
      const response = await axios.get(`${provider.api_base_url}/v2/channel`, {
        headers: {
          "X-Api-Key": api_key,
          accept: "application/json",
          "X-Format": "default",
        },
        params: {
          page,
          per_page,
        },
      });

      const channels = response.data?.data || [];

      if (!channels.length) {
        hasMore = false;
        break;
      }

      for (const item of channels) {
        const existing = await StreamChannel.findOne({
          where: {
            external_channel_id: item.id,
            client_id,
          },
        });

        const mappedData = {
          provider_id: provider.provider_id,
          client_id,
          external_channel_id: item.id,
          name: item.title,
          ingest_url: item.config?.publishing_point_primary || null,
          stream_key: item.config?.stream_name || null,
          // playback_url: item.hls || null,
          status: item.online ? "live" : "idle",
          metadata: item,
        };

        if (!existing) {
          await StreamChannel.create(mappedData);
          createdCount++;
        } else {
          await existing.update(mappedData);
          updatedCount++;
        }
      }

      page++;
    }

    return res.json({
      message: "Dacast channels synced successfully",
      created: createdCount,
      updated: updatedCount,
    });
  } catch (error) {
    logger.logError("Sync channels failed", error);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data,
      });
    }

    return res.status(500).json({ error: "Failed to sync channels" });
  }
};
