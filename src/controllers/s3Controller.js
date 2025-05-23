const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand ,HeadObjectCommand} = require("@aws-sdk/client-s3");
const path = require('path');
const { Ad, DeviceGroup } = require("../models");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { pushToGroupQueue } = require("./queueController");


const region = process.env.AWS_BUCKET_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET_KEY;
const bucketName = process.env.AWS_BUCKET_NAME;

const s3 = new S3Client({
    region,
    credentials:{
        accessKeyId,
        secretAccessKey,
    }
    
 })


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
    try {
        const { ad_id } = req.params;
        const ad = await Ad.findOne({ where: { ad_id } });

        if (!ad) {
            return res.status(404).json({ message: "Ad not found" });
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

        // Upload the new file to S3
        const newKey = `ad-${Date.now()}${path.extname(req.file.originalname)}`;
        const uploadParams = {
            Bucket: bucketName,
            Key: newKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        const uploadCommand = new PutObjectCommand(uploadParams);
        await s3.send(uploadCommand);

        // Update database with the new file URL
        await Ad.update(
            { url: newKey },
            { where: { ad_id } }
        );

        return res.json({ message: "Video uploaded successfully." });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal Server Error!" });
    }
};



module.exports.changePlaceholder = async (req, res) => {
    try {
        const { role, client_id: clientId } = req.user;

        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        let s3Key;

        if (role === 'Admin') {
            s3Key = `placeholder.jpg`;
        }
        else if (role === 'Client' && clientId) {
            s3Key = `${clientId}/placeholder.jpg`;
        }
        else {
            return res.status(403).json({ message: "Unauthorized role or missing client_id" });
        }


        const uploadParams = {
            Bucket: bucketName,
            Key: s3Key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        const uploadCommand = new PutObjectCommand(uploadParams);
        await s3.send(uploadCommand);


        if (role === 'Client') {
            const groups = await DeviceGroup.findAll({ where: { client_id: clientId }, attributes: ['group_id'] });
            const groupIds = groups.map(grp => grp.group_id);

            const placeholderUrl = await this.getBucketURL(s3Key);
            await pushToGroupQueue(groupIds, placeholderUrl);
        }

        res.json({ message: "Placeholder changed successfully" });
    } catch (error) {
        console.error("Error changing placeholder:", error.message, error.stack);
        res.status(500).json({ message: "Internal Server Error" });
    }
};




module.exports.addAd = async (req, res) => {
    try {
        let { client_id, name, duration } = req.body;

        // If client_id is missing and user is a Client, use their client_id
        if (!client_id && req.user.role === 'Client') {
            client_id = req.user.client_id;
        }

        // General validation
        if (!client_id) {
            return res.status(400).json({ message: "client_id is required." });
        }

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ message: "Valid name is required." });
        }

        if (!duration || isNaN(duration) || Number(duration) <= 0) {
            return res.status(400).json({ message: "Valid duration (positive number) is required." });
        }

        if (!req.file) {
            return res.status(400).json({ message: "File is required." });
        }

        const newKey = `ad-${Date.now()}${path.extname(req.file.originalname)}`;
        const uploadParams = {
            Bucket: bucketName,
            Key: newKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        const uploadCommand = new PutObjectCommand(uploadParams);
        await s3.send(uploadCommand);

        const ad = await Ad.create({
            client_id,
            name,
            url: newKey,
            duration,
        });

        return res.status(200).json({ message: "Ad Created Successfully", ad });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};

module.exports.deleteAd = async(req, res)=>{
    try {
        const {ad_id} = req.params;
        console.log('delete command hit ')
        const ad = await Ad.findOne({where:{ad_id}});
        if (ad.url) {

            const deleteParams = {
                Bucket: bucketName,
                Key: ad.url, // Previous file path
            };

            const deleteCommand = new DeleteObjectCommand(deleteParams);
            await s3.send(deleteCommand);
        }

        await Ad.destroy({where:{ad_id}})

        return res.status(200).json({message: `AdID: ${ad_id} Deleted Successfully `})

    } catch (error) {
        console.log(error);
        return res.status(500).json({message: "Internal Server Error dsdsd", error: error.message})

    }
}

