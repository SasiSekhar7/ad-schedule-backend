const { StreamingProvider } = require("../models");
const logger = require("../utils/logger");

/**
 * Create Streaming Provider (Dacast)
 */
module.exports.createStreamingProvider = async (req, res) => {
  try {
    const { name, api_key } = req.body;

    if (!name || !api_key) {
      return res.status(400).json({ error: "Name and API key are required" });
    }

    const provider = await StreamingProvider.create({
      name,
      provider_type: "dacast",
      api_base_url: "https://developer.dacast.com",
      config: { api_key },
      is_active: true,
    });

    logger.logInfo("Streaming provider created", {
      provider_id: provider.provider_id,
    });

    return res.status(201).json({
      message: "Streaming provider created",
      data: provider,
    });
  } catch (error) {
    logger.logError("Error creating streaming provider", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports.getStreamingProviders = async (req, res) => {
  try {
    const providers = await StreamingProvider.findAll({
      where: { isDeleted: false },
    });

    return res.json({ data: providers });
  } catch (error) {
    logger.logError("Error fetching providers", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports.updateStreamingProvider = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, api_key, is_active } = req.body;

    const provider = await StreamingProvider.findByPk(id);

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    await provider.update({
      name: name || provider.name,
      config: api_key ? { api_key } : provider.config,
      is_active: is_active ?? provider.is_active,
    });

    return res.json({ message: "Provider updated", data: provider });
  } catch (error) {
    logger.logError("Error updating provider", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports.deleteStreamingProvider = async (req, res) => {
  try {
    const { id } = req.params;

    const provider = await StreamingProvider.findByPk(id);

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    await provider.update({ isDeleted: true });

    return res.json({ message: "Provider deleted" });
  } catch (error) {
    logger.logError("Error deleting provider", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};