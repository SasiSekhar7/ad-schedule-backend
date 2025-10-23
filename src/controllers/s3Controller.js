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
      console.log(`No files found for ad_id: ${ad_id}`);
      return;
    }

    const deleteParams = {
      Bucket: bucketName,
      Delete: {
        Objects: listedObjects.Contents.map((obj) => ({ Key: obj.Key })),
      },
    };

    console.log("Listed Objects:", listedObjects);

    const result = await s3.send(new DeleteObjectsCommand(deleteParams));
    console.log(`Deleted ${result.Deleted.length} files for ad_id: ${ad_id}`);

    // Handle pagination if more than 1000 objects
    if (listedObjects.IsTruncated) {
      await deleteFileFromS3Folder(ad_id);
    }
  } catch (error) {
    console.error("Error deleting files from S3:", error);
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
    const url = await getSignedUrl(s3, getCommand, { expiresIn: 86400 });
    return url;
  } catch (error) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      console.warn(`S3 file not found: ${fileName}`);
    } else {
      console.error("S3 getBucketURL error:", error.message);
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
    const { file_url, isMultipartUpload } = req.body;

    console.log("isMultipartUpload", isMultipartUpload);
    if (isMultipartUpload == true || isMultipartUpload == "true") {
      if (!file_url) {
        return res.status(400).json({ message: "New file is required." });
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
        { where: { ad_id } }
      );
      await lambda.send(invokeCommand);
    } else {
      if (!req.file) {
        return res.status(400).json({ message: "New file is required." });
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

      // Read the new file from the temporary disk location
      fileBuffer = await fs.readFile(req.file.path);

      // Upload the new file to S3
      const newKey = `ad-${Date.now()}${path.extname(req.file.originalname)}`;
      const uploadParams = {
        Bucket: bucketName,
        Key: newKey,
        Body: fileBuffer, // Use the buffer read from disk
        ContentType: req.file.mimetype,
      };

      const uploadCommand = new PutObjectCommand(uploadParams);
      await s3.send(uploadCommand); // Assuming s3Client is your configured S3 client

      if (ad_id) {
        await deleteFileFromS3Folder(ad_id);
      }

      // Update database with the new file URL
      await Ad.update(
        { url: newKey, status: "processing" },
        { where: { ad_id } }
      );

      // 2️⃣ Trigger the Lambda after successful upload
      // 2️⃣ Trigger the Lambda after successful upload
      // 2️⃣ Trigger the Lambda after successful upload
      const payload = {
        s3Key: newKey,
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
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error!" });
  } finally {
    // IMPORTANT: Delete the temporary file from disk
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
        console.log(`Successfully deleted temporary file: ${req.file.path}`);
      } catch (unlinkError) {
        console.error(
          `Error deleting temporary file ${req.file.path}:`,
          unlinkError
        );
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
    console.error("Error changing placeholder:", error.message, error.stack);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    // IMPORTANT: Delete the temporary file from disk
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
        console.log(`Successfully deleted temporary file: ${req.file.path}`);
      } catch (unlinkError) {
        console.error(
          `Error deleting temporary file ${req.file.path}:`,
          unlinkError
        );
      }
    }
  }
};

module.exports.addAd = async (req, res) => {
  let fileBuffer;
  try {
    let { client_id, name, duration, file_url, isMultipartUpload } = req.body;

    console.log("req.body", req.body);

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
    console.log("isMultipartUpload", isMultipartUpload);
    if (isMultipartUpload == "true" || isMultipartUpload == true) {
      console.log("multipart upload");
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
      console.log("req.file", req.file);
      if (!req.file) {
        return res.status(400).json({ message: "File is required." });
      }

      // Read the file from the temporary disk location
      fileBuffer = await fs.readFile(req.file.path);

      const newKey = `ad-${Date.now()}${path.extname(req.file.originalname)}`;
      const uploadParams = {
        Bucket: bucketName,
        Key: newKey,
        Body: fileBuffer, // Use the buffer read from disk
        ContentType: req.file.mimetype,
      };

      const uploadCommand = new PutObjectCommand(uploadParams);
      await s3.send(uploadCommand); // Assuming s3Client is your configured S3 client

      ad = await Ad.create({
        client_id,
        name,
        url: newKey,
        duration,
        status: "processing",
      });

      // 2️⃣ Trigger the Lambda after successful upload
      // 2️⃣ Trigger the Lambda after successful upload
      const payload = {
        s3Key: newKey,
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

    return res.status(200).json({ message: "Ad Created Successfully", ad });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  } finally {
    // IMPORTANT: Delete the temporary file from disk
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
        console.log(`Successfully deleted temporary file: ${req.file.path}`);
      } catch (unlinkError) {
        console.error(
          `Error deleting temporary file ${req.file.path}:`,
          unlinkError
        );
      }
    }
  }
};

module.exports.deleteAd = async (req, res) => {
  try {
    const { ad_id } = req.params;
    console.log("delete command hit ");
    const ad = await Ad.findOne({ where: { ad_id } });
    if (ad.url) {
      const deleteParams = {
        Bucket: bucketName,
        Key: ad.url, // Previous file path
      };

      //   const deleteCommand = new DeleteObjectCommand(deleteParams);
      //   await s3.send(deleteCommand);
    }

    // await Ad.destroy({where:{ad_id}})
    await Ad.update(
      { isDeleted: true }, // Assuming you have an isDeleted field
      { where: { ad_id } }
    );

    return res
      .status(200)
      .json({ message: `AdID: ${ad_id} Deleted Successfully ` });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: "Internal Server Error dsdsd", error: error.message });
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
    return fileData.Key; // Return the key on success
  } catch (error) {
    console.error("S3 uploadFileToS3 error:", error);
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
  } catch (error) {
    console.error("S3 deleteFileFromS3 error:", error);
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

    const getCommand = new GetObjectCommand(headParams);
    const url = await getSignedUrl(s3, getCommand, {
      expiresIn: expiresInSeconds,
    });
    return url;
  } catch (error) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      console.warn(`S3 file not found for signed URL: ${fileName}`);
    } else {
      console.error("S3 getSignedS3Url error:", error);
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
    const command = new CreateMultipartUploadCommand({
      Bucket: bucketName,
      Key: fileName,
      ContentType: fileType,
    });
    const response = await s3.send(command);
    res.json({ uploadId: response.UploadId });
  } catch (error) {
    console.error("Error creating multipart upload:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 2️⃣ Generate Pre-signed URLs for parts
 */
module.exports.generateUploadUrls = async (req, res) => {
  try {
    const { fileName, uploadId, partsCount } = req.body;

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
      })
    );

    res.json({ urls });
  } catch (error) {
    console.error("Error generating upload URLs:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 3️⃣ Complete Multipart Upload
 */
module.exports.completeMultipartUpload = async (req, res) => {
  try {
    const { fileName, uploadId, parts } = req.body;

    const command = new CompleteMultipartUploadCommand({
      Bucket: bucketName,
      Key: fileName,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });

    const response = await s3.send(command);
    res.json({ location: response.Location });
  } catch (error) {
    console.error("Error completing multipart upload:", error);
    res.status(500).json({ error: error.message });
  }
};
