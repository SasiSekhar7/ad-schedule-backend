const { Ad } = require("../models");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const logger = require("../utils/logger");

// Environment variables
const region = process.env.AWS_BUCKET_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET_KEY;
const lambdaName = process.env.LAMBDA_TRIGGER_NAME;
const mediaConvertWebhookKey =
  process.env.MEDIACONVERT_WEBHOOK_KEY || "83FVwxqv0u8iK7MxeweU";

const lambda = new LambdaClient({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

/**
 * Validates the API key from the webhook request
 * @param {string} apiKey - The API key from request headers
 * @returns {boolean} - True if valid, false otherwise
 */
const validateWebhookKey = (apiKey) => {
  if (!apiKey) {
    logger.logWarn("Missing API key in webhook request");
    return false;
  }

  if (apiKey !== mediaConvertWebhookKey) {
    logger.logWarn("Invalid API key in webhook request");
    return false;
  }

  logger.logDebug("API key validated successfully");
  return true;
};

/**
 * Extracts the output file path from MediaConvert webhook response
 * @param {object} body - The webhook body containing MediaConvert job details
 * @returns {string|null} - The S3 output file path or null if not found
 */
const extractOutputFilePath = (body) => {
  try {
    if (!body || !body.detail) {
      logger.logError("Invalid webhook body structure");
      return null;
    }

    const { detail } = body;

    // Extract output file path from outputGroupDetails
    if (
      detail.outputGroupDetails &&
      detail.outputGroupDetails.length > 0 &&
      detail.outputGroupDetails[0].outputDetails &&
      detail.outputGroupDetails[0].outputDetails.length > 0 &&
      detail.outputGroupDetails[0].outputDetails[0].outputFilePaths &&
      detail.outputGroupDetails[0].outputDetails[0].outputFilePaths.length > 0
    ) {
      const outputPath =
        detail.outputGroupDetails[0].outputDetails[0].outputFilePaths[0];
      logger.logDebug("Output file path extracted", { outputPath });

      if (outputPath) {
        // ✅ Remove the 's3://<bucket-name>/' prefix
        const cleanedPath = outputPath.replace(/^s3:\/\/[^/]+\//, "");
        logger.logDebug("Cleaned output file path", { cleanedPath });
        return cleanedPath;
      }
    }

    logger.logError("Could not extract output file path from webhook");
    return null;
  } catch (error) {
    logger.logError("Error extracting output file path", error);
    return null;
  }
};

/**
 * Extracts ad_id from MediaConvert job metadata
 * @param {object} body - The webhook body containing MediaConvert job details
 * @returns {string|null} - The ad_id or null if not found
 */
const extractAdId = (body) => {
  try {
    if (
      body &&
      body.detail &&
      body.detail.userMetadata &&
      body.detail.userMetadata.ad_id
    ) {
      const adId = body.detail.userMetadata.ad_id;
      logger.logDebug("Ad ID extracted from webhook", { adId });
      return adId;
    }
    logger.logError("Could not extract ad_id from webhook");
    return null;
  } catch (error) {
    logger.logError("Error extracting ad_id", error);
    return null;
  }
};

/**
 * Main webhook handler for MediaConvert job completion
 * Validates the request, extracts the output file path, and updates the Ad record
 */
module.exports.triggerMediaConvertWebhook = async (req, res) => {
  try {
    logger.logInfo("Received MediaConvert webhook");

    // Step 1: Validate API key
    const apiKey = req.headers["x-api-key"];
    if (!validateWebhookKey(apiKey)) {
      logger.logWarn("Webhook validation failed: Invalid API key");
      return res.status(401).json({ error: "Unauthorized: Invalid API key" });
    }

    // Step 2: Parse webhook body
    let body;
    if (typeof req.body === "string") {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    logger.logDebug("Webhook body parsed successfully");

    // Step 3: Extract ad_id from webhook
    const ad_id = extractAdId(body);
    if (!ad_id) {
      logger.logError("Failed to extract ad_id from webhook");
      return res
        .status(400)
        .json({ error: "Missing ad_id in webhook metadata" });
    }

    // Step 4: Extract output file path
    const outputFilePath = extractOutputFilePath(body);
    if (!outputFilePath) {
      logger.logError("Failed to extract output file path from webhook");
      return res
        .status(400)
        .json({ error: "Missing output file path in webhook" });
    }

    // Step 5: Find the Ad record
    const ad = await Ad.findOne({ where: { ad_id } });
    if (!ad) {
      logger.logError("Ad not found", null, { ad_id });
      return res.status(404).json({ message: "Ad not found" });
    }

    logger.logDebug("Ad found", { ad_id });

    // Step 6: Update Ad with converted media URL
    await ad.update({ url: outputFilePath, status: "completed" });
    logger.logInfo("Ad updated with converted media URL", {
      ad_id,
      outputFilePath,
    });

    // Step 8: Return success response
    return res.status(200).json({
      success: true,
      message: "MediaConvert webhook processed successfully",
      ad_id,
      outputFilePath,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.logError("Error processing MediaConvert webhook", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: error.message,
    });
  }
};
