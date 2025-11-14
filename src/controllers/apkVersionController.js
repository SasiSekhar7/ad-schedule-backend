const fs = require("fs/promises"); // For async file system operations
const crypto = require("crypto"); // For SHA256 checksum

// --- Third-Party Libraries ---
const { Op } = require("sequelize"); // For Sequelize operators like [Op.ne]

// --- Project-Specific Imports ---
const { ApkVersion } = require("../models"); // Your Sequelize APK version model
const {
  uploadFileToS3,
  deleteFileFromS3,
  getSignedS3Url,
} = require("./s3Controller"); // Import S3 functions
const logger = require("../utils/logger");

// --- Controller Functions ---

// ADMIN PANEL APIs (These will be protected by validateAdmin in your router.js)

/**
 * GET /api/v1/apk_versions
 * List all APK versions.
 */
module.exports.getAllApkVersions = async (req, res) => {
  try {
    const versions = await ApkVersion.findAll({
      order: [["version_code", "DESC"]],
    });
    res.status(200).json({ apk_versions: versions });
  } catch (error) {
    logger.logError("Error fetching APK versions", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * POST /api/v1/apk_versions/latest
 * Returns the latest APK version (by version_code) for suggestion.
 */
module.exports.getLatestApkVersion = async (req, res) => {
  try {
    const latestVersion = await ApkVersion.findOne({
      order: [["version_code", "DESC"]],
      limit: 1,
    });

    if (latestVersion) {
      res.status(200).json({
        latestVersionCode: latestVersion.version_code,
        latestVersionName: latestVersion.version_name,
      });
    } else {
      res.status(200).json({
        latestVersionCode: 0,
        latestVersionName: "0.0.0",
      });
    }
  } catch (error) {
    logger.logError("Error fetching latest APK version", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * POST /api/v1/apk_versions
 * Adds a new APK version.
 */
module.exports.addApkVersion = async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ message: "No APK file received. Please upload an APK file." });
  }

  const {
    version_code,
    version_name,
    file_name,
    release_notes,
    is_mandatory,
    is_active,
  } = req.body;

  const tempFilePath = req.file.path;
  let calculatedChecksum;
  let actualFileSizeBytes;
  let s3Key;

  // --- Backend Validation ---
  const parsedVersionCode = parseInt(version_code, 10);
  if (
    !parsedVersionCode ||
    version_name === "" ||
    file_name === "" ||
    isNaN(parsedVersionCode) ||
    parsedVersionCode <= 0
  ) {
    await fs.unlink(tempFilePath).catch((err) =>
      logger.logWarn("Error deleting temp file on validation failure", {
        error: err.message,
      })
    );
    return res.status(400).json({
      message:
        "Missing or invalid required APK details (Version Code must be a positive integer, Version Name, File Name).",
    });
  }

  try {
    // 1. Get Actual File Size & Calculate Checksum
    const fileBuffer = await fs.readFile(tempFilePath);
    calculatedChecksum = crypto
      .createHash("sha256")
      .update(fileBuffer)
      .digest("hex");
    const stats = await fs.stat(tempFilePath);
    actualFileSizeBytes = stats.size;

    // 2. Upload to S3 using the generic S3 controller function
    const cleanVersionName = version_name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    s3Key = `apks/release/${cleanVersionName}_${parsedVersionCode}.apk`;

    await uploadFileToS3({
      // Use the imported generic S3 upload function
      Body: fileBuffer,
      Key: s3Key,
      ContentType: "application/vnd.android.package-archive",
    });

    // 3. Database Transaction
    await ApkVersion.sequelize.transaction(async (t) => {
      const isActiveBoolean = is_active === "true";
      const isMandatoryBoolean = is_mandatory === "true";

      if (isActiveBoolean) {
        await ApkVersion.update(
          { is_active: false },
          {
            where: { is_active: true },
            transaction: t,
          }
        );
      }

      const newVersion = await ApkVersion.create(
        {
          version_code: parsedVersionCode,
          version_name: version_name,
          file_name: file_name,
          s3_key: s3Key,
          file_size_bytes: actualFileSizeBytes,
          release_notes: release_notes,
          is_mandatory: isMandatoryBoolean,
          is_active: isActiveBoolean,
          checksum_sha256: calculatedChecksum,
          uploaded_at: new Date(),
        },
        { transaction: t }
      );

      res.status(201).json(newVersion);
    });
  } catch (error) {
    logger.logError("Error adding new APK version", error, {
      version_code,
      version_name,
    });
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        message: "A version with this code or checksum already exists.",
      });
    }
    res.status(500).json({
      message: error.message || "Internal server error during APK addition.",
    });
  } finally {
    // Always delete the temporary file from local disk
    await fs
      .unlink(tempFilePath)
      .catch((err) =>
        logger.logWarn("Error deleting temp file", { error: err.message })
      );
  }
};

/**
 * PUT /api/v1/apk_versions/:id
 * Updates an existing APK version entry.
 */
module.exports.updateApkVersion = async (req, res) => {
  const { id } = req.params;
  const { version_name, release_notes, is_mandatory, is_active } = req.body;

  try {
    const apkVersion = await ApkVersion.findByPk(id);
    if (!apkVersion) {
      return res.status(404).json({ message: "APK version not found." });
    }

    await ApkVersion.sequelize.transaction(async (t) => {
      const isActiveBoolean = is_active === true || is_active === "true";
      const isMandatoryBoolean =
        is_mandatory === true || is_mandatory === "true";

      if (isActiveBoolean && apkVersion.is_active === false) {
        await ApkVersion.update(
          { is_active: false },
          {
            where: { is_active: true },
            transaction: t,
          }
        );
      }

      await apkVersion.update(
        {
          version_name:
            version_name !== undefined ? version_name : apkVersion.version_name,
          release_notes:
            release_notes !== undefined
              ? release_notes
              : apkVersion.release_notes,
          is_mandatory: isMandatoryBoolean,
          is_active: isActiveBoolean,
          updated_at: new Date(),
        },
        { transaction: t }
      );

      res.status(200).json(apkVersion);
    });
  } catch (error) {
    logger.logError(`Error updating APK version`, error, {
      apk_version_id: id,
    });
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        message:
          "Unique constraint violated. A similar entry might already exist.",
      });
    }
    res
      .status(500)
      .json({ message: error.message || "Internal server error." });
  }
};

/**
 * DELETE /api/v1/apk_versions/:id
 * Deletes an APK version entry from the database.
 */
module.exports.deleteApkVersion = async (req, res) => {
  const { id } = req.params;

  try {
    const apkVersion = await ApkVersion.findByPk(id);
    if (!apkVersion) {
      return res.status(404).json({ message: "APK version not found." });
    }

    if (apkVersion.is_active) {
      return res.status(400).json({
        message: "Cannot delete an active APK version. Deactivate it first.",
      });
    }

    // Optionally, delete the file from S3 as well.
    // This is important for cleanup of permanent storage.
    if (apkVersion.s3_key) {
      await deleteFileFromS3(apkVersion.s3_key); // Use the imported generic S3 delete function
    }

    await apkVersion.destroy();
    res.status(204).send(); // No content for successful deletion
  } catch (error) {
    logger.logError(`Error deleting APK version`, error, {
      apk_version_id: id,
    });
    res
      .status(500)
      .json({ message: error.message || "Internal server error." });
  }
};

module.exports.checkForUpdates = async (req, res) => {
  // Expected query parameters from the Android device
  const { ver } = req.query;

  // Basic validation for required parameters
  if (!ver) {
    return res
      .status(400)
      .json({ message: "Missing device_id or ver in query parameters." });
  }

  try {
    // Find the latest active APK version that has a higher version_code
    // than the one currently installed on the device.
    const latestVersion = await ApkVersion.findOne({
      where: {
        is_active: true, // Only consider versions marked as active
        version_code: {
          [Op.gt]: parseInt(ver, 10), // [Op.gt] is "greater than"
        },
      },
      order: [["version_code", "DESC"]], // Ensure we get the highest version available
      limit: 1, // We only need one (the latest)
    });

    if (latestVersion) {
      // An update is available. Generate a time-limited S3 download URL.
      // The URL will be valid for 10 minutes (600 seconds).
      const downloadUrl = await getSignedS3Url(latestVersion.s3_key, 600);

      // If for some reason the signed URL couldn't be generated (e.g., S3 issue, file missing)
      if (!downloadUrl) {
        logger.logError(`Failed to generate download URL for S3 Key`, null, {
          s3_key: latestVersion.s3_key,
        });
        return res
          .status(500)
          .json({ message: "Failed to generate download URL for the update." });
      }

      // Respond with update availability and details
      res.status(200).json({
        updateAvailable: true,
        latestVersionCode: latestVersion.version_code,
        latestVersionName: latestVersion.version_name,
        fileSizeBytes: latestVersion.file_size_bytes,
        releaseNotes: latestVersion.release_notes,
        downloadUrl: downloadUrl, // The pre-signed S3 URL for download
        checksumSha256: latestVersion.checksum_sha256, // For integrity verification on the device
        isMandatory: latestVersion.is_mandatory, // Inform the device if the update is mandatory
      });
    } else {
      // No update available (either no newer active versions, or device is already on latest)
      res.status(200).json({
        updateAvailable: false,
        message: "You are on the latest available version.",
      });
    }
  } catch (error) {
    logger.logError("Error in checkForUpdates API", error, {
      device_version: ver,
    });
    res.status(500).json({
      message: error.message || "Internal server error during update check.",
    });
  }
};
