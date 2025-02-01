const express =  require('express');
const { createClient, getAllClients, updateClient, deleteClient } = require('../controllers/clientController');
const { Client, Ad, Schedule, Device } = require('../models');
const upload = require('../middleware/multer');
const { addAd, sendAdFile } = require('../controllers/adController');
const { scheduleAd, deleteSchedule, updateSchedule } = require('../controllers/scheduleController');
const { getFullSchedule, syncDevice, createDevice, createGroup } = require('../controllers/deviceController');
const router = express.Router();


router.get('/device/sync', syncDevice)
router.post('/device/create', createDevice) // takes group id and location input 
router.post('/device/update/:id', createDevice)
router.post('/device/delete/:id', createDevice)



router.post('/device/create-group', createGroup); // only takes name as input 


router.get("/schedule/all", getFullSchedule);

router.post("/schedule/add", scheduleAd)
router.post("/schedule/update/:id",updateSchedule)
router.post("/schedule/delete/:id", deleteSchedule)

router.get('/ads/:path', sendAdFile)
router.get('/ads/clients', getAllClients )

router.post('/ads/create-client', createClient )
router.post('/ads/update-client/:id', updateClient )
router.post('/ads/delete-client:/id', deleteClient )

router.post('/ads/add', upload.single('file'),  addAd)
router.post('/ads/update', upload.single('file'),  addAd)

/**
 * 📌 Add an Ad or Ads To Schedule
 */
// router.post("/ads/schedule", scheduleAd);
/**
 * 📌 Remove an Ad from Schedule
 */
// router.delete("/ads/schedule/:id", deleteAd);

/**
 * 📌 Get Schedule for All Devices
 */


router.get('/1', async(req, res)=>{
    const data = await Schedule.findAll()

    res.send(data)
})




module.exports = router;  