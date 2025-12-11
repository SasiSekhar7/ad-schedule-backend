/* eslint-disable no-undef */
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  UploadPartCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");
const path = require("path");
const { Ad, DeviceGroup } = require("../models");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { pushToGroupQueue } = require("./queueController");
const fs = require("fs/promises"); // For async file system operations
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const logger = require("../utils/logger");

const region = process.env.AWS_BUCKET_REGION;
const folderPath = process.env.AWS_FOLDER_PATH;
const accessKeyId = process.env.AWS_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET_KEY;
const bucketName = process.env.AWS_BUCKET_NAME;
const lambdaName = process.env.LAMBDA_TRIGGER_NAME; // your Lambda function name
const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const lambda = new LambdaClient({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});
module.exports.uploadAdsToEgressS3 = async (req, res) => {
  try {
    const allAds = await Ad.findAll({ where: { status: "pending" } });

    for (const ad of allAds) {
      if (!ad.url) continue;

      // 🧠 Extract only the file name (like "ad-1760957245721.mp4")
      const fileName = ad.url.split("/").pop();

      const payload = {
        s3Key: fileName,
        ad_id: ad.ad_id,
        timestamp: new Date().toISOString(),
      };

      logger.logInfo("Invoking Lambda for ad processing", {
        ad_id: ad.ad_id,
        s3Key: fileName,
      });

      // const invokeCommand = new InvokeCommand({
      //   FunctionName: lambdaName,
      //   InvocationType: "Event",
      //   Payload: Buffer.from(JSON.stringify(payload)),
      // });

      // await lambda.send(invokeCommand);
      await Ad.update({ status: "completed" }, { where: { ad_id: ad.ad_id } });
    }

    return res.status(200).json({ message: "Ads uploaded successfully" });
  } catch (error) {
    logger.logError("Error uploading ads to egress S3", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports.dailySchedulePushManual = async (req, res) => {
  try {
    const groups = await DeviceGroup.findAll({ attributes: ["group_id"] });

    const groupIds = groups.map((grp) => grp.group_id);

    await pushToGroupQueue(groupIds);

    res.json({ message: "Daily schedule push initiated" });
  } catch (error) {
    logger.logError("Error in daily schedule push", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
