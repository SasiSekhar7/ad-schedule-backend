const multer = require('multer');

const storage = multer.memoryStorage();



// Set up Multer
const upload = multer({
    storage: storage
});

// Middleware to handle errors
const uploadMiddleware = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.error("Multer Error:", err);
            return res.status(400).json({ error: `Multer error: ${err.message}` });
        } else if (err) {
            console.error("Upload Error:", err);
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        }

        // If no file is uploaded, send an error
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded. Make sure you're sending the correct field name." });
        }

        next();
    });
};

module.exports = {upload , uploadMiddleware};