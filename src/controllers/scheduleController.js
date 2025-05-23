const { Op } = require("sequelize");
const { Ad, Schedule, Device } = require("../models");
const {
  parseISO,
  isBefore,
  setHours,
  setMinutes,
  formatISO,
  addDays,
  format,
} = require("date-fns");
const { pushToGroupQueue } = require("./queueController");
const { getBucketURL } = require("./s3Controller");
const { updateImpressionsTable } = require('../services/impressionCalculator'); // Adjust path

module.exports.scheduleAd2 = async (req, res) => {
  try {
    const { ad_id, hours, priority, locations } = req.body;

    if (!ad_id || !hours || !priority) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    // Fetch ad details, including duration
    const ad = await Ad.findOne({ where: { ad_id } });
    if (!ad) {
      return res.status(404).json({ error: "Ad not found" });
    }

    const adDuration = ad.duration; // Get actual ad duration from DB

    // Get current time & set scheduling window
    const now = new Date();
    const start_time = new Date(now.setMinutes(0, 0, 0)); // Start at current hour
    const end_time = new Date(start_time.getTime() + hours * 60 * 60000); // End after X hours

    console.log(
      "Scheduling from:",
      start_time,
      "to",
      end_time,
      "for ad duration:",
      adDuration,
      "seconds"
    );

    // Fetch devices in the specified locations
    let devices = await Device.findAll({
      where: {
        location: locations ? { [Op.in]: locations } : { [Op.ne]: null },
      },
    });

    if (devices.length === 0) {
      return res
        .status(404)
        .json({ error: "No devices available for the given locations" });
    }

    console.log("Devices found:", devices.length);

    const totalMinutes = (end_time - start_time) / 60000;
    const totalSlots = devices.length * (totalMinutes / 60);
    const adFrequency = Math.max(1, Math.floor(totalSlots / devices.length));

    let schedules = [];

    for (let device of devices) {
      let slotTime = new Date(start_time);

      for (let i = 0; i < adFrequency; i++) {
        let adEndTime = new Date(slotTime.getTime() + adDuration * 1000); // Use actual ad duration

        schedules.push({
          ad_id,
          device_id: device.device_id,
          start_time: new Date(slotTime),
          end_time: adEndTime,
          duration: adDuration, // Use actual ad duration
          priority,
        });

        slotTime.setSeconds(slotTime.getSeconds() + adDuration + 5); // Add buffer time
      }
    }

    if (schedules.length === 0) {
      return res
        .status(400)
        .json({ error: "No available slots for scheduling" });
    }

    // Save to DB
    // await Schedule.bulkCreate(schedules);

    return res.json({ message: "Ad scheduled successfully", schedules });
  } catch (error) {
    console.error("Scheduling error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
module.exports.scheduleAd_alt = async (req, res) => {
  try {
    const { ad_id, start_time, end_time, total_duration, priority, groups } =
      req.body;

    if (
      !ad_id ||
      !start_time ||
      !end_time ||
      !total_duration ||
      !priority ||
      !groups
    ) {
      return res.status(400).json({ error: "Missing required parameters" });
    }
    const startDate = parseISO(start_time);
    const endDate = parseISO(end_time);

    let currentDay = new Date(startDate);
    let schedules = [];

    while (
      isBefore(currentDay, endDate) ||
      currentDay.toDateString() === endDate.toDateString()
    ) {
      // Set the ad schedule between 6 AM and 10 PM
      const dayStart = setHours(setMinutes(new Date(currentDay), 0), 6); // 6:00 AM
      const dayEnd = setHours(setMinutes(new Date(currentDay), 0), 22); // 10:00 PM
      groups.forEach((group_id) => {
        schedules.push({
          ad_id,
          group_id: group_id,
          start_time: formatISO(dayStart), // Convert to ISO format
          end_time: formatISO(dayEnd), // Convert to ISO format
          total_duration: parseInt(total_duration),
          priority,
        });
        currentDay = addDays(currentDay, 1); // Move to next day
      });
    }

    const createdSchedules = await Schedule.bulkCreate(schedules);

    await pushToGroupQueue(groups);

    return res.json({
      message: "Schedules Added Successfully",
      schedules: createdSchedules,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// controllers/scheduleController.js (example path)
// Assume pushToGroupQueue is defined elsewhere

module.exports.scheduleAd = async (req, res) => {
  try {
    const { ad_id, start_time, end_time, total_duration, priority, groups } =
      req.body;

      if (
        !ad_id ||
        !start_time ||
        !end_time ||
        !total_duration ||
        !priority ||
        !groups
      ) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

    const overallStartDate = parseISO(start_time);
    const overallEndDate = parseISO(end_time);

    let schedules = [];
    // Store unique dates and groups for summary update
    const affectedDates = new Set();
    const affectedGroupIds = new Set(groups); // Use Set for unique group IDs

    let tempCurrentDay = new Date(overallStartDate); // Use a temp var for schedule generation loop

    // --- [Loop to generate schedule entries as before] ---
    while (
      isBefore(tempCurrentDay, overallEndDate) ||
      tempCurrentDay.toDateString() === overallEndDate.toDateString()
    ) {
      const dayStart = setHours(setMinutes(new Date(tempCurrentDay), 0), 6); // 6:00 AM
      const dayEnd = setHours(setMinutes(new Date(tempCurrentDay), 0), 22); // 10:00 PM

      affectedDates.add(format(tempCurrentDay, 'yyyy-MM-dd')); // Add the date string for summary update

      groups.forEach((group_id) => {
        schedules.push({
          ad_id,
          group_id: group_id,
          start_time: formatISO(dayStart),
          end_time: formatISO(dayEnd),
          total_duration: parseInt(total_duration),
          priority,
        });
      });
      tempCurrentDay = addDays(tempCurrentDay, 1); // Move to next day
    }
    // --- [End of schedule generation loop] ---


    // ---> Perform the bulkCreate within a transaction if possible, although not strictly necessary here
    const createdSchedules = await Schedule.bulkCreate(schedules);
    console.log(`Successfully created ${createdSchedules.length} schedule entries.`);

    // ---> Update the DailyImpressionSummary table
    console.log(`Triggering impression summary update for ${affectedDates.size} dates and ${affectedGroupIds.size} groups...`);
    // Iterate through each affected group
    for (const groupId of affectedGroupIds) {
        // Iterate through each affected date
        for (const dateString of affectedDates) {
             console.log(`Updating summary for group ${groupId} on date ${dateString}...`);
             try {
                 // Call the update function for each specific group and date combination
                 await updateImpressionsTable(dateString, { groupId: groupId });
             } catch (summaryError) {
                 // Log error but don't fail the entire request
                 console.error(`Error updating summary table for group ${groupId} on ${dateString}:`, summaryError);
                 // Optional: Add more robust error tracking/alerting here
             }
        }
    }
    console.log('Finished triggering impression summary updates.');
    // --- [End of summary update section] ---

    // ---> Push to device queue (if needed)
    // Consider if pushToGroupQueue should happen before or after summary update
    await pushToGroupQueue(groups);

    return res.json({
      message: "Schedules Added Successfully",
      schedules: createdSchedules,
    });
  } catch (error) {
    console.error('Error in scheduleAd endpoint:', error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// --- Other controller methods ---
module.exports.updateSchedule = async (req, res) => {
  try {
    if (!req.params || !req.body) {
      return res.status(400).json({ error: "Missing required parameters" });
    }
    await Schedule.update(req.body, { where: { schedule_id: req.params.id } });

    res.json({ message: "Schedule Updated." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
module.exports.deleteSchedule_alt = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Missing required parameter: id" });
    }

    // Find the schedule entry first
    const schedule = await Schedule.findOne({ where: { schedule_id: id } });

    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    // Extract group_id if needed
    const { group_id } = schedule;


    await Schedule.destroy({ where: { schedule_id: id } });


    await pushToGroupQueue([group_id]);
    // Now delete the schedule

    res.json({ message: "Schedule deleted successfully", group_id });
  } catch (error) {
    console.error("Error deleting schedule:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
// controllers/scheduleController.js (example path)

// ... (imports as before, including updateImpressionsTable and date-fns/format) ...

module.exports.deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params; // schedule_id

    if (!id) {
      return res.status(400).json({ error: "Missing required parameter: id" });
    }

    // Find the schedule entry first to get its details
    const scheduleToDelete = await Schedule.findOne({ where: { schedule_id: id } });

    if (!scheduleToDelete) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    // ---> Capture necessary info BEFORE deleting
    const affectedGroupId = scheduleToDelete.group_id;
    // The start_time of this specific schedule entry represents the affected date
    const affectedDate = scheduleToDelete.start_time; // This is likely a Date object or ISO string
    const affectedDateString = format(affectedDate, 'yyyy-MM-dd'); // Format for consistency

    // ---> Now delete the schedule entry
    await Schedule.destroy({ where: { schedule_id: id } });
    console.log(`Successfully deleted schedule entry ${id}.`);


    // ---> Update the DailyImpressionSummary table for the affected date and group
    console.log(`Triggering impression summary update for group ${affectedGroupId} on date ${affectedDateString} due to deletion...`);
    try {
        await updateImpressionsTable(affectedDateString, { groupId: affectedGroupId });
        console.log(`Summary update for ${affectedDateString} triggered.`);
    } catch (summaryError) {
        // Log error but don't necessarily fail the request
        console.error(`Error updating summary table for group ${affectedGroupId} on ${affectedDateString} after deletion:`, summaryError);
        // Optional: Add more robust error tracking/alerting here
    }
    // --- [End of summary update section] ---

    // ---> Push to device queue
    await pushToGroupQueue([affectedGroupId]);


    res.json({ message: "Schedule deleted successfully", deleted_schedule_id: id, affected_group_id: affectedGroupId });
  } catch (error) {
    console.error("Error deleting schedule:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.getPlaceholder = async (req, res) => {
    try {
        const clientId = req.user?.client_id;
        const role = req.user?.role;
        if (!clientId || !role) {
            return res.status(400).json({ message: "client_id or role not found in request" });
        }
        let key;
        if (role === "Admin") {
            key = "placeholder.jpg";
        } else {
            key = `${clientId}/placeholder.jpg`;
        }
        let url = await getBucketURL(key);
        if (!url && role !== "Admin") {
            url = await getBucketURL("placeholder.jpg");
        }
        res.json({ url });
    } catch (error) {
        console.error("Error fetching placeholder:", error.message, error.stack);
        res.status(500).json({ message: "Internal Server Error" });
    }
};









