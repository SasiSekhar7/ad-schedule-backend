const winston = require("winston");

// Determine log level based on environment
const level = process.env.NODE_ENV === "production" ? "info" : "debug";

/**
 * Define a human-readable format for development.
 * This includes a colorized, simple format with a timestamp.
 */
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf(
    (info) => `[${info.timestamp}] ${info.level}: ${info.message}`
  )
);

/**
 * Define a machine-readable JSON format for production.
 * This includes timestamps and ensures Error objects are logged correctly.
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }), // <-- Log the full stack trace
  winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
  // Set the default level for the logger
  level: level,

  // Use the production format if in production, otherwise use development format
  format:
    process.env.NODE_ENV === "production"
      ? productionFormat
      : developmentFormat,

  // Define the transports (where logs go)
  transports: [
    // Always log to the console
    new winston.transports.Console(),
  ],

  // --- Production-Only Settings ---
  // These settings are robust for a production environment

  // 1. Log uncaught exceptions to a separate file
  exceptionHandlers: [
    new winston.transports.File({
      filename: "logs/exceptions.log",
      format: productionFormat, // Use JSON format for exceptions
    }),
  ],

  // 2. Log unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: "logs/rejections.log",
      format: productionFormat, // Use JSON format for rejections
    }),
  ],

  // Don't exit the process after logging an uncaught exception
  exitOnError: false,
});

// --- Add File Transports in Production ---
// If we are in production, add transports to write to files.
if (process.env.NODE_ENV === "production") {
  // Write all logs with level 'error' or less to error.log
  logger.add(
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error", // Only log 'error' level messages
    })
  );

  // Write all logs with level 'info' or less to combined.log
  logger.add(
    new winston.transports.File({
      filename: "logs/combined.log",
    })
  );
}

// Helper methods for structured logging
logger.logError = (message, error, metadata = {}) => {
  logger.error(message, {
    error: error?.message || error,
    stack: error?.stack,
    ...metadata,
  });
};

logger.logWarn = (message, metadata = {}) => {
  logger.warn(message, metadata);
};

logger.logInfo = (message, metadata = {}) => {
  logger.info(message, metadata);
};

logger.logDebug = (message, metadata = {}) => {
  logger.debug(message, metadata);
};

logger.logHttp = (message, metadata = {}) => {
  logger.http(message, metadata);
};

module.exports = logger;
