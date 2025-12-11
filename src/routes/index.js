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
  updateGroup,
  confirmUpdateDeviceMetaData,
  confirmDeviceExit,
  exportProofOfPlayReport,
  exportAdsProofOfPlayReport,
  exportDeviceEventLogs,
  exportDeviceDetailsToExcel,
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
  completeMultipartUpload,
  generateUploadUrls,
  createMultipartUpload,
  getSinglePartUpload,
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
const {
  uploadAdsToEgressS3,
  dailySchedulePushManual,
} = require("../controllers/onTimeApiController");
const {
  triggerMediaConvertWebhook,
} = require("../controllers/mediaConvertController");
const { sendCustomMQTTMessage } = require("../controllers/queueController");
const {
  createLiveContent,
  getAllLiveContent,
  getLiveContentById,
  updateLiveContent,
  deleteLiveContent,
} = require("../controllers/liveContentController");
const {
  createCarousel,
  getAllCarousels,
  getCarouselById,
  updateCarousel,
  deleteCarousel,
} = require("../controllers/carouselController");

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
  "/device/update/metadata/:device_id",
  validateToken,
  updateDeviceMetadata
);

router.post(
  "/device/update/metadata-confirm/:device_id",
  confirmUpdateDeviceMetaData
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
router.post("/device/confirm-delete/:id", confirmDeviceExit);

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
router.put("/device/update-group/:group_id", validateToken, updateGroup);

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

router.post(
  "/ads/add",
  validateToken,
  // uploadMiddleware,
  addAd
);
router.post("/ads/update", validateToken, addAd);
router.post("/ads/delete/:ad_id", validateToken, deleteAd);

router.get("/ads/:id", validateToken, sendAdDetails);

router.get("/ads/file/get/:path", validateToken, sendAdFile);
router.post(
  "/ads/file/edit/:ad_id",
  validateToken,
  // uploadMiddleware,
  changeFile
);

// LiveContent routes
router.post("/live-content/create", validateToken, createLiveContent);
router.get("/live-content/all", validateToken, getAllLiveContent);
router.get("/live-content/:id", validateToken, getLiveContentById);
router.put("/live-content/:id", validateToken, updateLiveContent);
router.delete("/live-content/:id", validateToken, deleteLiveContent);

// Carousel routes
router.post("/carousel/create", validateToken, createCarousel);
router.get("/carousel/all", validateToken, getAllCarousels);
router.get("/carousel/:id", validateToken, getCarouselById);
router.put("/carousel/:id", validateToken, updateCarousel);
router.delete("/carousel/:id", validateToken, deleteCarousel);

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

// Define routes
router.post("/s3/create-multipart-upload", createMultipartUpload);
router.post("/s3/generate-upload-urls", generateUploadUrls);
router.post("/s3/complete-multipart-upload", completeMultipartUpload);
router.post("/s3/single-part-upload", getSinglePartUpload);

// One Time APIs
router.post("/onetime/upload-ads-to-egress-s3", uploadAdsToEgressS3);

// MediaConvert Webhook - receives job completion notifications
// No authentication required as it uses API key validation in the controller
router.post("/webhooks/mediaconvert", triggerMediaConvertWebhook);

router.get("/device/proof-of-play/export", exportProofOfPlayReport);
router.get("/ads/proof-of-play/export", exportAdsProofOfPlayReport);
router.get("/device/event-logs/export", exportDeviceEventLogs);

// Export full device details to Excel with multiple sheets
router.get(
  "/device/:device_id/export-full-details",
  validateToken,
  exportDeviceDetailsToExcel
);

router.post("/device/mqtt-custom-message/:device_id", sendCustomMQTTMessage);

router.post("/cron/daily-schedule-push", dailySchedulePushManual);
module.exports = router;
