const cron = require('node-cron');
const { DeviceGroup } = require('../models');
const { pushToGroupQueue } = require('../controllers/queueController');
const { fetchAndScheduleMatches } = require('../controllers/scheduleController');

// Function to be executed at 6 AM daily
async function dailySchedulePush() {
    const groups = await DeviceGroup.findAll({attributes:['group_id']})

    const groupIds = groups.map(grp=>grp.group_id);

    await pushToGroupQueue(groupIds);
}

// Schedule the task to run every day at 6 AM
cron.schedule('00 06 * * *', async() => {
    await dailySchedulePush();

}, {
    scheduled: true,
    timezone: "Asia/Kolkata" // India timezone
});


cron.schedule('00 08 * * *', async() => {
    await dailySchedulePush();

}, {
    scheduled: true,
    timezone: "Asia/Kolkata" // India timezone
});

// fetchAndScheduleMatches()