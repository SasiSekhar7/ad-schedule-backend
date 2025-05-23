const jwt = require('jsonwebtoken')
module.exports.validateToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1]; // Extract token from "Bearer <token>"

    if (!token) {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify token
        console.log(decoded)
        req.user = decoded; // Attach payload data to req.user
        next(); // Proceed to the next middleware/controller
    } catch (error) {
        console.log(error)
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }
};

module.exports.validateDeviceToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1]; // Extract token from "Bearer <token>"

    if (!token) {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_DEVICE_SECRET); // Verify token
        console.log(decoded)
        req.device = decoded; // Attach payload data to req.user
        next(); // Proceed to the next middleware/controller
    } catch (error) {
        console.log(error)
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }
};

module.exports.validateAdmin = (req, res, next) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    next();
};

