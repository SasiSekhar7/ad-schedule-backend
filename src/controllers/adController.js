const path = require("path");
const fs = require("fs");
const { Ad } = require("../models");
const { where } = require("sequelize");
const { getBucketURL } = require("./s3Controller");
//dd

const ad_Egress_lambda_url = process.env.AD_EGRESS_LAMBDA_URL;
const use_ad_egress_lambda = process.env.USE_AD_EGRESS_LAMBDA;

module.exports.sendAdDetails = async (req, res) => {
  try {
    if (!req.params.id) {
      res.status(400).json({ message: "no poarameter ad_id found " });
    }
    const ad = await Ad.findOne({ where: { ad_id: req.params.id } });
    // const url  = await getBucketURL(ad.url)
    let url;
    if (use_ad_egress_lambda == "true" || use_ad_egress_lambda == true) {
      url =
        ad_Egress_lambda_url + "/" + ad.ad_id + "." + ad.url.split(".").pop();
    } else {
      url = await getBucketURL(ad.url);
    }

    const data = {
      ...ad.dataValues,
      url,
    };
    res.json({ data });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: "Internal Server Error dsdsd", error: error.message });
  }
};
module.exports.sendAdFile = async (req, res) => {
  try {
    const filePath = path.join(__dirname, "..", "uploads/ads", req.params.path);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "Video not found!" });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: "Internal Server Error dsdsd", error: error.message });
  }
};
