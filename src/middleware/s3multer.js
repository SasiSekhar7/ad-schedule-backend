// This file could be named 'uploadMiddlewares.js' or similar

const multer = require('multer');
const path = require('path');
const fs = require('fs/promises'); // For async file system operations

// --- Existing Middleware for general images/media (unchanged) ---
const storage = multer.memoryStorage();

// Set up Multer for in-memory uploads (e.g., for general images/media)
const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // Example: 20MB limit for media
    fileFilter: (req, file, cb) => {
        // Example: Only allow images and videos for general media upload
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed for this upload!'), false);
        }
    }
});

// Middleware to handle errors for general uploads
const uploadMiddleware = (req, res, next) => {
    upload.single('file')(req, res, (err) => { // Assumes the field name is 'file'
        if (err instanceof multer.MulterError) {
            console.error("Multer Error (General):", err);
            return res.status(400).json({ error: `Multer error: ${err.message}` });
        } else if (err) {
            console.error("Upload Error (General):", err);
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        }

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded. Make sure you're sending the 'file' field." });
        }

        next();
    });
};


// --- New Middleware for APK uploads (MODIFIED) ---

// Define the directory for temporary APK storage
const apkUploadDir = path.join(__dirname, '../uploads/temp_apks');
// Ensure the directory exists when the application starts
fs.mkdir(apkUploadDir, { recursive: true }).catch(console.error);

// Set up Multer for disk storage specifically for APKs
// This is the key change: using diskStorage to control filenames
const apkStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, apkUploadDir); // Specify the directory where files should be stored
    },
    filename: function (req, file, cb) {
        // Generate a unique filename while preserving the original .apk extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalExtension = path.extname(file.originalname);
        // Force the extension to be '.apk' for consistency and clarity
        const finalExtension = originalExtension.toLowerCase() === '.apk' ? '.apk' : '.apk'; 
        cb(null, file.fieldname + '-' + uniqueSuffix + finalExtension);
    }
});

const uploadApk = multer({
    storage: apkStorage, // Use the custom diskStorage configuration
    limits: { fileSize: 100 * 1024 * 1024 }, // Set a higher limit for APKs, e.g., 100MB
    fileFilter: (req, file, cb) => {
        // Only allow .apk files for this middleware, also checking MIME type for robustness
        if (path.extname(file.originalname).toLowerCase() === '.apk' &&
            file.mimetype === 'application/vnd.android.package-archive') { 
            cb(null, true);
        } else {
            cb(new Error('Only .apk files are allowed for APK upload!'), false);
        }
    }
});

// Middleware to handle errors for APK uploads (remains mostly the same)
const apkUploadMiddleware = (req, res, next) => {
    uploadApk.single('apk_file')(req, res, (err) => { // Assumes the field name is 'apk_file'
        if (err instanceof multer.MulterError) {
            console.error("Multer Error (APK):", err);
            // Customize error message for file size limit specific to APKs
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: `APK file is too large. Max allowed size is ${uploadApk.limits.fileSize / (1024 * 1024)}MB.` });
            }
            return res.status(400).json({ error: `Multer error: ${err.message}` });
        } else if (err) {
            console.error("Upload Error (APK):", err);
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        }

        if (!req.file) {
            return res.status(400).json({ error: "No APK file uploaded. Make sure you're sending the 'apk_file' field." });
        }

        next();
    });
};

// Export both sets of Multer instances and their corresponding middleware
module.exports = {
    // Existing exports
    upload,          // Multer instance for in-memory uploads
    uploadMiddleware,// Middleware for general file uploads (using 'file' field)

    // New exports for APKs
    uploadApk,       // Multer instance for disk-based APK uploads
    apkUploadMiddleware// Middleware for APK uploads (using 'apk_file' field)
};