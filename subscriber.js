const mqtt = require("mqtt");

const brokerUrl = "mqtt://console.adup.live:1883";
const options = {
  username: "myuser",
  password: "adup_2025",
  clean: false, // 🔹 Enable persistent session
  clientId: "my-subscriber-1234", // 🔹 Must be unique but consistent
};

const client = mqtt.connect(brokerUrl, options);

client.on("connect", () => {
  console.log("📡 Subscriber Connected!");

  const topic = "device/sync";

  client.subscribe(topic, { qos: 2 }, (err) => {
    if (err) {
      console.error("❌ Subscription error:", err);
    } else {
      console.log(`✅ Subscribed to "${topic}" with QoS 2`);
    }
  });
});

// Handle incoming messages
client.on("message", (topic, message, packet) => {
  console.log(`📩 Received on "${topic}" | QoS: ${packet.qos} → ${message.toString()}`);
});

client.on("error", (err) => {
  console.error("❌ MQTT Connection Error:", err);
});