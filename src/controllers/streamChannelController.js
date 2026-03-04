const axios = require("axios");
const { StreamChannel, StreamingProvider } = require("../models");
const logger = require("../utils/logger");

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
    const { name, description } = req.body;
    const client_id = req.user?.client_id;

    if (!client_id)
      return res.status(400).json({ error: "Client ID is required" });

    if (!name)
      return res.status(400).json({ error: "Channel name is required" });

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

    // 3️⃣ Save in DB
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
      { online: true },
      { headers: { "X-Api-Key": api_key } },
    );

    // ⚠️ Do NOT set status to live immediately.
    // Let webhook confirm actual stream start.
    await channel.update({ status: "live" });

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
      { online: false },
      { headers: { "X-Api-Key": api_key } },
    );

    await channel.update({ status: "stopped" });

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
