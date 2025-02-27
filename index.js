const express = require('express');
const app = express();
require('dotenv').config(); // Load environment variables from .env


const bodyParser = require('body-parser');
const cors = require('cors');
const router = require('./src/routes');
const port =  process.env.PORT || 8000;
require('./src/cron')
app.use(bodyParser.json())

const corsOptions =["http://localhost:5174", "https://console.adup.live"]
app.use(cors({corsOptions}))



app.use('/api', router)




app.listen(port, () => console.log(`Server running on http://localhost:${port}`));

