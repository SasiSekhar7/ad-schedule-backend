const express =  require('express');
const { createClient, getAllClients, updateClient, deleteClient, getAllAds, getAllDetails } = require('../controllers/clientController');
const { Client, Ad, Schedule, Device } = require('../models');
const { sendAdFile, sendAdDetails } = require('../controllers/adController');
const { scheduleAd, deleteSchedule, updateSchedule } = require('../controllers/scheduleController');
const { getFullSchedule, syncDevice, registerDevice, createGroup, getDeviceList, fetchGroups, getFullScheduleCalendar } = require('../controllers/deviceController');
const { addUser, getUserData } = require('../controllers/userController');
const { login } = require('../controllers/authController');
const router = express.Router();
const upload = require('../middleware/s3multer');
const { uploadFile, changeFile, addAd, deleteAd } = require('../controllers/s3Controller');
const {validateToken, validateDeviceToken} = require('../middleware/auth');
const { pushToGroupQueue } = require('../controllers/queueController');

router.post('/device/register', registerDevice) // takes group id and location input 

router.get('/device/sync',validateDeviceToken,  syncDevice)


router.post('/login',  login)


router.post('/device/update/:id', validateToken,  registerDevice)
router.post('/device/delete/:id', validateToken,  registerDevice)
router.get('/device/all', validateToken,  getDeviceList)

router.get('/dashboard', validateToken,  getAllDetails)


router.post('/device/create-group', validateToken,  createGroup); // only takes name as input 
router.get('/device/fetch-groups', validateToken,  fetchGroups); // only takes name as input 


router.get("/schedule/calendar", validateToken,  getFullScheduleCalendar);
router.get("/schedule/all", validateToken,  getFullSchedule);


router.post("/schedule/add", validateToken,  scheduleAd)
router.post("/schedule/update/:id",updateSchedule)
router.post("/schedule/delete/:id", validateToken,  deleteSchedule)

router.get('/ads/clients', validateToken,  getAllClients )
router.get('/ads/all', validateToken,  getAllAds )


router.post('/ads/create-client', validateToken,  createClient )
router.post('/ads/update-client/:id', validateToken,  updateClient )
router.post('/ads/delete-client:/id', validateToken,  deleteClient )

router.post('/ads/add', validateToken,   upload.single('file'),addAd)
router.post('/ads/update', validateToken,  addAd)
router.post('/ads/delete/:ad_id', validateToken,  deleteAd)

router.get('/ads/:id', validateToken,  sendAdDetails)

router.get('/ads/file/get/:path', validateToken,  sendAdFile)
router.post('/ads/file/edit/:ad_id', validateToken,  upload.single('file'),changeFile)

router.post('/user/add', validateToken,  addUser)
router.get('/user/data', validateToken,  getUserData)

router.get('/trigger',  async(req, res)=>{
    try {
        console.log('got req ')
        await pushToGroupQueue(["838fb86d-2bfd-4948-9496-25a7467dea52"])
    
        res.send("success")
    } catch (error) {
        res.status(500).send("failure", error)
        
    }

})







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