// controllers/dashboardController.js
const asyncHandler = require('express-async-handler');
const { Op, sequelize, fn, col, literal } = require('sequelize'); // Import necessary Sequelize components
const { DailyImpressionSummary, Ad, DeviceGroup, Device } = require('../models'); // Adjust path
const moment = require('moment');

// --- HELPER for date validation ---
const validateDateRange = (startDateStr, endDateStr) => {
    const startDate = moment(startDateStr, 'YYYY-MM-DD', true);
    const endDate = moment(endDateStr, 'YYYY-MM-DD', true);
    if (!startDate.isValid() || !endDate.isValid() || startDate.isAfter(endDate)) {
        throw new Error('Invalid date range. Use YYYY-MM-DD format and ensure start date is not after end date.');
    }
    // Return dates suitable for Sequelize query (e.g., Date objects or formatted strings)
    // Using Date objects is generally safer for timestamp comparisons if needed,
    // but YYYY-MM-DD strings work well with DATEONLY columns.
    return { startDate: startDate.format('YYYY-MM-DD'), endDate: endDate.format('YYYY-MM-DD') };
};

// --- HELPER for pagination ---
const getPagination = (page, pageSize) => {
    const pageNum = parseInt(page, 10);
    const pageSizeNum = parseInt(pageSize, 10);

    if (isNaN(pageNum) || pageNum <= 0) throw new Error('Invalid page parameter.');
    if (isNaN(pageSizeNum) || pageSizeNum <= 0) throw new Error('Invalid pageSize parameter.');

    const limit = pageSizeNum;
    const offset = (pageNum - 1) * limit;

    return { limit, offset, pageNum, pageSizeNum };
};

// --- HELPER for sorting ---
// Add more mappings as needed based on your UI sort options
const getAdTableOrder = (sortBy, sortOrder = 'DESC') => {
    const orderDir = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    switch (sortBy) {
        case 'name':
            // Ensure 'Ad' matches the alias used in your include
            return [[{ model: Ad, as: 'Ad' }, 'name', orderDir]];
        case 'duration':
            return [[{ model: Ad, as: 'Ad' }, 'duration', orderDir]];
        case 'groupsScheduled':
            // Sorting by aggregated counts requires using the alias defined in attributes
            return [[literal('groupsScheduled'), orderDir]]; // Use literal for aggregated alias
        case 'impressions':
        default:
            return [[literal('impressions'), orderDir]]; // Default sort by impressions
    }
};

const getGroupTableOrder = (sortBy, sortOrder = 'DESC') => {
     const orderDir = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
     switch (sortBy) {
        case 'name':
             return [[{ model: DeviceGroup, as: 'DeviceGroup' }, 'name', orderDir]];
        case 'lastPushed':
             return [[{ model: DeviceGroup, as: 'DeviceGroup' }, 'last_pushed', orderDir]];
        case 'deviceCount':
             return [[literal('deviceCount'), orderDir]];
        case 'impressions':
        default:
             return [[literal('impressions'), orderDir]];
     }
};


// --- Controller Methods ---

// GET /api/dashboard/performance/ads/table
exports.getAdPerformanceTable = asyncHandler(async (req, res) => {
    const { startDate: startDateStr, endDate: endDateStr, page = 1, pageSize = 10, sortBy, sortOrder, search } = req.query;
    const { role, client_id } = req.user;

    try {
        const { startDate, endDate } = validateDateRange(startDateStr, endDateStr);
        const { limit, offset, pageNum, pageSizeNum } = getPagination(page, pageSize);
        const order = getAdTableOrder(sortBy, sortOrder);

        // Base Where Clause for DailyImpressionSummary
        const summaryWhere = {
            summary_date: { [Op.between]: [startDate, endDate] }
        };
        if (role === 'Client') {
            summaryWhere.client_id = client_id;
        }

        // Where Clause for included Ad model (for search)
        const adWhere = {};
        if (search) {
            adWhere.name = { [Op.like]: `%${search}%` };
        }

        const { count, rows } = await DailyImpressionSummary.findAndCountAll({
            attributes: [
                // Important: Group by Ad attributes, select them via the 'Ad' alias
                [col('Ad.ad_id'), 'adId'], // Get adId from the Ad model
                [col('Ad.name'), 'name'],
                [col('Ad.duration'), 'duration'],
                // Aggregations from DailyImpressionSummary
                [fn('SUM', col('DailyImpressionSummary.impressions')), 'impressions'],
                [fn('COUNT', fn('DISTINCT', col('DailyImpressionSummary.group_id'))), 'groupsScheduled']
            ],
            include: [{
                model: Ad,
                as: 'Ad', // *** Crucial: Must match the alias in your association definition ***
                attributes: [], // Select Ad attributes in the main attributes array above
                where: adWhere,
                required: true // INNER JOIN to filter by ad name search
            }],
            where: summaryWhere,
            group: [
                // Group by the Ad attributes we are selecting/joining on
                col('Ad.ad_id'),
                col('Ad.name'),
                col('Ad.duration'),
            ],
            order: order,
            limit: limit,
            offset: offset,
            subQuery: false // Often needed with limit/offset when including and grouping
        });

        const totalItems = count.length; // findAndCountAll with group returns array of counts, length is total unique groups
        const totalPages = Math.ceil(totalItems / limit);

        res.status(200).json({
            data: rows.map(row => row.get({ plain: true })), // Convert Sequelize instances to plain objects
            pagination: {
                currentPage: pageNum,
                pageSize: pageSizeNum,
                totalItems: totalItems,
                totalPages: totalPages
            }
        });
    } catch (error) {
        console.error("Error fetching ads table:", error);
        // Return specific validation errors or a generic server error
        res.status(error.message.startsWith('Invalid') ? 400 : 500).json({ message: error.message || "Internal server error" });
    }
});

// GET /api/dashboard/performance/groups/table
exports.getGroupPerformanceTable = asyncHandler(async (req, res) => {
    const { startDate: startDateStr, endDate: endDateStr, page = 1, pageSize = 10, sortBy, sortOrder, search } = req.query;
    const { role, client_id } = req.user;

     try {
        const { startDate, endDate } = validateDateRange(startDateStr, endDateStr);
        const { limit, offset, pageNum, pageSizeNum } = getPagination(page, pageSize);
        const order = getGroupTableOrder(sortBy, sortOrder);

        const summaryWhere = {
            summary_date: { [Op.between]: [startDate, endDate] }
        };
        if (role === 'Client') {
            summaryWhere.client_id = client_id;
        }

        const groupWhere = {};
        if (search) {
            groupWhere.name = { [Op.like]: `%${search}%` };
        }

        const { count, rows } = await DailyImpressionSummary.findAndCountAll({
             attributes: [
                [col('DeviceGroup.group_id'), 'groupId'],
                [col('DeviceGroup.name'), 'name'],
                [col('DeviceGroup.last_pushed'), 'lastPushed'],
                [fn('SUM', col('DailyImpressionSummary.impressions')), 'impressions'],
                // Count distinct devices associated with the group via the include
                [fn('COUNT', fn('DISTINCT', col('DeviceGroup.Devices.device_id'))), 'deviceCount']
            ],
            include: [{
                model: DeviceGroup,
                as: 'DeviceGroup', // *** Crucial: Match association alias ***
                attributes: [], // Select group attributes in the main attributes list
                where: groupWhere,
                required: true, // INNER JOIN
                include: [{ // Include Devices THROUGH DeviceGroup to count them
                   model: Device,
                   as: 'Devices', // *** Crucial: Match association alias ***
                   attributes: [], // No need to select device attributes, just counting
                   required: false // LEFT JOIN - count groups even if they have 0 devices? Or true for INNER? Let's use false for now.
                }]
            }],
            where: summaryWhere,
            group: [
                col('DeviceGroup.group_id'),
                col('DeviceGroup.name'),
                col('DeviceGroup.last_pushed')
            ],
            order: order,
            limit: limit,
            offset: offset,
            subQuery: false // Important for aggregations + limit with includes
        });

        const totalItems = count.length; // findAndCountAll with group returns array
        const totalPages = Math.ceil(totalItems / limit);

        res.status(200).json({
            data: rows.map(row => row.get({ plain: true })),
            pagination: {
                currentPage: pageNum,
                pageSize: pageSizeNum,
                totalItems: totalItems,
                totalPages: totalPages
            }
        });
    } catch (error) {
        console.error("Error fetching groups table:", error);
        res.status(error.message.startsWith('Invalid') ? 400 : 500).json({ message: error.message || "Internal server error" });
    }
});

// GET /api/dashboard/stats
// Calculates date-range sensitive KPIs
exports.getStats = asyncHandler(async (req, res) => {
    const { startDate: startDateStr, endDate: endDateStr } = req.query;
    const { role, client_id } = req.user; // Assumes auth middleware provides this

    try {
        // 1. Validate Dates
        const { startDate, endDate } = validateDateRange(startDateStr, endDateStr);
        console.log(`Workspaceing date-range stats for role: ${role}, client: ${client_id || 'N/A'}, range: ${startDateStr} to ${endDateStr}`);

        // 2. Build Base Where Clause for filtering DailyImpressionSummary
        const summaryWhereClause = {
            summary_date: { [Op.between]: [startDate, endDate] }
        };
        if (role === 'Client') {
            if (!client_id) {
                 // This case should ideally be prevented by auth logic if client ID is mandatory for client role
                 console.error(`Client role user ${req.user.id} missing client_id.`);
                 res.status(403);
                 throw new Error('Forbidden: Client ID not found for user.');
            }
            summaryWhereClause.client_id = client_id;
        }

        // 3. Query Aggregations from DailyImpressionSummary
        const summaryStats = await DailyImpressionSummary.findOne({
            attributes: [
                [fn('SUM', col('impressions')), 'totalImpressions'],
                [fn('COUNT', fn('DISTINCT', col('ad_id'))), 'adsScheduledInRange'],
                [fn('COUNT', fn('DISTINCT', col('group_id'))), 'activeGroupsInRange']
                // Note: We get activeDevicesInRange in a separate step
            ],
            where: summaryWhereClause,
            raw: true // Get plain objects directly
        });

        // Initialize stats, defaulting nulls to 0
        const kpiData = {
            totalImpressions: Number(summaryStats?.totalImpressions) || 0,
            adsScheduledInRange: Number(summaryStats?.adsScheduledInRange) || 0,
            activeGroupsInRange: Number(summaryStats?.activeGroupsInRange) || 0,
            activeDevicesInRange: 0 // Calculate next
        };

        // 4. Calculate Active Devices based on Active Groups found
        if (kpiData.activeGroupsInRange > 0) {
            // Find the actual group IDs that had summaries in the period/client scope
            const activeGroupsResult = await DailyImpressionSummary.findAll({
                 attributes: [
                    [fn('DISTINCT', col('group_id')), 'groupId']
                 ],
                 where: summaryWhereClause,
                 raw: true
            });
            const activeGroupIds = activeGroupsResult.map(item => item.groupId);

            if (activeGroupIds.length > 0) {
                 // Count distinct devices ONLY within those active groups
                 // No need to filter by client_id here again, as groups are already filtered
                 const deviceCount = await Device.count({
                    where: {
                        group_id: { [Op.in]: activeGroupIds }
                    },
                    distinct: true,
                    col: 'device_id' // Ensure counting distinct devices
                 });
                 kpiData.activeDevicesInRange = deviceCount;
            }
        }

        // 5. Send Response (wrapped in 'data' object as expected by frontend)
        res.status(200).json({ data: kpiData });

    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        // Return specific validation errors or a generic server error
        res.status(error.message.startsWith('Invalid') ? 400 : 500).json({ message: error.message || "Internal server error" });
    }
});