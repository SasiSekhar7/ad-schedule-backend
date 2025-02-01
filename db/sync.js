const { sequelize, Device, Client, Ad, DeviceGroup, Schedule, AdPlayback } = require('../models'); // Your Sequelize instance

const syncDb = async () => {
    try {
        await 
        await sequelize.sync({ alter: true }); // Sync schema without dropping tables
        console.log('Database synced successfully.');
    } catch (error) {
        console.error('Error syncing database:', error);
    }
};

syncDb();