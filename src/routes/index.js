const express =  require('express');
const { createClient, getAllClients, updateClient, deleteClient, getAllAds, getAllDetails } = require('../controllers/clientController');
const { Client, Ad, Schedule, Device } = require('../models');
const { sendAdFile, sendAdDetails } = require('../controllers/adController');
const { scheduleAd, deleteSchedule, updateSchedule, getPlaceholder } = require('../controllers/scheduleController');
const { getFullSchedule, syncDevice, registerDevice, createGroup, getDeviceList, fetchGroups, getFullScheduleCalendar, addOrUpdateScrollText, addMessage, deleteMessage, updateGroupSchedule, getApkUrl } = require('../controllers/deviceController');
const { addUser, getUserData } = require('../controllers/userController');
const { login } = require('../controllers/authController');
const router = express.Router();
const {upload, uploadMiddleware} = require('../middleware/s3multer');
const { changeFile, addAd, deleteAd, changePlaceholder } = require('../controllers/s3Controller');
const {validateToken, validateDeviceToken} = require('../middleware/auth');
const { pushToGroupQueue } = require('../controllers/queueController');
const { sendOtp, verifyOtp } = require('../controllers/otpController');
const { createCampaign, getCampaign, allCampaigns, updateCampaignWithCoupons, deleteCampaign, getCampaignCode, fetchCampaignInteractions } = require('../controllers/couponController');
const { default: axios } = require('axios');

router.post('/device/register', registerDevice) // takes group id and location input 


router.post('/send-otp', sendOtp)
router.post('/verify-otp', verifyOtp)




router.get('/device/sync',validateDeviceToken,  syncDevice)


router.post('/login',  login)

router.get('/download-apk',  getApkUrl)

router.post('/device/update/:id', validateToken,  registerDevice)
router.post('/device/delete/:id', validateToken,  registerDevice)
router.get('/device/all', validateToken,  getDeviceList)

router.post('/device/update-schedule/:group_id', validateToken,  updateGroupSchedule)



router.get('/dashboard', validateToken,  getAllDetails)


router.post('/device/create-group', validateToken,  createGroup); // only takes name as input 
router.get('/device/fetch-groups', validateToken,  fetchGroups); // only takes name as input 


router.post("/scroll-text", validateToken, addMessage);
router.post("/scroll-text/delete/:group_id",validateToken, deleteMessage);

router.get("/schedule/calendar", validateToken,  getFullScheduleCalendar);
router.get("/schedule/all", validateToken,  getFullSchedule);


router.post("/schedule/add", validateToken,  scheduleAd)
router.post("/schedule/update/:id",updateSchedule)
router.post("/schedule/delete/:id", validateToken,  deleteSchedule)

router.get("/schedule/placeholder", validateToken,  getPlaceholder)
router.post("/schedule/change-placeholder", validateToken, uploadMiddleware, changePlaceholder)


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

router.get('/campaign/all', validateToken, allCampaigns)

router.post('/campaign/create/:client_id', validateToken, createCampaign)

router.post('/campaign/update/', validateToken, updateCampaignWithCoupons)
router.post('/campaign/delete/:campaign_id', validateToken, deleteCampaign)

router.get('/campaign/interactions', validateToken, fetchCampaignInteractions)



// router.post('/campaign/add-coupon/:campaign_id', validateToken, addCoupon)

router.get('/campaign/get/:campaign_id', validateToken, getCampaign)


router.get('/campaign/:campaign_id', getCampaignCode)


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


const API_KEY = '7cc20d69-5e4c-403b-98a1-629d2d3e482f'; // Replace with your actual API key
const TOURNAMENT_ID = '49fc7a37-da67-435e-bf5f-00da233e9ff4'; // ICC Champions Trophy series ID

// Helper function to get country flags
async function getCountryFlag(countryName) {
  try {
    const response = await axios.get('https://api.cricapi.com/v1/countries', {
      params: { apikey: API_KEY, search: countryName }
    });
    return response.data.data[0]?.genericFlag || '';
  } catch (error) {
    console.error('Error fetching flag:', error);
    return '';
  }
}

// Process match data
async function processMatch(match) {
  const flags = await Promise.all(match.teams.map(team => getCountryFlag(team)));

  // Check if the scorecard is available
  const scorecardAvailable = match.score && match.score.length > 0;

  return {
    id: match.id,
    name: match.name,
    status: match.status,
    date: match.date,
    venue: match.venue,
    teams: match.teams.map((team, index) => ({
      name: team,
      flag: flags[index]
    })),
    score: scorecardAvailable ? match.score : [{ inning: 'Scorecard not available', r: 0, w: 0, o: 0 }],
    matchType: match.matchType,
    series_id: match.series_id
  };
}

function findLastCompletedMatch(matchList) {
    // Filter out TBC matches and matches without a valid result
    const validMatches = matchList.filter(match => 
      !match.teams.includes('Tbc') && 
      (match.status.toLowerCase().includes('won') || 
       match.status.toLowerCase().includes('completed')) &&
      match.matchEnded
    );
  
    // Sort by date in descending order
    validMatches.sort((a, b) => new Date(b.dateTimeGMT) - new Date(a.dateTimeGMT));
  
    // Return the most recent match
    return validMatches[0];
  }
  
// Main API endpoint
router.get('/tournament-data', async (req, res) => {
  try {
    // Get tournament data
    const seriesResponse = await axios.get('https://api.cricapi.com/v1/series_info', {
      params: { apikey: API_KEY, id: TOURNAMENT_ID }
    });

    const allMatches = seriesResponse.data.data.matchList;

    const lastCompletedMatch = findLastCompletedMatch(allMatches)
    // Log raw match data for debugging
    console.log('Raw match data:', JSON.stringify(allMatches, null, 2));

    // Find current match (first match that's not completed)
    const currentMatch = allMatches.find(match => 
      !match.status.toLowerCase().includes('won') && 
      !match.status.toLowerCase().includes('completed')
    );

    // Find completed matches (status includes "won" or "completed")
    const completedMatches = allMatches.filter(match => 
      match.status.toLowerCase().includes('won') || 
      match.status.toLowerCase().includes('completed')
    );

    // Get upcoming fixtures (matches after current date)
    const now = new Date();
    const upcomingMatches = allMatches.filter(match => 
      new Date(match.dateTimeGMT) > now
    );

    // Process data
    // const responseData = {
    //   match: currentMatch ? await processMatch(currentMatch) : null,
    //   completed_matches: await Promise.all(completedMatches.map(processMatch)),
    //   scrolling_data: {
    //     tournament: seriesResponse.data.data.info.name,
    //     fixtures: await Promise.all(upcomingMatches.map(processMatch))
    //   }
    // };
    const responseData = {
        match: lastCompletedMatch
      };

    res.json(responseData);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch tournament data' });
  }
});
module.exports = router;  