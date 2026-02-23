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
const { Ad, DeviceGroup, Client, Tier } = require("../models");
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

async function deleteFileFromS3Folder(ad_id) {
  const folderPath = `ads/${ad_id}/`; // example folder path pattern

  try {
    const listParams = {
      Bucket: bucketName,
      Prefix: folderPath, // delete all files under this prefix
    };

    const listedObjects = await s3.send(new ListObjectsV2Command(listParams));

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      logger.logInfo(`No files found for ad_id: ${ad_id}`, { ad_id });
      return;
    }

    const deleteParams = {
      Bucket: bucketName,
      Delete: {
        Objects: listedObjects.Contents.map((obj) => ({ Key: obj.Key })),
      },
    };

    logger.logDebug("Listed Objects for deletion", {
      ad_id,
      count: listedObjects.Contents.length,
    });

    const result = await s3.send(new DeleteObjectsCommand(deleteParams));
    logger.logInfo(`Deleted files from S3`, {
      ad_id,
      deletedCount: result.Deleted.length,
    });

    // Handle pagination if more than 1000 objects
    if (listedObjects.IsTruncated) {
      await deleteFileFromS3Folder(ad_id);
    }
  } catch (error) {
    logger.logError("Error deleting files from S3", error, { ad_id });
  }
}

module.exports.getBucketURL = async (fileName) => {
  try {
    const headParams = {
      Bucket: bucketName,
      Key: fileName,
    };

    await s3.send(new HeadObjectCommand(headParams));
    const getCommand = new GetObjectCommand(headParams);
    // const url = await getSignedUrl(s3, getCommand, { expiresIn: 86400 });
    const url = await getSignedUrl(s3, getCommand, { expiresIn: 2592000 });

    return url;
  } catch (error) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      logger.logWarn(`S3 file not found`, { fileName });
    } else {
      logger.logError("S3 getBucketURL error", error, { fileName });
    }
    return null;
  }
};

module.exports.changeFile = async (req, res) => {
  let fileBuffer;
  try {
    const { ad_id } = req.params;
    const ad = await Ad.findOne({ where: { ad_id } });

    if (!ad) {
      return res.status(404).json({ message: "Ad not found" });
    }

    const client = await Client.findOne({
      where: { client_id: ad.client_id },
      include: Tier,
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const storageLimit = BigInt(client.Tier.storage_limit_bytes);
    const currentUsed = BigInt(client.used_storage_bytes);

    let oldFileSize = 0n;
    let newFileSize = 0n;

    const { file_url, isMultipartUpload } = req.body;

    logger.logDebug("Change file request", {
      ad_id,
      isMultipartUpload,
      userId: req.user?.user_id,
    });
    if (isMultipartUpload == true || isMultipartUpload == "true") {
      if (!file_url) {
        return res.status(400).json({ message: "New file is required." });
      }
      //  Get OLD file size BEFORE deleting
      if (ad.url) {
        const oldHead = new HeadObjectCommand({
          Bucket: bucketName,
          Key: ad.url,
        });

        const oldMeta = await s3.send(oldHead);
        oldFileSize = BigInt(oldMeta.ContentLength || 0);
      }

      if (ad.url) {
        const deleteParams = {
          Bucket: bucketName,
          Key: ad.url, // Previous file path
        };

        const deleteCommand = new DeleteObjectCommand(deleteParams);
        await s3.send(deleteCommand);
      }

      if (ad_id) {
        await deleteFileFromS3Folder(ad_id);
      }

      //  Get NEW file size
      const newHead = new HeadObjectCommand({
        Bucket: bucketName,
        Key: file_url,
      });

      const newMeta = await s3.send(newHead);
      newFileSize = BigInt(newMeta.ContentLength || 0);

      //  Calculate updated storage
      const updatedUsed = currentUsed - oldFileSize + newFileSize;

      if (updatedUsed > storageLimit) {
        // Delete newly uploaded file to avoid orphan
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: file_url,
          }),
        );

        return res.status(400).json({
          message: "Storage limit exceeded",
        });
      }

      //  Update client storage
      client.used_storage_bytes =
        updatedUsed > 0n ? updatedUsed.toString() : "0";
      await client.save();

      // 2️⃣ Trigger the Lambda after successful upload
      // 2️⃣ Trigger the Lambda after successful upload
      // 2️⃣ Trigger the Lambda after successful upload
      const payload = {
        s3Key: file_url,
        ad_id: ad_id,
        timestamp: new Date().toISOString(),
      };

      const invokeCommand = new InvokeCommand({
        FunctionName: lambdaName,
        InvocationType: "Event", // async trigger (doesn’t wait for Lambda to complete)
        Payload: Buffer.from(JSON.stringify(payload)),
      });

      await Ad.update(
        { url: file_url, status: "processing" },
        { where: { ad_id } },
      );
      await lambda.send(invokeCommand);
    } else {
      //  Get OLD file size BEFORE deleting
      if (ad.url) {
        const oldHead = new HeadObjectCommand({
          Bucket: bucketName,
          Key: ad.url,
        });

        const oldMeta = await s3.send(oldHead);
        oldFileSize = BigInt(oldMeta.ContentLength || 0);
      }

      // If an ad URL exists, delete the previous file from S3
      if (ad.url) {
        const deleteParams = {
          Bucket: bucketName,
          Key: ad.url, // Previous file path
        };

        const deleteCommand = new DeleteObjectCommand(deleteParams);
        await s3.send(deleteCommand);
      }

      if (ad_id) {
        await deleteFileFromS3Folder(ad_id);
      }

      //  Get NEW file size
      const newHead = new HeadObjectCommand({
        Bucket: bucketName,
        Key: file_url,
      });

      const newMeta = await s3.send(newHead);
      newFileSize = BigInt(newMeta.ContentLength || 0);

      //  Calculate updated storage
      const updatedUsed = currentUsed - oldFileSize + newFileSize;

      if (updatedUsed > storageLimit) {
        // Delete newly uploaded file to avoid orphan
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: file_url,
          }),
        );

        return res.status(400).json({
          message: "Storage limit exceeded",
        });
      }

      //  Update client storage
      client.used_storage_bytes =
        updatedUsed > 0n ? updatedUsed.toString() : "0";
      await client.save();

      // Update database with the new file URL
      await Ad.update(
        { url: file_url, status: "processing" },
        { where: { ad_id } },
      );

      // 2️⃣ Trigger the Lambda after successful upload
      // 2️⃣ Trigger the Lambda after successful upload
      // 2️⃣ Trigger the Lambda after successful upload
      const payload = {
        s3Key: file_url,
        ad_id: ad_id,
        timestamp: new Date().toISOString(),
      };

      const invokeCommand = new InvokeCommand({
        FunctionName: lambdaName,
        InvocationType: "Event", // async trigger (doesn’t wait for Lambda to complete)
        Payload: Buffer.from(JSON.stringify(payload)),
      });

      await lambda.send(invokeCommand);
    }

    return res.json({ message: "File uploaded and ad updated successfully." });
  } catch (error) {
    logger.logError("Error changing ad file", error, {
      ad_id: req.params.ad_id,
      userId: req.user?.user_id,
    });
    return res.status(500).json({ message: "Internal Server Error!" });
  } finally {
    // IMPORTANT: Delete the temporary file from disk
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
        logger.logDebug(`Successfully deleted temporary file`, {
          filePath: req.file.path,
        });
      } catch (unlinkError) {
        logger.logError("Error deleting temporary file", unlinkError, {
          filePath: req.file.path,
        });
      }
    }
  }
};

module.exports.changePlaceholder = async (req, res) => {
  let fileBuffer;
  try {
    const { role, client_id: clientId } = req.user;

    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded. Make sure you're sending the 'file' field.",
      });
    }

    let s3Key;

    if (role === "Admin") {
      s3Key = `placeholder.jpg`;
    } else if (role === "Client" && clientId) {
      s3Key = `${clientId}/placeholder.jpg`;
    } else {
      return res
        .status(403)
        .json({ message: "Unauthorized role or missing client_id" });
    }

    // Read the file from the temporary disk location
    fileBuffer = await fs.readFile(req.file.path);

    const uploadParams = {
      Bucket: bucketName,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: req.file.mimetype,
    };

    const uploadCommand = new PutObjectCommand(uploadParams);
    await s3.send(uploadCommand); // Using your configured S3 client instance

    const groups = await DeviceGroup.findAll({
      where: { client_id: clientId },
      attributes: ["group_id"],
    });
    const groupIds = groups.map((grp) => grp.group_id);

    // Using getBucketURL as you normally would
    const placeholderUrl = await this.getBucketURL(s3Key); // Or getBucketURL(s3Key) if it's an imported function

    await pushToGroupQueue(groupIds, placeholderUrl);

    res.json({ message: "Placeholder changed successfully" });
  } catch (error) {
    logger.logError("Error changing placeholder", error, {
      userId: req.user?.user_id,
    });
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    // IMPORTANT: Delete the temporary file from disk
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
        logger.logDebug(`Successfully deleted temporary file`, {
          filePath: req.file.path,
        });
      } catch (unlinkError) {
        logger.logError("Error deleting temporary file", unlinkError, {
          filePath: req.file.path,
        });
      }
    }
  }
};

module.exports.addAd = async (req, res) => {
  let fileBuffer;
  try {
    let { client_id, name, duration, file_url, isMultipartUpload } = req.body;

    logger.logDebug("Add ad request", {
      client_id,
      name,
      duration,
      isMultipartUpload,
      userId: req.user?.user_id,
    });

    // If client_id is missing and user is a Client, use their client_id
    if (!client_id && req.user.role === "Client") {
      client_id = req.user.client_id;
    }

    // General validation
    if (!client_id) {
      return res.status(400).json({ message: "client_id is required." });
    }

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ message: "Valid name is required." });
    }

    if (!duration || isNaN(duration) || Number(duration) <= 0) {
      return res
        .status(400)
        .json({ message: "Valid duration (positive number) is required." });
    }

    let ad;
    logger.logDebug("Processing ad upload", { isMultipartUpload });
    if (isMultipartUpload == "true" || isMultipartUpload == true) {
      logger.logDebug("Using multipart upload");
      ad = await Ad.create({
        client_id,
        name,
        url: file_url,
        duration,
        status: "processing",
      });
      // 2️⃣ Trigger the Lambda after successful upload
      const payload = {
        s3Key: file_url,
        ad_id: ad.ad_id,
        timestamp: new Date().toISOString(),
      };

      const invokeCommand = new InvokeCommand({
        FunctionName: lambdaName,
        InvocationType: "Event", // async trigger (doesn’t wait for Lambda to complete)
        Payload: Buffer.from(JSON.stringify(payload)),
      });

      await lambda.send(invokeCommand);
    } else {
      if (file_url == "") {
        return res.status(400).json({ message: "File is required." });
      }
      ad = await Ad.create({
        client_id,
        name,
        url: file_url,
        duration,
        status: "processing",
      });

      // 2️⃣ Trigger the Lambda after successful upload
      // 2️⃣ Trigger the Lambda after successful upload
      const payload = {
        s3Key: file_url,
        ad_id: ad.ad_id,
        timestamp: new Date().toISOString(),
      };

      const invokeCommand = new InvokeCommand({
        FunctionName: lambdaName,
        InvocationType: "Event", // async trigger (doesn’t wait for Lambda to complete)
        Payload: Buffer.from(JSON.stringify(payload)),
      });

      await lambda.send(invokeCommand);
    }

    logger.logInfo("Ad created successfully", {
      ad_id: ad.ad_id,
      client_id,
      name,
      userId: req.user?.user_id,
    });
    return res.status(200).json({ message: "Ad Created Successfully", ad });
  } catch (error) {
    logger.logError("Error creating ad", error, {
      client_id: req.body.client_id,
      name: req.body.name,
      userId: req.user?.user_id,
    });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  } finally {
    // IMPORTANT: Delete the temporary file from disk
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
        logger.logDebug(`Successfully deleted temporary file`, {
          filePath: req.file.path,
        });
      } catch (unlinkError) {
        logger.logError("Error deleting temporary file", unlinkError, {
          filePath: req.file.path,
        });
      }
    }
  }
};

module.exports.deleteAd = async (req, res) => {
  try {
    const { ad_id } = req.params;
    logger.logInfo("Delete ad request", { ad_id, userId: req.user?.user_id });

    const ad = await Ad.findOne({ where: { ad_id } });
    let fileSize = 0;
    if (ad.url) {
      const deleteParams = {
        Bucket: bucketName,
        Key: ad.url, // Previous file path
      };

      //   const deleteCommand = new DeleteObjectCommand(deleteParams);
      //   await s3.send(deleteCommand);

      const headCommand = new HeadObjectCommand({
        Bucket: bucketName,
        Key: ad.url,
      });

      const metadata = await s3.send(headCommand);
      fileSize = metadata.ContentLength || 0;
    }
    // 3 Reduce client storage
    if (fileSize > 0) {
      const client = await Client.findOne({
        where: { client_id: ad.client_id },
      });

      if (client) {
        const currentUsed = BigInt(client.used_storage_bytes);
        const newUsed = currentUsed - BigInt(fileSize);

        client.used_storage_bytes = newUsed > 0n ? newUsed.toString() : "0";

        await client.save();
      }
    }

    // await Ad.destroy({where:{ad_id}})
    await Ad.update(
      { isDeleted: true }, // Assuming you have an isDeleted field
      { where: { ad_id } },
    );

    logger.logInfo("Ad deleted successfully", {
      ad_id,
      userId: req.user?.user_id,
    });
    return res
      .status(200)
      .json({ message: `AdID: ${ad_id} Deleted Successfully ` });
  } catch (error) {
    logger.logError("Error deleting ad", error, {
      ad_id: req.params.ad_id,
      userId: req.user?.user_id,
    });
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

/**
 * Uploads a file to an S3 bucket.
 * @param {object} fileData - Object containing { Body: Buffer | Stream, Key: string, ContentType: string }.
 * @returns {Promise<string>} The S3 Key of the uploaded file.
 * @throws {Error} If the S3 upload fails.
 */
module.exports.uploadFileToS3 = async (fileData) => {
  const uploadParams = {
    Bucket: bucketName,
    Key: fileData.Key,
    Body: fileData.Body,
    ContentType: fileData.ContentType,
    // ACL: 'public-read' // Uncomment if you need public read access (use with caution)
  };

  try {
    const command = new PutObjectCommand(uploadParams);
    await s3.send(command);
    logger.logDebug("File uploaded to S3", { key: fileData.Key });
    return fileData.Key; // Return the key on success
  } catch (error) {
    logger.logError("S3 uploadFileToS3 error", error, { key: fileData.Key });
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

/**
 * Deletes a file from an S3 bucket.
 * @param {string} key - The S3 Key of the file to delete.
 * @returns {Promise<void>}
 * @throws {Error} If the S3 deletion fails.
 */
module.exports.deleteFileFromS3 = async (key) => {
  const deleteParams = {
    Bucket: bucketName,
    Key: key,
  };
  try {
    const command = new DeleteObjectCommand(deleteParams);
    await s3.send(command);
    logger.logDebug("File deleted from S3", { key });
  } catch (error) {
    logger.logError("S3 deleteFileFromS3 error", error, { key });
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
};

/**
 * Generates a pre-signed URL for a file in S3.
 * @param {string} fileName - The S3 Key of the file.
 * @param {number} expiresInSeconds - The expiration time of the URL in seconds.
 * @returns {Promise<string|null>} The pre-signed URL or null if file not found/error.
 */
module.exports.getSignedS3Url = async (fileName, expiresInSeconds) => {
  try {
    const headParams = {
      Bucket: bucketName,
      Key: fileName,
    };
    // Check if object exists (optional, but good for specific error handling)
    await s3.send(new HeadObjectCommand(headParams));

    const getCommand = new GetObjectCommand();
    const url = await getSignedUrl(s3, getCommand, {
      expiresIn: expiresInSeconds,
    });
    return url;
  } catch (error) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      logger.logWarn(`S3 file not found for signed URL`, { fileName });
    } else {
      logger.logError("S3 getSignedS3Url error", error, { fileName });
    }
    return null;
  }
};

/**
 * 1️⃣ Initialize Multipart Upload
 */
module.exports.createMultipartUpload = async (req, res) => {
  try {
    const { fileName, fileType, ad_id, isUpdate } = req.body;
    logger.logDebug("Creating multipart upload", {
      fileName,
      fileType,
      ad_id,
      isUpdate,
    });

    const command = new CreateMultipartUploadCommand({
      Bucket: bucketName,
      Key: fileName,
      ContentType: fileType,
    });
    const response = await s3.send(command);
    logger.logInfo("Multipart upload created", {
      fileName,
      uploadId: response.UploadId,
    });
    res.json({ uploadId: response.UploadId });
  } catch (error) {
    logger.logError("Error creating multipart upload", error, {
      fileName: req.body.fileName,
    });
    res.status(500).json({ error: error.message });
  }
};

/**
 * 2️⃣ Generate Pre-signed URLs for parts
 */
module.exports.generateUploadUrls = async (req, res) => {
  try {
    const { fileName, uploadId, partsCount } = req.body;
    logger.logDebug("Generating upload URLs", {
      fileName,
      uploadId,
      partsCount,
    });

    const urls = await Promise.all(
      Array.from({ length: partsCount }, async (_, i) => {
        const command = new UploadPartCommand({
          Bucket: bucketName,
          Key: fileName,
          UploadId: uploadId,
          PartNumber: i + 1,
        });
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        return { partNumber: i + 1, signedUrl };
      }),
    );

    res.json({ urls });
  } catch (error) {
    logger.logError("Error generating upload URLs", error, {
      fileName: req.body.fileName,
      uploadId: req.body.uploadId,
    });
    res.status(500).json({ error: error.message });
  }
};

/**
 * 3️⃣ Complete Multipart Upload
 */
module.exports.completeMultipartUpload = async (req, res) => {
  try {
    const { fileName, uploadId, parts } = req.body;
    logger.logDebug("Completing multipart upload", {
      fileName,
      uploadId,
      partsCount: parts?.length,
    });

    const command = new CompleteMultipartUploadCommand({
      Bucket: bucketName,
      Key: fileName,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });

    const response = await s3.send(command);
    logger.logInfo("Multipart upload completed", {
      fileName,
      location: response.Location,
    });
    res.json({ location: response.Location });
  } catch (error) {
    logger.logError("Error completing multipart upload", error, {
      fileName: req.body.fileName,
      uploadId: req.body.uploadId,
    });
    res.status(500).json({ error: error.message });
  }
};

module.exports.getSinglePartUpload = async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    logger.logDebug("Generating single part upload URL", {
      fileName,
      fileType,
    });

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      ContentType: fileType,
    });

    // Generate signed URL valid for 1 hour
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    res.json({ uploadUrl: signedUrl, key: fileName });
  } catch (error) {
    logger.logError("Error generating upload URL", error, {
      fileName: req.body.fileName,
    });
    res.status(500).json({ error: error.message });
  }
};
