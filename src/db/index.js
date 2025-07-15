const path = require("path");
const { Sequelize } = require("sequelize");
require("dotenv").config(); // Load environment variables from .env

// const config = {
//     dialect: 'sqlite',
//     storage: path.resolve(__dirname,'backend_service.db')
// }

const config = {
  dialect: process.env.DB_DIALECT || "postgres",
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  username: process.env.DB_USER || "adupuser",
  password: process.env.DB_PASSWORD || "Birla@1122",
  database: process.env.DB_NAME || "testdb",
  logging: false, // optional
};

console.log("Database configuration:", config);

// const sequelize = new Sequelize(config);
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  config
);

module.exports = sequelize;
