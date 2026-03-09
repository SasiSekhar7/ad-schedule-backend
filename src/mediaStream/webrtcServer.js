const { RTCPeerConnection, RTCSessionDescription } = require("wrtc");
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
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      peers.set(channelId, pc);

      /**
       * Start FFmpeg
       */

      const ffmpeg = spawn("ffmpeg", [
        "-re",
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-tune", "zerolatency",
        "-c:a", "aac",
        "-ar", "44100",
        "-f", "flv",
        `${ingest_url}/${stream_key}`
      ]);

      ffmpeg.stderr.on("data", (data) => {
        console.log("FFmpeg:", data.toString());
      });

      ffmpegProcesses.set(channelId, ffmpeg);

      /**
       * Receive tracks
       */

      pc.ontrack = (event) => {

        const stream = event.streams[0];

        stream.getTracks().forEach(track => {

          const receiver = pc.getReceivers()
            .find(r => r.track === track);

          if (!receiver) return;

          const readable = receiver.createEncodedStreams?.().readable;

          if (readable) {
            readable.pipeTo(new WritableStream({
              write(chunk) {
                ffmpeg.stdin.write(chunk.data);
              }
            }));
          }

        });

      };

      /**
       * Handle ICE
       */

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            channelId,
            candidate: event.candidate
          });
        }
      };

      /**
       * Set offer
       */

      await pc.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("webrtc-answer", {
        channelId,
        answer
      });

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
        ffmpeg.stdin.end();
        ffmpeg.kill("SIGINT");
      }

      peers.delete(channelId);
      ffmpegProcesses.delete(channelId);

    });

  });

};