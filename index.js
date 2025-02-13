const express = require('express');
const app = express();
require('dotenv').config(); // Load environment variables from .env


const bodyParser = require('body-parser');
const cors = require('cors');
const router = require('./routes');
const port =  process.env.PORT || 8000;
const mqtt = require("mqtt");

app.use(bodyParser.json())

const corsOptions =["http://localhost:5173", "https://console.adup.live"]
app.use(cors({corsOptions}))


const brokerUrl = "mqtt://console.adup.live:1883";
const options = {
  username: "myuser",
  password: "adup_2025"
};

const mqttClient = mqtt.connect(brokerUrl, options);


app.use('/api', router)




app.listen(port, () => console.log(`Server running on http://localhost:${port}`));

module.exports = mqttClient;