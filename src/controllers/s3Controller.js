const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
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
         
             const getParams = {
                 Bucket: bucketName,
                 Key: fileName
             }

 
             const getCommand = new GetObjectCommand(getParams);
             const url  = await getSignedUrl(s3, getCommand, {expiresIn:600});
             return url;
 
     } catch (error) {
         console.error(error);
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
         const uploadParams = {
                    Bucket: bucketName,
                    Key: 'placeholder.jpg',
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
                };
        
                const uploadCommand = new PutObjectCommand(uploadParams);
                await s3.send(uploadCommand);

                const groups = await DeviceGroup.findAll({attributes:['group_id']})

                const groupIds = groups.map(grp=>grp.group_id);
                const placeholder = await this.getBucketURL('placeholder.jpg');
                await pushToGroupQueue(groupIds, placeholder );
                
        res.json({message: "Placeholder Changed successfully"});
    } catch (error) {
        console.error("Error changing placeholder:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
module.exports.addAd = async(req, res)=>{
    try {
        const {client_id, name, duration } = req.body;
       
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
            url:newKey,
            duration,
        })

        return res.status(200).json({message: "Ad Created Successfully ", ad})

    } catch (error) {
        console.log(error);
        return res.status(500).json({message: "Internal Server Error dsdsd", error: error.message})

    }
}

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

