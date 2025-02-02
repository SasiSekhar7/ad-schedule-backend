const path = require('path');
const fs = require('fs');
const { Ad } = require("../models");
const { where } = require('sequelize');

module.exports.addAd = async(req, res)=>{
    try {
        const {clientId, name, duration } = req.body;
        const url = (req.file.path).split('/')[2];
        const ad = await Ad.create({
            client_id: clientId,
            name,
            url,
            duration,
        })

        return res.status(200).json({message: "Ad Created Successfully ", ad_id: ad.ad_id})

    } catch (error) {
        console.log(error);
        return res.status(500).json({message: "Internal Server Error dsdsd", error: error.message})

    }
}
module.exports.sendAdDetails = async (req, res) =>{
    try {
        if(!req.params.id){
            res.status(400).json({message:"no poarameter ad_id found "})
        }
        const ad = await Ad.findOne({where:{ad_id:req.params.id}})
        res.json({data:ad})
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