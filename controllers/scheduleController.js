const { Op, where } = require("sequelize");
const { Ad, Schedule, Device } = require("../models");

module.exports.scheduleAd2 = async (req, res)=>{
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
    
            console.log("Scheduling from:", start_time, "to", end_time, "for ad duration:", adDuration, "seconds");
    
            // Fetch devices in the specified locations
            let devices = await Device.findAll({
                where: {
                    location: locations ? { [Op.in]: locations } : { [Op.ne]: null }
                }
            });
    
            if (devices.length === 0) {
                return res.status(404).json({ error: "No devices available for the given locations" });
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
                        priority
                    });
    
                    slotTime.setSeconds(slotTime.getSeconds() + adDuration + 5); // Add buffer time
                }
            }
    
            if (schedules.length === 0) {
                return res.status(400).json({ error: "No available slots for scheduling" });
            }
    
            // Save to DB
            // await Schedule.bulkCreate(schedules);
    
            return res.json({ message: "Ad scheduled successfully", schedules });
    
        } catch (error) {
            console.error("Scheduling error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    };

module.exports.scheduleAd = async (req, res)=>{
    try {
        const { ad_id, date_of_play, total_duration, priority, devices } = req.body;
    
        if (!ad_id || !date_of_play || !total_duration || !priority || !devices) {
            return res.status(400).json({ error: "Missing required parameters" });
        }
    
        for (const device_id of devices) {
            await Schedule.create({
                ad_id,
                device_id,
                date_of_play,
                total_duration,
                priority,
            });
        }
    
        return res.json({ message: "Schedules Added Successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
module.exports.updateSchedule = async (req, res) =>{
    try {
        if(!req.params || !req.body){
            return res.status(400).json({ error: "Missing required parameters" });
        }
        await Schedule.update(req.body,{where:{schedule_id: req.params.id}});

        res.json({ message: "Schedule Updated." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
module.exports.deleteSchedule =  async (req, res) => {
    try {
        if(!req.params){
            return res.status(400).json({ error: "Missing required parameters" });
        }
        await Schedule.destroy({ where: { schedule_id: req.params.id } });
        res.json({ message: "Ad removed from schedule." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}