const { spawn } = require("child_process");

const RTMP_URL = "rtmp://rtmp.us.live.dacast.com/live";
const STREAM_KEY = "oiUaOZwOFuncQfBc";

let ffmpegProcess = null;

exports.startStream = async (req, res) => {
  try {
    if (ffmpegProcess) {
      return res.json({ message: "Stream already running" });
    }

    ffmpegProcess = spawn("ffmpeg", [
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
      `${RTMP_URL}/${STREAM_KEY}`,
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

  req.pipe(ffmpegProcess.stdin);

  req.on("end", () => {
    res.end();
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