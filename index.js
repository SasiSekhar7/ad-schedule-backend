const express = require("express");
const app = express();
require("dotenv").config(); // Load environment variables from .env
const path = require("path");

const bodyParser = require("body-parser");
const cors = require("cors");
const router = require("./src/routes");
const logger = require("./src/utils/logger");
const requestLogger = require("./src/middleware/requestLogger");
const {
  errorHandler,
  notFoundHandler,
} = require("./src/middleware/errorHandler");

const port = process.env.PORT || 8000;

// Initialize cron jobs
require("./src/cron");

// Middleware
app.use(bodyParser.json());

const corsOptions = ["http://localhost:5174", "https://console.adup.live"];
app.use(cors({ corsOptions }));

// Request logging middleware
app.use(requestLogger);

// Static files
const staticFolder = path.join(__dirname, "assets");
app.use("/api/wgt", express.static(staticFolder));

// API routes
app.use("/api", router);

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Error handling middleware - must be last
app.use(errorHandler);

// Start server
app.listen(port, () => {
  logger.logInfo(`Server running on http://localhost:${port}`, {
    port,
    environment: process.env.NODE_ENV || "development",
  });
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.logError("Unhandled Rejection", reason, {
    promise: promise.toString(),
  });
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.logError("Uncaught Exception", error);
  // Give logger time to write before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});
