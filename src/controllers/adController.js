const path = require('path');
const fs = require('fs');
const { Ad } = require("../models");
const { where } = require('sequelize');
const { getBucketURL } = require('./s3Controller');
//dd



module.exports.sendAdDetails = async (req, res) =>{
    try {
        if(!req.params.id){
            res.status(400).json({message:"no poarameter ad_id found "})
        }
        const ad = await Ad.findOne({where:{ad_id:req.params.id}})
        const url  = await getBucketURL(ad.url)
        const data = {
            ...ad.dataValues,
            url,
        }
        res.json({data})
    } catch (error) {
        console.log(error);
        return res.status(500).json({message: "Internal Server Error dsdsd", error: error.message})

    }
}
module.exports.sendAdFile = async (req, res) =>{
    try {
        const filePath = path.join(__dirname, '..', 'uploads/ads', req.params.path);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        }else{
            res.status(404).json({ error: 'Video not found!' });

        }

    } catch (error) {
        console.log(error);
        return res.status(500).json({message: "Internal Server Error dsdsd", error: error.message})

    }
}