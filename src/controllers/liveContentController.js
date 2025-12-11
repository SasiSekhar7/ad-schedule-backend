const { LiveContent, Client } = require("../models");
const logger = require("../utils/logger");

/**
 * Create a new live content
 *
 * Request body:
 * - name: Name of the live content (required)
 * - content_type: Type of content - 'streaming', 'website', 'iframe', 'youtube', 'custom' (default: 'website')
 * - url: URL for the content (required)
 * - duration: Duration in seconds, 0 = indefinite (default: 0)
 * - start_time: When to start showing this content (optional, ISO date string)
 * - end_time: When to stop showing this content (optional, ISO date string)
 * - config: Additional JSON configuration (optional)
 */
module.exports.createLiveContent = async (req, res) => {
  try {
    const { name, content_type, url, duration, start_time, end_time, config } = req.body;
    const client_id = req.user?.client_id;

    if (!client_id) {
      return res.status(400).json({ error: "Client ID is required" });
    }

    if (!name || !url) {
      return res.status(400).json({ error: "Name and URL are required" });
    }

    // Validate start_time and end_time if provided
    if (start_time && end_time) {
      const startDate = new Date(start_time);
      const endDate = new Date(end_time);
      if (endDate <= startDate) {
        return res.status(400).json({ error: "End time must be after start time" });
      }
    }

    const liveContent = await LiveContent.create({
      client_id,
      name,
      content_type: content_type || "website",
      url,
      duration: duration || 0,
      start_time: start_time || null,
      end_time: end_time || null,
      config: config || null,
      status: "active",
    });

    logger.logInfo("Live content created", { live_content_id: liveContent.live_content_id });
    return res.status(201).json({ message: "Live content created successfully", data: liveContent });
  } catch (error) {
    logger.logError("Error creating live content", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get all live content for a client
module.exports.getAllLiveContent = async (req, res) => {
  try {
    const client_id = req.user?.client_id;
    const role = req.user?.role;

    let whereClause = { isDeleted: false };
    if (role !== "Admin") {
      whereClause.client_id = client_id;
    }

    const liveContents = await LiveContent.findAll({
      where: whereClause,
      include: [{ model: Client, attributes: ["name"] }],
      order: [["created_at", "DESC"]],
    });

    return res.json({ data: liveContents });
  } catch (error) {
    logger.logError("Error fetching live contents", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get single live content by ID
module.exports.getLiveContentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Live content ID is required" });
    }

    const liveContent = await LiveContent.findOne({
      where: { live_content_id: id, isDeleted: false },
      include: [{ model: Client, attributes: ["name"] }],
    });

    if (!liveContent) {
      return res.status(404).json({ error: "Live content not found" });
    }

    return res.json({ data: liveContent });
  } catch (error) {
    logger.logError("Error fetching live content", error, { live_content_id: req.params.id });
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Update live content
module.exports.updateLiveContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, content_type, url, duration, start_time, end_time, config, status } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Live content ID is required" });
    }

    const liveContent = await LiveContent.findOne({
      where: { live_content_id: id, isDeleted: false },
    });

    if (!liveContent) {
      return res.status(404).json({ error: "Live content not found" });
    }

    // Validate start_time and end_time if both provided
    const newStartTime = start_time !== undefined ? start_time : liveContent.start_time;
    const newEndTime = end_time !== undefined ? end_time : liveContent.end_time;
    if (newStartTime && newEndTime) {
      const startDate = new Date(newStartTime);
      const endDate = new Date(newEndTime);
      if (endDate <= startDate) {
        return res.status(400).json({ error: "End time must be after start time" });
      }
    }

    await liveContent.update({
      name: name || liveContent.name,
      content_type: content_type || liveContent.content_type,
      url: url || liveContent.url,
      duration: duration !== undefined ? duration : liveContent.duration,
      start_time: start_time !== undefined ? start_time : liveContent.start_time,
      end_time: end_time !== undefined ? end_time : liveContent.end_time,
      config: config !== undefined ? config : liveContent.config,
      status: status || liveContent.status,
    });

    logger.logInfo("Live content updated", { live_content_id: id });
    return res.json({ message: "Live content updated successfully", data: liveContent });
  } catch (error) {
    logger.logError("Error updating live content", error, { live_content_id: req.params.id });
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Delete (soft delete) live content
module.exports.deleteLiveContent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Live content ID is required" });
    }

    const liveContent = await LiveContent.findOne({
      where: { live_content_id: id, isDeleted: false },
    });

    if (!liveContent) {
      return res.status(404).json({ error: "Live content not found" });
    }

    await liveContent.update({ isDeleted: true });

    logger.logInfo("Live content deleted", { live_content_id: id });
    return res.json({ message: "Live content deleted successfully" });
  } catch (error) {
    logger.logError("Error deleting live content", error, { live_content_id: req.params.id });
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

