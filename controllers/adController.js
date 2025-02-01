const path = require('path');
const fs = require('fs');
const { Ad } = require("../models");

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