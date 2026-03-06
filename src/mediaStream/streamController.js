const { spawn } = require("child_process");
const { StreamChannel } = require("../models");

// const RTMP_URL = "rtmp://rtmp.us.live.dacast.com/live";
// const STREAM_KEY = "MhcdDHz6pPkbP5KI";

let ffmpegProcess = null;

exports.startStream = async (req, res) => {
  try {
    if (ffmpegProcess) {
      return res.json({ message: "Stream already running" });
    }

    const { channel_id } = req.body;

    const channel = await StreamChannel.findOne({
      where: { channel_id },
    });

    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }
    const { ingest_url, stream_key } = channel;

   ffmpegProcess = spawn("ffmpeg", [
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

    ffmpegProcess.stderr.on("data", (data) => {
      console.log("FFmpeg:", data.toString());
    });

    ffmpegProcess.on("close", () => {
      console.log("FFmpeg stopped");
      ffmpegProcess = null;
    });

    res.json({ message: "Streaming started" });
  } catch (err) {
    res.status(500).json({ error: "Failed to start stream" });
  }
};

exports.streamChunk = (req, res) => {
  if (!ffmpegProcess) {
    return res.status(400).send("Stream not started");
  }

  req.on("data", (chunk) => {
    ffmpegProcess.stdin.write(chunk);
  });

  req.on("end", () => {
    res.end("chunk received");
  });
};

exports.stopStream = async (req, res) => {
  try {
    if (ffmpegProcess) {
      ffmpegProcess.stdin.end();
      ffmpegProcess.kill("SIGINT");
      ffmpegProcess = null;
    }

    res.json({ message: "Stream stopped" });
  } catch (err) {
    res.status(500).json({ error: "Failed to stop stream" });
  }
};