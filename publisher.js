const mqtt = require("mqtt");

const brokerUrl = "mqtt://43.204.218.204:1883";
const options = {
  username: "myuser",
  password: "adup_2025"
};

const client = mqtt.connect(brokerUrl, options);

client.on("connect", () => {
  console.log("📡 Publisher Connected!");

  const topic = "ads/32456576587976754";

  const messages = [
    { text: "QoS 0 - Fire and forget", qos: 0 },
    { text: "QoS 1 - At least once", qos: 1 },
    { text: "QoS 2 - Exactly once", qos: 2 }
  ];

  messages.forEach((msg, index) => {
    setTimeout(() => {
      client.publish(topic, msg.text, { qos: msg.qos, retain: true }, () => {
        console.log(`📨 Sent "${msg.text}" with QoS ${msg.qos} (Retained)`);
        if (index === messages.length - 1) client.end();
      });
    }, index * 2000);
  });
});