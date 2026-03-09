const {
  RTCPeerConnection,
  RTCSessionDescription,
  nonstandard,
} = require("wrtc");
const { RTCAudioSink, RTCVideoSink } = nonstandard;

const ffmpegPath = require("ffmpeg-static");
const { spawn } = require("child_process");

const peers = new Map();
const ffmpegProcesses = new Map();

module.exports = function initWebRTC(io, getChannelData) {
  io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("webrtc-offer", async ({ channelId, offer }) => {
      const channel = await getChannelData(channelId);
      if (!channel) return;

      const { ingest_url, stream_key } = channel;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peers.set(channelId, pc);

      /**
       * Start FFmpeg — reads raw audio/video from stdin
       * Expects rawvideo + pcm_s16le piped in via concat
       * We'll use a different approach: pipe via named format
       */
      const ffmpeg = spawn(
        ffmpegPath,
        [
          // Video input
          "-f",
          "rawvideo",
          "-pix_fmt",
          "yuv420p",
          "-s",
          "1280x720", // adjust to your stream resolution
          "-r",
          "30", // adjust to your stream framerate
          "-i",
          "pipe:3", // video from fd 3

          // Audio input
          "-f",
          "s16le",
          "-ar",
          "48000", // wrtc outputs 48kHz
          "-ac",
          "1", // mono (wrtc default); change to 2 if stereo
          "-i",
          "pipe:4", // audio from fd 4

          // Output encoding
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
        ],
        {
          stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"], // fd 3 = video, fd 4 = audio
        },
      );

      ffmpeg.stdio[3].on("error", (e) =>
        console.error("FFmpeg video pipe error:", e.message),
      );
      ffmpeg.stdio[4].on("error", (e) =>
        console.error("FFmpeg audio pipe error:", e.message),
      );
      ffmpeg.stderr.on("data", (data) =>
        console.log("FFmpeg:", data.toString()),
      );
      ffmpeg.on("close", (code) =>
        console.log(`FFmpeg exited with code ${code}`),
      );

      ffmpegProcesses.set(channelId, ffmpeg);

      /**
       * Receive tracks via wrtc nonstandard sinks
       */
      pc.ontrack = (event) => {
        const track = event.track;

        if (track.kind === "video") {
          const sink = new RTCVideoSink(track);

          sink.onframe = ({ frame }) => {
            const { width, height, data } = frame;
            // data is a Uint8Array of I420 (YUV420p) raw frame
            try {
              if (!ffmpeg.stdio[3].destroyed) {
                ffmpeg.stdio[3].write(Buffer.from(data));
              }
            } catch (e) {
              console.error("Video write error:", e.message);
            }
          };

          // Clean up sink on peer close
          pc.addEventListener("connectionstatechange", () => {
            if (
              ["disconnected", "failed", "closed"].includes(pc.connectionState)
            ) {
              sink.stop();
            }
          });
        }

        if (track.kind === "audio") {
          const sink = new RTCAudioSink(track);

          sink.ondata = ({ samples }) => {
            // samples.buffer is raw PCM s16le
            try {
              if (!ffmpeg.stdio[4].destroyed) {
                ffmpeg.stdio[4].write(Buffer.from(samples.buffer));
              }
            } catch (e) {
              console.error("Audio write error:", e.message);
            }
          };

          pc.addEventListener("connectionstatechange", () => {
            if (
              ["disconnected", "failed", "closed"].includes(pc.connectionState)
            ) {
              sink.stop();
            }
          });
        }
      };

      /**
       * Handle ICE
       */
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            channelId,
            candidate: event.candidate,
          });
        }
      };

      /**
       * Set offer & answer
       */
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("webrtc-answer", { channelId, answer });
    });

    /**
     * ICE from client
     */
    socket.on("ice-candidate", async ({ channelId, candidate }) => {
      const pc = peers.get(channelId);
      if (!pc) return;
      await pc.addIceCandidate(candidate);
    });

    /**
     * Stop stream
     */
    socket.on("stopStream", ({ channelId }) => {
      const pc = peers.get(channelId);
      const ffmpeg = ffmpegProcesses.get(channelId);

      if (pc) pc.close();

      if (ffmpeg) {
        try {
          ffmpeg.stdio[3]?.destroy();
          ffmpeg.stdio[4]?.destroy();
          ffmpeg.kill("SIGINT");
        } catch (e) {
          console.error("Error stopping ffmpeg:", e.message);
        }
      }

      peers.delete(channelId);
      ffmpegProcesses.delete(channelId);
    });
  });
};
