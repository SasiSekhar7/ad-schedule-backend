const { sequelize } = require("../models"); // Your Sequelize instance
require("dotenv").config(); // Load environment variables from .env

const syncDb = async () => {
  try {
    // await sequelize.sync({ alter: true });
    await sequelize.sync({
      force: false,
      alter: false,
    });
    console.log("Database synced successfully.");
  } catch (error) {
    console.error("Error syncing database:", error);
  }
};

syncDb();
