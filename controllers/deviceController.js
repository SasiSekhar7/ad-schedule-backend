const { getCustomUTCDateTime, getUTCDate } = require("../helpers");
const { Ad, Device, Schedule, sequelize, DeviceGroup } = require("../models");

module.exports.getFullSchedule = async (req, res) => {
    try {
        const schedules = await Schedule.findAll({
            include: [{ model: Ad }, { model: Device }],
        });

        res.json(schedules);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

module.exports.createDevice = async(req, res) =>{
    try {
       const {location, group_id} = req.body;
       const device  = await Device.create({
        group_id,
        location,
        status: "active",
        last_synced: getCustomUTCDateTime()
       })
       return res.status(201).json({message:"Device enrolled successfully", device})
    //    sequelize.transaction(function(t) {
    //     return Device.findOrCreate({
    //       where: {
    //         userId:    profile.userId,
    //         name:      profile.name
    //       },
    //       transaction: t
    //     })
    //     .spread(function(userResult, created){
    //       // userResult is the user instance
      
    //       if (created) {
    //         // created will be true if a new user was created
    //       }
    //     });
    //   });
      
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

module.exports.syncDevice = async (req, res) => {
    try {
        const { device_id } = req.query;

        if (!device_id) {
            return res.status(400).json({ error: "Device ID is required" });
        }

        // // Fetch the device's last sync timestamp from the database
        // const device = await Device.findByPk(device_id);
        // if (!device) {
        //     return res.status(404).json({ error: "Device not found" });
        // }

        // const lastSyncTime = device.last_synced || new Date(0); // Default to epoch if never synced before

        // // Find ads scheduled for this device that are new/updated since last sync
        const scheduledAds = await Schedule.findAll({
            where: {
                device_id,
                // date_of_play: "25-02-01", // comment out this if you want to test with limited number of files on a device 
            },
            include: [{ model: Ad }]
        });

        // Update last sync time in the database
        await Device.update({ last_synced: getCustomUTCDateTime()}, { where: { device_id } });

        return res.json({
            device_id,
            last_sync: getCustomUTCDateTime(),
            ads: scheduledAds.map(schedule => ({
                ad_id: schedule.Ad.ad_id,
                name: schedule.Ad.name,
                url: `http://localhost:8080/api/ads/${schedule.Ad.url}`,
                duration: schedule.Ad.duration,
                start_time: schedule.start_time
            }))
        });

    } catch (error) {
        console.error("Sync error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};


module.exports.createGroup = async(req,res)=>{
    try {
        const {name} = req.body;

        const group =  await DeviceGroup.create({name});

        return res.status(201).json({message:"group created succesfully", group})
    } catch (error) {
        console.error("Sync error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}