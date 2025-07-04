// services/impressionCalculator.js (or wherever you place such logic)

// Assuming you have configured Sequelize and imported your models
const {
  sequelize,
  Ad,
  Device,
  DeviceGroup,
  Schedule,
  DailyImpressionSummary,
} = require("../models"); // Adjust path as needed
const { Op } = require("sequelize");
const moment = require("moment"); // Using moment for easy date manipulation

const PLACEHOLDER_DURATION_SECONDS = 10;
const SECONDS_IN_DAY = 24 * 60 * 60;

/**
 * Calculates and updates the DailyImpressionSummary table for a specific date.
 * Can be filtered to run only for a specific group.
 * Uses a DELETE + bulkCreate strategy for accuracy on updates/removals.
 *
 * @param {Date|string} targetDate - The date (YYYY-MM-DD) or Date object for which to update impressions.
 * @param {object} options - Optional parameters.
 * @param {string} [options.groupId] - If provided, only update impressions for this specific group_id.
 * @returns {Promise<void>}
 */
async function updateImpressionsTable(targetDate, options = {}) {
  const { groupId } = options;
  const summaryDate = moment(targetDate).format("YYYY-MM-DD"); // Ensure DATEONLY format

  console.log(
    `Starting impression update for date: ${summaryDate}` +
      (groupId ? ` for group: ${groupId}` : "")
  );

  // Use a transaction for atomicity (delete + create)
  const transaction = await sequelize.transaction();

  try {
    // 1. Determine Target Groups
    let groupWhereClause = {};
    if (groupId) {
      groupWhereClause.group_id = groupId;
    }
    // Find groups (we need their client_id later)
    const targetGroups = await DeviceGroup.findAll({
      where: groupWhereClause,
      attributes: ["group_id", "client_id"],
      transaction, // Run within the transaction
    });

    if (!targetGroups.length) {
      console.log(
        `No target groups found for ${summaryDate}` +
          (groupId ? ` and group ${groupId}` : "")
      );
      await transaction.commit(); // Nothing to do, commit transaction
      return;
    }

    const groupIds = targetGroups.map((g) => g.group_id);
    // const groupClientMap = targetGroups.reduce((map, group) => {
    //     map[group.group_id] = group.client_id;
    //     return map;
    // }, {});

    // 2. Delete Existing Entries for the target date/groups
    // This ensures that if an ad is removed from a schedule, its corresponding
    // summary entry for that day is also removed.
    const deleteWhere = {
      summary_date: summaryDate,
      group_id: { [Op.in]: groupIds }, // Only delete for the groups we are processing
    };
    const deletedRows = await DailyImpressionSummary.destroy({
      where: deleteWhere,
      transaction, // Run within the transaction
    });
    console.log(
      `Deleted ${deletedRows} existing summary rows for ${summaryDate} and target groups.`
    );

    // 3. Fetch Data and Calculate Impressions for each group
    const summariesToCreate = [];

    for (const group of targetGroups) {
      const currentGroupId = group.group_id;
      const currentClientId = group.client_id; // Get client_id from the group object

      // a. Find Ads scheduled for this group on targetDate
      const activeSchedules = await Schedule.findAll({
        where: {
          group_id: currentGroupId,
          start_time: { [Op.lte]: moment(summaryDate).endOf("day").toDate() },
          end_time: { [Op.gte]: moment(summaryDate).startOf("day").toDate() },
        },
        attributes: ["ad_id"],
        transaction, // Run within the transaction
      });

      const adIdsInPlaylist = [...new Set(activeSchedules.map((s) => s.ad_id))]; // Unique ad IDs

      if (adIdsInPlaylist.length === 0) {
        // console.log(`No active ads for group ${currentGroupId} on ${summaryDate}`);
        continue; // Skip to the next group if no ads are scheduled
      }

      // b. Fetch Ad Durations
      const ads = await Ad.findAll({
        where: { ad_id: { [Op.in]: adIdsInPlaylist } },
        attributes: ["ad_id", "duration"], // duration should be correct (10s for image, Ns for video)
        transaction, // Run within the transaction
      });

      // c. Calculate Total Loop Duration
      let playlistDurationSeconds = 0;
      ads.forEach((ad) => {
        playlistDurationSeconds += ad.duration; // Use Ad.duration directly as confirmed
      });
      const totalLoopDurationSeconds =
        playlistDurationSeconds + PLACEHOLDER_DURATION_SECONDS;

      if (totalLoopDurationSeconds <= 0) {
        console.warn(
          `Warning: Total loop duration is ${totalLoopDurationSeconds} for group ${currentGroupId} on ${summaryDate}. Skipping impression calculation.`
        );
        continue;
      }

      // d. Calculate Loops Per Day
      const loopsPerDay = Math.floor(SECONDS_IN_DAY / totalLoopDurationSeconds);

      // e. Get Device Count for the group
      // Assuming device count is relatively stable per day.
      // For more accuracy, you might want to check device status if available.
      const deviceCount = await Device.count({
        where: { group_id: currentGroupId },
        transaction, // Run within the transaction
      });

      // f. Prepare Summary Data for each ad in the playlist
      ads.forEach((ad) => {
        summariesToCreate.push({
          summary_date: summaryDate,
          group_id: currentGroupId,
          ad_id: ad.ad_id,
          client_id: currentClientId, // Use the client_id fetched earlier
          device_count: deviceCount,
          total_loop_duration_seconds: totalLoopDurationSeconds,
          loops_per_day: loopsPerDay,
          impressions: loopsPerDay * deviceCount, // Theoretical impressions
        });
      });
      console.log(
        `Group ${currentGroupId}: Playlist[${
          ads.length
        } ads], LoopDuration=${totalLoopDurationSeconds}s, Loops/Day=${loopsPerDay}, Devices=${deviceCount}, Impressions/Ad=${
          loopsPerDay * deviceCount
        }`
      );
    } // End loop through groups

    // 4. Bulk Insert the new summary data
    if (summariesToCreate.length > 0) {
      await DailyImpressionSummary.bulkCreate(summariesToCreate, {
        transaction, // Run within the transaction
        // No updateOnDuplicate needed because we deleted first
      });
      console.log(
        `Successfully inserted ${summariesToCreate.length} summary rows for ${summaryDate}.`
      );
    } else {
      console.log(`No summary rows to insert for ${summaryDate}.`);
    }

    // 5. Commit Transaction
    await transaction.commit();
    console.log(`Impression update finished successfully for ${summaryDate}.`);
  } catch (error) {
    // 6. Rollback Transaction on error
    await transaction.rollback();
    console.error(`Error updating impressions for date ${summaryDate}:`, error);
    // Rethrow or handle error as needed
    throw error;
  }
}

module.exports = {
  updateImpressionsTable,
};
