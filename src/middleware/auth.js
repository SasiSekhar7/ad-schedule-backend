const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

module.exports.validateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // Extract token from "Bearer <token>"

  if (!token) {
    logger.logWarn("Authentication failed: No token provided", {
      ip: req.ip || req.connection.remoteAddress,
      url: req.originalUrl,
      method: req.method,
    });
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify token
    logger.logDebug("Token validated successfully", {
      userId: decoded.user_id,
      role: decoded.role,
    });
    req.user = decoded; // Attach payload data to req.user
    next(); // Proceed to the next middleware/controller
  } catch (error) {
    logger.logWarn("Authentication failed: Invalid token", {
      error: error.message,
      ip: req.ip || req.connection.remoteAddress,
      url: req.originalUrl,
    });
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

module.exports.validateDeviceToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // Extract token from "Bearer <token>"

  if (!token) {
    logger.logWarn("Device authentication failed: No token provided", {
      ip: req.ip || req.connection.remoteAddress,
      url: req.originalUrl,
    });
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_DEVICE_SECRET); // Verify token
    logger.logDebug("Device token validated successfully", {
      deviceId: decoded.device_id,
    });
    req.device = decoded; // Attach payload data to req.device
    next(); // Proceed to the next middleware/controller
  } catch (error) {
    logger.logWarn("Device authentication failed: Invalid token", {
      error: error.message,
      ip: req.ip || req.connection.remoteAddress,
    });
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

module.exports.validateAdmin = (req, res, next) => {
  if (req.user.role !== "Admin") {
    logger.logWarn("Authorization failed: Admin access required", {
      userId: req.user.user_id,
      role: req.user.role,
      url: req.originalUrl,
    });
    return res
      .status(403)
      .json({ message: "Forbidden: Admin access required" });
  }
  logger.logDebug("Admin access granted", {
    userId: req.user.user_id,
  });
  next();
};
