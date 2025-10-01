const express = require("express");
const {
  createClient,
  getAllClients,
  updateClient,
  deleteClient,
  getAllAds,
  getAllDetails,
} = require("../controllers/clientController");
const { sendAdFile, sendAdDetails } = require("../controllers/adController");
const {
  scheduleAd,
  deleteSchedule,
  updateSchedule,
  getPlaceholder,
  deleteMultipleSchedule,
} = require("../controllers/scheduleController");
const {
  getFullSchedule,
  syncDevice,
  registerDevice,
  createGroup,
  getDeviceList,
  fetchGroups,
  getFullScheduleCalendar,
  addMessage,
  deleteMessage,
  updateGroupSchedule,
  getApkUrl,
  exitDevice,
  getWgtUrl,
  registerNewDevice,
  getDeviceByPairingCode,
  updateDeviceDetailsAndLaunch,
  updateDeviceDetails,
  updateDeviceMetadata,
  getGroutpList,
  completeRegisterNewDevice,
  getFullSchedule_v2,
  getProofOfPlayLog,
  getDeviceTelemetryLog,
  getDeviceEventLog,
  addDeviceEvent,
  getDeviceDetails,
} = require("../controllers/deviceController");
const {
  addUser,
  getUserData,
  getAllusers,
  deleteUser,
  getAccountInfo,
  updateAccountInfo,
  resetPass,
} = require("../controllers/userController");
const { login } = require("../controllers/authController");
const router = express.Router();
const {
  uploadMiddleware,
  apkUploadMiddleware,
} = require("../middleware/s3multer");
const {
  changeFile,
  addAd,
  deleteAd,
  changePlaceholder,
} = require("../controllers/s3Controller");
const {
  validateToken,
  validateDeviceToken,
  validateAdmin,
} = require("../middleware/auth");
const { sendOtp, verifyOtp } = require("../controllers/otpController");
const {
  createCampaign,
  getCampaign,
  allCampaigns,
  updateCampaignWithCoupons,
  deleteCampaign,
  getCampaignCode,
  fetchCampaignInteractions,
} = require("../controllers/couponController");
const { updateSeries } = require("../controllers/cricketController");
const {
  getAdPerformanceTable,
  getGroupPerformanceTable,
  getStats,
} = require("../controllers/dashboardController");
const {
  getLatestApkVersion,
  addApkVersion,
  updateApkVersion,
  deleteApkVersion,
  getAllApkVersions,
  checkForUpdates,
} = require("../controllers/apkVersionController");

router.post("/device/register", registerDevice); // takes group id and location input

router.post("/device/new-register", registerNewDevice);

router.get(
  "/device/new-register/:pairing_code",
  validateToken,
  getDeviceByPairingCode
);

router.post("/device/update/:device_id", validateToken, updateDeviceDetails);
router.post(
  "/device/update/location/:device_id",
  validateToken,
  updateDeviceDetailsAndLaunch
);
router.post(
  "/device/update/matadata/:device_id",
  validateToken,
  updateDeviceMetadata
);
router.post("/device/complete-registration", completeRegisterNewDevice);
router.get("/device/group-list", validateToken, getGroutpList);

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

router.get("/device/sync", validateDeviceToken, syncDevice);

router.post("/login", login);

router.get("/download-apk", getApkUrl);
router.get("/download-wgt", getWgtUrl);

// router.post('/device/update/:id', validateToken, registerDevice)
router.post("/device/delete/:id", validateToken, exitDevice);

router.get("/device/all", validateToken, getDeviceList);

router.post(
  "/device/update-schedule/:group_id",
  validateToken,
  updateGroupSchedule
);

router.post("/device/cricket/update-series", validateToken, updateSeries);

router.post(
  "/device/update-schedule/:group_id",
  validateToken,
  updateGroupSchedule
);

router.post(
  "/device/update-schedule/:group_id",
  validateToken,
  updateGroupSchedule
);

router.get("/dashboard", validateToken, getAllDetails);
router.get("/dashboard/stats", validateToken, getStats);

router.get("/dashboard/ads/table", validateToken, getAdPerformanceTable);

router.get("/dashboard/groups/table", validateToken, getGroupPerformanceTable);

router.post("/device/create-group", validateToken, createGroup); // only takes name as input
router.get("/device/fetch-groups", validateToken, fetchGroups); // only takes name as input

router.post("/scroll-text", validateToken, addMessage);
router.post("/scroll-text/delete/:group_id", validateToken, deleteMessage);

router.get("/schedule/calendar", validateToken, getFullScheduleCalendar);
router.get("/schedule/all", validateToken, getFullSchedule);
router.get("/schedule/all_v2", validateToken, getFullSchedule_v2);

router.post("/schedule/add", validateToken, scheduleAd);
router.post("/schedule/update/:id", updateSchedule);
router.post("/schedule/delete/:id", validateToken, deleteSchedule);
router.post("/schedule/multiple-delete", validateToken, deleteMultipleSchedule);

router.get("/schedule/placeholder", validateToken, getPlaceholder);
router.post(
  "/schedule/change-placeholder",
  validateToken,
  uploadMiddleware,
  changePlaceholder
);

router.get("/ads/clients", validateToken, getAllClients);
router.get("/ads/all", validateToken, getAllAds);

router.post("/ads/create-client", validateToken, createClient);
router.post("/ads/update-client/:id", validateToken, updateClient);
router.post("/ads/delete-client:/id", validateToken, deleteClient);

router.post("/ads/add", validateToken, uploadMiddleware, addAd);
router.post("/ads/update", validateToken, addAd);
router.post("/ads/delete/:ad_id", validateToken, deleteAd);

router.get("/ads/:id", validateToken, sendAdDetails);

router.get("/ads/file/get/:path", validateToken, sendAdFile);
router.post(
  "/ads/file/edit/:ad_id",
  validateToken,
  uploadMiddleware,
  changeFile
);

router.get("/campaign/all", validateToken, validateAdmin, allCampaigns);

router.post(
  "/campaign/create/:client_id",
  validateToken,
  validateAdmin,
  createCampaign
);

router.post(
  "/campaign/update/",
  validateToken,
  validateAdmin,
  updateCampaignWithCoupons
);
router.post(
  "/campaign/delete/:campaign_id",
  validateToken,
  validateAdmin,
  deleteCampaign
);

router.get(
  "/campaign/interactions",
  validateToken,
  validateAdmin,
  fetchCampaignInteractions
);

// router.post('/campaign/add-coupon/:campaign_id', validateToken,validateAdmin, addCoupon)

router.get(
  "/campaign/get/:campaign_id",
  validateToken,
  validateAdmin,
  getCampaign
);

router.get("/campaign/:campaign_id", getCampaignCode);

router.post("/user/add", validateToken, validateAdmin, addUser);
router.get("/user/data", validateToken, getUserData);
router.get("/user/all", validateToken, validateAdmin, getAllusers);
router.delete("/user/:user_id", validateToken, validateAdmin, deleteUser);
router.get("/user/account", validateToken, getAccountInfo);
router.put("/user/update", validateToken, updateAccountInfo);
router.post("/user/reset/:userId", validateToken, validateAdmin, resetPass);

router.get(
  "/apk_versions/latest",
  validateToken,
  validateAdmin,
  getLatestApkVersion
);
router.get("/apk_versions", validateToken, validateAdmin, getAllApkVersions);

router.get("/apk/check-update", checkForUpdates);

router.post(
  "/apk_versions",
  validateToken,
  validateAdmin,
  apkUploadMiddleware,
  addApkVersion
);
router.put("/apk_versions/:id", validateToken, validateAdmin, updateApkVersion);

router.delete(
  "/apk_versions/:id",
  validateToken,
  validateAdmin,
  deleteApkVersion
);

// device logs apis

router.get("/device/:id/proof-of-play-logs", validateToken, getProofOfPlayLog);

router.get("/device/:id/telemetry-logs", validateToken, getDeviceTelemetryLog);

router.get("/device/:id/event-logs", validateToken, getDeviceEventLog);

router.post("/device/events", addDeviceEvent);

router.get("/device/:id", getDeviceDetails);

// router.post('/apk/extract_data',validateToken,validateAdmin, apkUploadMiddleware, uploadTempApk);

module.exports = router;
