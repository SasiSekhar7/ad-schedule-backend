const { Op } = require("sequelize");
const { Ad, Schedule, Device, LiveContent, Carousel } = require("../models");
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
const { updateImpressionsTable } = require("../services/impressionCalculator"); // Adjust path
const moment = require("moment");
const logger = require("../utils/logger");

// Valid content types for scheduling
const VALID_CONTENT_TYPES = ["ad", "live_content", "carousel"];

// Helper function to validate content exists based on content_type
const validateContent = async (content_id, content_type) => {
  switch (content_type) {
    case "ad":
      return await Ad.findOne({ where: { ad_id: content_id, isDeleted: false } });
    case "live_content":
      return await LiveContent.findOne({ where: { live_content_id: content_id, isDeleted: false } });
    case "carousel":
      return await Carousel.findOne({ where: { carousel_id: content_id, isDeleted: false } });
    default:
      return null;
  }
};

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

    logger.logDebug("Scheduling ad", {
      start_time,
      end_time,
      adDuration,
      ad_id,
    });

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

    logger.logDebug("Devices found for scheduling", {
      deviceCount: devices.length,
    });

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
    logger.logError("Scheduling error", error, { ad_id: req.body.ad_id });
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
    logger.logError("Error in scheduleAd_alt", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// controllers/scheduleController.js (example path)
// Assume pushToGroupQueue is defined elsewhere

/**
 * Schedule content (ad, live_content, or carousel) for groups
 *
 * Request body:
 * - content_id: UUID of the content (ad_id, live_content_id, or carousel_id)
 * - content_type: Type of content ('ad', 'live_content', 'carousel') - defaults to 'ad'
 * - start_time: Start date/time for the schedule
 * - end_time: End date/time for the schedule
 * - total_duration: Duration for playback
 * - priority: Priority level
 * - groups: Array of group_ids to schedule for
 *
 * For backward compatibility, ad_id is also supported and will be treated as content_id with content_type='ad'
 */
module.exports.scheduleAd = async (req, res) => {
  try {
    const {
      ad_id, // backward compatibility
      content_id: rawContentId,
      content_type = "ad", // defaults to 'ad' for backward compatibility
      start_time,
      end_time,
      total_duration,
      priority,
      groups,
      // New fields for weekday and time scheduling
      weekdays, // Array of day numbers: 0=Sunday, 1=Monday, ..., 6=Saturday (null = all days)
      time_slots, // Array of time windows: [{start: "06:00", end: "10:00"}, {start: "18:00", end: "22:00"}]
    } = req.body;

    // Support both ad_id (legacy) and content_id (new)
    const content_id = rawContentId || ad_id;

    if (
      !content_id ||
      !start_time ||
      !end_time ||
      !total_duration ||
      !priority ||
      !groups
    ) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    // Validate content_type
    if (!VALID_CONTENT_TYPES.includes(content_type)) {
      return res.status(400).json({
        error: `Invalid content_type. Must be one of: ${VALID_CONTENT_TYPES.join(", ")}`
      });
    }

    // Validate weekdays if provided
    if (weekdays && Array.isArray(weekdays)) {
      const validDays = [0, 1, 2, 3, 4, 5, 6];
      const invalidDays = weekdays.filter(d => !validDays.includes(d));
      if (invalidDays.length > 0) {
        return res.status(400).json({
          error: `Invalid weekdays: ${invalidDays.join(", ")}. Must be 0-6 (0=Sunday, 6=Saturday)`
        });
      }
    }

    // Validate time_slots format if provided
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (time_slots && Array.isArray(time_slots)) {
      for (let i = 0; i < time_slots.length; i++) {
        const slot = time_slots[i];
        if (!slot.start || !slot.end) {
          return res.status(400).json({
            error: `time_slots[${i}] must have 'start' and 'end' properties`
          });
        }
        if (!timeRegex.test(slot.start)) {
          return res.status(400).json({
            error: `time_slots[${i}].start is invalid. Use HH:MM format (e.g., 06:00)`
          });
        }
        if (!timeRegex.test(slot.end)) {
          return res.status(400).json({
            error: `time_slots[${i}].end is invalid. Use HH:MM format (e.g., 22:00)`
          });
        }
      }
    }

    // Validate content exists
    const content = await validateContent(content_id, content_type);
    if (!content) {
      return res.status(404).json({
        error: `${content_type} with ID ${content_id} not found`
      });
    }

    const overallStartDate = parseISO(start_time);
    const overallEndDate = parseISO(end_time);

    // Use provided time_slots or default to single slot 06:00-22:00
    const effectiveTimeSlots = (time_slots && time_slots.length > 0)
      ? time_slots
      : [{ start: "06:00", end: "22:00" }];

    let schedules = [];
    // Store unique dates and groups for summary update
    const affectedDates = new Set();
    const affectedGroupIds = new Set(groups); // Use Set for unique group IDs

    let tempCurrentDay = new Date(overallStartDate); // Use a temp var for schedule generation loop

    // --- [Loop to generate schedule entries] ---
    while (
      isBefore(tempCurrentDay, overallEndDate) ||
      tempCurrentDay.toDateString() === overallEndDate.toDateString()
    ) {
      // Check if this day is in the weekdays filter (if provided)
      const dayOfWeek = tempCurrentDay.getDay(); // 0=Sunday, 1=Monday, etc.
      const shouldIncludeDay = !weekdays || weekdays.length === 0 || weekdays.includes(dayOfWeek);

      if (shouldIncludeDay) {
        affectedDates.add(format(tempCurrentDay, "yyyy-MM-dd")); // Add the date string for summary update

        // Create a schedule entry for each time slot
        for (const slot of effectiveTimeSlots) {
          const [startHour, startMin] = slot.start.split(":").map(Number);
          const [endHour, endMin] = slot.end.split(":").map(Number);

          const dayStart = setHours(setMinutes(new Date(tempCurrentDay), startMin), startHour);
          const dayEnd = setHours(setMinutes(new Date(tempCurrentDay), endMin), endHour);

          groups.forEach((group_id) => {
            schedules.push({
              content_id,
              content_type,
              group_id: group_id,
              start_time: formatISO(dayStart),
              end_time: formatISO(dayEnd),
              total_duration: parseInt(total_duration),
              priority,
              weekdays: weekdays && weekdays.length > 0 ? weekdays : null,
              time_slots: time_slots && time_slots.length > 0 ? time_slots : null,
            });
          });
        }
      }
      tempCurrentDay = addDays(tempCurrentDay, 1); // Move to next day
    }
    // --- [End of schedule generation loop] ---

    if (schedules.length === 0) {
      return res.status(400).json({
        error: "No schedules created. Check if weekdays filter excludes all days in the date range."
      });
    }

    // ---> Perform the bulkCreate
    const createdSchedules = await Schedule.bulkCreate(schedules);
    logger.logInfo("Schedule entries created", {
      count: createdSchedules.length,
      content_type,
      content_id,
      weekdays: weekdays || "all",
      time_slots: effectiveTimeSlots,
    });

    // ---> Update the DailyImpressionSummary table (only for ads)
    if (content_type === "ad") {
      logger.logDebug("Triggering impression summary update", {
        affectedDates: affectedDates.size,
        affectedGroups: affectedGroupIds.size,
      });
      // Iterate through each affected group
      for (const groupId of affectedGroupIds) {
        // Iterate through each affected date
        for (const dateString of affectedDates) {
          logger.logDebug("Updating summary for group and date", {
            groupId,
            dateString,
          });
          try {
            // Call the update function for each specific group and date combination
            await updateImpressionsTable(dateString, { groupId: groupId });
          } catch (summaryError) {
            // Log error but don't fail the entire request
            logger.logError("Error updating summary table", summaryError, {
              groupId,
              dateString,
            });
          }
        }
      }
      logger.logDebug("Finished triggering impression summary updates");
    }
    // --- [End of summary update section] ---

    // ---> Push to device queue
    await pushToGroupQueue(groups);

    return res.json({
      message: "Schedules Added Successfully",
      schedules: createdSchedules,
    });
  } catch (error) {
    logger.logError("Error in scheduleAd endpoint", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: error.message,
      details: error.original?.message || error.parent?.message || null
    });
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
    logger.logError("Error updating schedule", error, {
      schedule_id: req.params.id,
    });
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
    logger.logError("Error deleting schedule", error, {
      schedule_id: req.params.id,
    });
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
    const scheduleToDelete = await Schedule.findOne({
      where: { schedule_id: id },
    });

    if (!scheduleToDelete) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    // ---> Capture necessary info BEFORE deleting
    const affectedGroupId = scheduleToDelete.group_id;
    // The start_time of this specific schedule entry represents the affected date
    const affectedDate = scheduleToDelete.start_time; // This is likely a Date object or ISO string
    const affectedDateString = format(affectedDate, "yyyy-MM-dd"); // Format for consistency

    // ---> Now delete the schedule entry
    await Schedule.destroy({ where: { schedule_id: id } });
    logger.logInfo("Schedule entry deleted", { schedule_id: id });

    // ---> Update the DailyImpressionSummary table for the affected date and group
    logger.logDebug("Triggering impression summary update due to deletion", {
      affectedGroupId,
      affectedDateString,
    });
    try {
      await updateImpressionsTable(affectedDateString, {
        groupId: affectedGroupId,
      });
      logger.logDebug("Summary update triggered", { affectedDateString });
    } catch (summaryError) {
      // Log error but don't necessarily fail the request
      logger.logError(
        "Error updating summary table after deletion",
        summaryError,
        {
          affectedGroupId,
          affectedDateString,
        }
      );
      // Optional: Add more robust error tracking/alerting here
    }
    // --- [End of summary update section] ---

    // ---> Push to device queue
    await pushToGroupQueue([affectedGroupId]);

    res.json({
      message: "Schedule deleted successfully",
      deleted_schedule_id: id,
      affected_group_id: affectedGroupId,
    });
  } catch (error) {
    logger.logError("Error deleting schedule", error, {
      schedule_id: req.params.id,
    });
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.deleteMultipleSchedule = async (req, res) => {
  try {
    // Support both old (adId) and new (contentId) parameters
    const { groupId, adId, contentId, contentType, startDate, endDate } = req.body;

    // Use contentId if provided, otherwise fall back to adId for backward compatibility
    const effectiveContentId = contentId || adId;
    const effectiveContentType = contentType || "ad";

    if (!groupId || !effectiveContentId || !startDate || !endDate) {
      return res.status(400).json({
        error: "Missing required parameters: groupId, contentId (or adId), startDate, endDate",
      });
    }

    // Normalize start and end date to cover full day
    const startOfDay = moment(startDate)
      .startOf("day")
      .format("YYYY-MM-DD HH:mm:ss"); // 00:00:00
    const endOfDay = moment(endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss"); // 23:59:59

    // Find all schedules in the given group, content, and date range
    const schedulesToDelete = await Schedule.findAll({
      where: {
        group_id: groupId,
        content_id: effectiveContentId,
        content_type: effectiveContentType,
        start_time: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
    });

    if (!schedulesToDelete || schedulesToDelete.length === 0) {
      return res
        .status(404)
        .json({ error: "No schedules found for the given parameters" });
    }

    // Collect affected dates (formatted yyyy-MM-dd) before deletion
    const affectedDates = schedulesToDelete.map((s) =>
      format(new Date(s.start_time), "yyyy-MM-dd")
    );

    // Delete schedules in bulk
    await Schedule.destroy({
      where: {
        group_id: groupId,
        content_id: effectiveContentId,
        content_type: effectiveContentType,
        start_time: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
    });

    logger.logInfo("Multiple schedule entries deleted", {
      count: schedulesToDelete.length,
      groupId,
      contentId: effectiveContentId,
      contentType: effectiveContentType,
      startDate,
      endDate,
    });

    // Update DailyImpressionSummary for each affected date
    for (const dateStr of [...new Set(affectedDates)]) {
      try {
        logger.logDebug(
          "Triggering impression summary update due to deletion",
          {
            groupId,
            dateStr,
          }
        );
        await updateImpressionsTable(dateStr, { groupId });
        logger.logDebug("Summary update triggered", { dateStr });
      } catch (summaryError) {
        logger.logError("Error updating summary table", summaryError, {
          groupId,
          dateStr,
        });
      }
    }

    // Push to device queue
    await pushToGroupQueue([groupId]);

    res.json({
      message: "Schedules deleted successfully",
      deleted_count: schedulesToDelete.length,
      affected_group_id: groupId,
      affected_content_id: effectiveContentId,
      affected_content_type: effectiveContentType,
      affected_dates: [...new Set(affectedDates)],
    });
  } catch (error) {
    logger.logError("Error deleting schedules", error, {
      groupId: req.body.groupId,
      contentId: req.body.contentId || req.body.adId,
    });
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.getPlaceholder = async (req, res) => {
  try {
    const clientId = req.user?.client_id;
    const role = req.user?.role;
    if (!clientId || !role) {
      return res
        .status(400)
        .json({ message: "client_id or role not found in request" });
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
    logger.logError("Error fetching placeholder", error, {
      clientId: req.user?.client_id,
      role: req.user?.role,
    });
    res.status(500).json({ message: "Internal Server Error" });
  }
};
