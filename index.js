const express = require('express');
const app = express();
require('dotenv').config(); // Load environment variables from .env


const bodyParser = require('body-parser');
const cors = require('cors');
const router = require('./routes');
const port =  process.env.PORT || 8080;

app.use(bodyParser.json())
app.use(cors())

app.use('/api', router)




app.listen(port, () => console.log(`Server running on http://localhost:${port}`));