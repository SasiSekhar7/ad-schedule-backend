const logger = require("../utils/logger");

/**
 * Middleware to log HTTP requests
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  logger.logHttp("Incoming Request", {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get("user-agent"),
    userId: req.user?.user_id || "unauthenticated",
  });

  // Capture response
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const metadata = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.user_id || "unauthenticated",
    };

    if (res.statusCode >= 400) {
      logger.logWarn("Request Completed", metadata);
    } else {
      logger.logHttp("Request Completed", metadata);
    }
  });

  next();
};

module.exports = requestLogger;
