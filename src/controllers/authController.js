const { User } = require("../models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

module.exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      logger.logWarn("Login attempt with missing credentials", {
        email: email || "not provided",
        ip: req.ip || req.connection.remoteAddress,
      });
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      logger.logWarn("Login attempt with invalid email", {
        email,
        ip: req.ip || req.connection.remoteAddress,
      });
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      logger.logWarn("Login attempt with invalid password", {
        email,
        userId: user.user_id,
        ip: req.ip || req.connection.remoteAddress,
      });
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { user_id: user.user_id, role: user.role, client_id: user.client_id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    logger.logInfo("User logged in successfully", {
      userId: user.user_id,
      email: user.email,
      role: user.role,
      ip: req.ip || req.connection.remoteAddress,
    });

    res.json({ message: "Login successful", token });
  } catch (error) {
    logger.logError("Login error", error, {
      email: req.body.email,
      ip: req.ip || req.connection.remoteAddress,
    });
    res.status(500).json({ message: "Internal Server Error" });
  }
};
