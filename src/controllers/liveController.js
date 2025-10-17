const { LiveContent, Client } = require("../models");
const { Op } = require("sequelize");

// ------------------ GET ALL LIVE CONTENT ------------------
module.exports.getAllLiveContents = async (req, res) => {
  try {
    const whereClause = { isDeleted: false };

    // Clients can only see their own contents
    if (req.user?.role === "Client" && req.user.client_id) {
      whereClause.client_id = req.user.client_id;
    }

    const liveContents = await LiveContent.findAll({
      where: whereClause,
      include: [
        {
          model: Client,
          attributes: ["name"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    const data = liveContents.map((item) => ({
      live_id: item.live_id,
      client_id: item.client_id,
      client_name: item.Client?.name || null,
      name: item.name,
      url: item.url,
      content_type: item.content_type,
      stream_platform: item.stream_platform,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));

    return res.status(200).json({
      message: "Live contents fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Error fetching live contents:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// ------------------ ADD LIVE CONTENT ------------------
module.exports.addLiveContent = async (req, res) => {
  try {
    let { client_id, name, url, content_type, stream_platform } = req.body;

    // If client is logged in, override client_id
    if (!client_id && req.user?.role === "Client") {
      client_id = req.user.client_id;
    }
    console.log("body...", req.body);

    // --- Basic Validation ---
    if (!client_id) {
      return res.status(400).json({ message: "client_id is required" });
    }
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ message: "Valid name is required" });
    }
    if (!url || typeof url !== "string" || url.trim() === "") {
      return res.status(400).json({ message: "Valid URL is required" });
    }
    if (!content_type || !["website", "live", "ppt"].includes(content_type)) {
      return res
        .status(400)
        .json({ message: "content_type must be 'website', 'live' or 'ppt'" });
    }
    if (
      !stream_platform ||
      !["youtube", "iptv", "twitch", "vimeo", "other"].includes(
        stream_platform.toLowerCase()
      )
    ) {
      return res.status(400).json({
        message:
          "stream_platform must be one of: youtube, iptv, twitch, vimeo, other",
      });
    }

    const newLive = await LiveContent.create({
      client_id,
      name,
      url,
      content_type,
      stream_platform,
    });

    return res.status(201).json({
      message: "Live content created successfully",
      data: newLive,
    });
  } catch (error) {
    console.error("Error adding live content:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// ------------------ UPDATE LIVE CONTENT ------------------
module.exports.updateLiveContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, content_type, stream_platform } = req.body;

    const liveContent = await LiveContent.findOne({
      where: { live_id: id, isDeleted: false },
    });

    if (!liveContent) {
      return res.status(404).json({ message: "Live content not found" });
    }

    // Restrict Client from updating another Client’s content
    if (
      req.user?.role === "Client" &&
      liveContent.client_id !== req.user.client_id
    ) {
      return res.status(403).json({
        message: "Unauthorized to update this content",
      });
    }

    // --- Basic Validation ---
    if (name && (typeof name !== "string" || name.trim() === "")) {
      return res.status(400).json({ message: "Valid name is required" });
    }
    if (url && (typeof url !== "string" || url.trim() === "")) {
      return res.status(400).json({ message: "Valid URL is required" });
    }
    if (content_type && !["website", "live", "ppt"].includes(content_type)) {
      return res
        .status(400)
        .json({ message: "Invalid content_type value provided" });
    }
    if (
      stream_platform &&
      !["YouTube", "IPTV", "Twitch", "Vimeo", "Other"].includes(stream_platform)
    ) {
      return res.status(400).json({
        message:
          "Invalid stream_platform value. Allowed: YouTube, IPTV, Twitch, Vimeo, Other",
      });
    }

    await LiveContent.update(
      { name, url, content_type, stream_platform },
      { where: { live_id: id } }
    );

    return res
      .status(200)
      .json({ message: "Live content updated successfully" });
  } catch (error) {
    console.error("Error updating live content:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// ------------------ DELETE LIVE CONTENT ------------------
module.exports.deleteLiveContent = async (req, res) => {
  try {
    const { id } = req.params;

    const liveContent = await LiveContent.findOne({
      where: { live_id: id, isDeleted: false },
    });

    if (!liveContent) {
      return res.status(404).json({ message: "Live content not found" });
    }

    // Restrict Client from deleting another Client’s content
    if (
      req.user?.role === "Client" &&
      liveContent.client_id !== req.user.client_id
    ) {
      return res.status(403).json({
        message: "Unauthorized to delete this content",
      });
    }

    await LiveContent.update({ isDeleted: true }, { where: { live_id: id } });

    return res.status(200).json({
      message: "Live content deleted successfully",
      live_id: id,
    });
  } catch (error) {
    console.error("Error deleting live content:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
