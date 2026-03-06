// const { spawn } = require("child_process");
// const { StreamChannel } = require("../models");

// // const RTMP_URL = "rtmp://rtmp.us.live.dacast.com/live";
// // const STREAM_KEY = "MhcdDHz6pPkbP5KI";

// let ffmpegProcess = null;

// exports.startStream = async (req, res) => {
//   try {
//     if (ffmpegProcess) {
//       return res.json({ message: "Stream already running" });
//     }

//     const { channel_id } = req.body;

//     const channel = await StreamChannel.findOne({
//       where: { channel_id },
//     });

//     if (!channel) {
//       return res.status(404).json({ error: "Channel not found" });
//     }
//     const { ingest_url, stream_key } = channel;

//    ffmpegProcess = spawn("ffmpeg", [
//   "-f",
//   "webm",
//   "-i",
//   "pipe:0",
//   "-c:v",
//   "libx264",
//   "-preset",
//   "veryfast",
//   "-tune",
//   "zerolatency",
//   "-c:a",
//   "aac",
//   "-ar",
//   "44100",
//   "-f",
//   "flv",
//   `${ingest_url}/${stream_key}`,
// ]);

//     ffmpegProcess.stderr.on("data", (data) => {
//       console.log("FFmpeg:", data.toString());
//     });

//     ffmpegProcess.on("close", () => {
//       console.log("FFmpeg stopped");
//       ffmpegProcess = null;
//     });

//     res.json({ message: "Streaming started" });
//   } catch (err) {
//     res.status(500).json({ error: "Failed to start stream" });
//   }
// };

// exports.streamChunk = (req, res) => {
//   if (!ffmpegProcess) {
//     return res.status(400).send("Stream not started");
//   }

//   req.on("data", (chunk) => {
//     ffmpegProcess.stdin.write(chunk);
//   });

//   req.on("end", () => {
//     res.end("chunk received");
//   });
// };

// exports.stopStream = async (req, res) => {
//   try {
//     if (ffmpegProcess) {
//       ffmpegProcess.stdin.end();
//       ffmpegProcess.kill("SIGINT");
//       ffmpegProcess = null;
//     }

//     res.json({ message: "Stream stopped" });
//   } catch (err) {
//     res.status(500).json({ error: "Failed to stop stream" });
//   }
// };









const { spawn } = require("child_process");
const { StreamChannel } = require("../models");

// Store FFmpeg processes by channel
const ffmpegProcesses = new Map();

/**
 * Start Live Stream
 */
exports.startStream = async (req, res) => {
  try {
    const { channel_id } = req.body;

    if (!channel_id) {
      return res.status(400).json({ error: "channel_id is required" });
    }

    // Prevent duplicate stream
    if (ffmpegProcesses.has(channel_id)) {
      return res.json({ message: "Stream already running for this channel" });
    }

    const channel = await StreamChannel.findOne({
      where: { channel_id },
    });

    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const { ingest_url, stream_key } = channel;

    console.log(`🚀 Starting stream for channel ${channel_id}`);

    const ffmpegProcess = spawn("ffmpeg", [
      "-f",
      "webm",
      "-i",
      "pipe:0",

      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "zerolatency",

      "-c:a",
      "aac",
      "-ar",
      "44100",

      "-f",
      "flv",
      `${ingest_url}/${stream_key}`,
    ]);

    // Save process
    ffmpegProcesses.set(channel_id, ffmpegProcess);

    ffmpegProcess.stderr.on("data", (data) => {
      console.log(`FFmpeg (${channel_id}):`, data.toString());
    });

    ffmpegProcess.on("close", (code) => {
      console.log(`FFmpeg stopped for channel ${channel_id} with code ${code}`);
      ffmpegProcesses.delete(channel_id);
    });

    ffmpegProcess.on("error", (err) => {
      console.error(`FFmpeg error for channel ${channel_id}:`, err);
      ffmpegProcesses.delete(channel_id);
    });

    res.json({
      message: "Streaming started",
      channel_id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start stream" });
  }
};

/**
 * Receive Video Chunks
 */
exports.streamChunk = (req, res) => {
  const { channel_id } = req.params;

  const ffmpegProcess = ffmpegProcesses.get(channel_id);

  if (!ffmpegProcess) {
    return res.status(400).send("Stream not started for this channel");
  }

  req.on("data", (chunk) => {
    ffmpegProcess.stdin.write(chunk);
  });

  req.on("end", () => {
    res.end("chunk received");
  });

  req.on("error", (err) => {
    console.error("Stream chunk error:", err);
  });
};

/**
 * Stop Stream
 */
exports.stopStream = async (req, res) => {
  try {
    const { channel_id } = req.body;

    const ffmpegProcess = ffmpegProcesses.get(channel_id);

    if (!ffmpegProcess) {
      return res.json({ message: "No stream running for this channel" });
    }

    console.log(`🛑 Stopping stream for channel ${channel_id}`);

    ffmpegProcess.stdin.end();
    ffmpegProcess.kill("SIGINT");

    ffmpegProcesses.delete(channel_id);

    res.json({
      message: "Stream stopped",
      channel_id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to stop stream" });
  }
};

/**
 * Get Running Streams
 */
exports.getActiveStreams = async (req, res) => {
  try {
    const activeChannels = Array.from(ffmpegProcesses.keys());

    res.json({
      active_streams: activeChannels,
      total: activeChannels.length,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch active streams" });
  }
};