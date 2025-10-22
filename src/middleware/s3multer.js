// This file could be named 'uploadMiddlewares.js' or similar

const multer = require("multer");
const path = require("path");
const fs = require("fs/promises"); // For async file system operations

// --- Directories for temporary storage ---
const generalUploadDir = path.join(__dirname, "../uploads/temp_general_media");
const apkUploadDir = path.join(__dirname, "../uploads/temp_apks");

// Ensure directories exist when the application starts
fs.mkdir(generalUploadDir, { recursive: true }).catch(console.error);
fs.mkdir(apkUploadDir, { recursive: true }).catch(console.error);

// --- Existing Middleware for general images/media (MODIFIED to use disk storage) ---

// Define disk storage for general media uploads
const generalMediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, generalUploadDir); // Specify the directory for general media
  },
  filename: function (req, file, cb) {
    // Generate a unique filename while preserving the original extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const originalExtension = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + originalExtension);
  },
});

// Set up Multer for disk storage for general uploads
const upload = multer({
    storage: generalMediaStorage, // Use the new diskStorage configuration
    limits: { fileSize: 400 * 1024 * 1024 }, // Increased limit for general media, e.g., 250MB
    fileFilter: (req, file, cb) => {
        // Example: Only allow images and videos for general media upload
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed for this upload!'), false);
        }
    }
  },
});

// Middleware to handle errors for general uploads (remains mostly the same, now handles disk-stored file)
const uploadMiddleware = (req, res, next) => {
  if (req.body.isMultipartUpload) {
    next();
    return;
  } else {
    upload.single("file")(req, res, (err) => {
      // Assumes the field name is 'file'
      if (err instanceof multer.MulterError) {
        console.error("Multer Error (General):", err);
        // Customize error message for file size limit specific to general media
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            error: `File is too large. Max allowed size is ${
              upload.limits.fileSize / (1024 * 1024)
            }MB.`,
          });
        }
        return res.status(400).json({ error: `Multer error: ${err.message}` });
      } else if (err) {
        console.error("Upload Error (General):", err);
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "No file uploaded. Make sure you're sending the 'file' field.",
        });
      }

      next();
    });
  }
};

// --- New Middleware for APK uploads (unchanged, just added to context) ---

// Set up Multer for disk storage specifically for APKs
const apkStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, apkUploadDir); // Specify the directory where files should be stored
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const originalExtension = path.extname(file.originalname);
    const finalExtension =
      originalExtension.toLowerCase() === ".apk" ? ".apk" : ".apk";
    cb(null, file.fieldname + "-" + uniqueSuffix + finalExtension);
  },
});

const uploadApk = multer({
  storage: apkStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      path.extname(file.originalname).toLowerCase() === ".apk" &&
      file.mimetype === "application/vnd.android.package-archive"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only .apk files are allowed for APK upload!"), false);
    }
  },
});

const apkUploadMiddleware = (req, res, next) => {
  uploadApk.single("apk_file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error("Multer Error (APK):", err);
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: `APK file is too large. Max allowed size is ${
            uploadApk.limits.fileSize / (1024 * 1024)
          }MB.`,
        });
      }
      return res.status(400).json({ error: `Multer error: ${err.message}` });
    } else if (err) {
      console.error("Upload Error (APK):", err);
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }

    if (!req.file) {
      return res.status(400).json({
        error:
          "No APK file uploaded. Make sure you're sending the 'apk_file' field.",
      });
    }

    next();
  });
};

// Export both sets of Multer instances and their corresponding middleware
module.exports = {
  upload, // Multer instance for disk-based general media uploads
  uploadMiddleware, // Middleware for general file uploads (using 'file' field)

  uploadApk, // Multer instance for disk-based APK uploads
  apkUploadMiddleware, // Middleware for APK uploads (using 'apk_file' field)
};
