const { fn, col } = require("sequelize");
const { Client, Ad, Schedule, Device, DeviceGroup } = require("../models");

module.exports.createClient = async(req, res) =>{
    try {
        const {name, email, phoneNumber} = req.body;
        const client = await Client.create({
            name,
            email,
            phone_number: phoneNumber
        })

        return res.status(200).json({message: "Client Created Successfully ", client_id: client.client_id})
    } catch (error) {
        console.log(error);
        return res.status(500).json({message: "Internal Server Error", error: error.message})
    }
}
module.exports.getAllAds = async(req, res) =>{
    try {   
        const ads = await Ad.findAll({
            include: { model: Client, attributes: ["name"] },
            raw: true,
            nest: true,
          });
          
          // Flatten the Client name field
          const flattenedAds = ads.map((ad) => ({
            ...ad,
            client_name: ad.Client?.name || null, // Extracts 'name' from 'Client' and puts it in 'client_name'
          }));
          
        //   console.log(flattenedAds);
        return res.status(200).json({ads:flattenedAds})
    } catch (error) {
        console.log(error);
        return res.status(500).json({message: "Internal Server Error", error: error.message})
    }
}
module.exports.getAllClients = async(req, res) =>{
    try {   
        const clients = await Client.findAll({
            include: [
              {
                model: Ad,
                attributes: [], // Do not fetch Ad records, only count them
              },
            ],
            attributes: {
              include: [
                [fn("COUNT", col("Ads.ad_id")), "adsCount"],
              ],
            },
            group: ["Client.client_id"], // Group by client to get correct counts
          });
          

        return res.status(200).json({clients})
    } catch (error) {
        console.log(error);
        return res.status(500).json({message: "Internal Server Error", error: error.message})
    }
}

module.exports.updateClient = async(req, res) =>{
    try {
        if(!req.params || !req.body){
            return res.status(400).json({ error: "Missing required parameters" });
        }

        const client = await Client.update(req.body, {where:{client_id: req.params.id}});

        return res.status(200).json({message: "Client Updated Successfully ", client_id: client.client_id})
    } catch (error) {
        console.log(error);
        return res.status(500).json({message: "Internal Server Error", error: error.message})
    }
}

module.exports.deleteClient = async(req, res) =>{
    try {
        if(!req.params){
            return res.status(400).json({ error: "Missing required parameters" });
        }
        const client = await Client.destroy({
            where:{
                client_id: req.params.id
            }
        })

        return res.status(200).json({message: "Client Deleted Successfully ", client_id: client.client_id})
    } catch (error) {
        console.log(error);
        return res.status(500).json({message: "Internal Server Error", error: error.message})
    }
}


module.exports.getAllDetails = async(req, res) =>{
    try {
        const devicesCount = await Device.count();
        const deviceGroupsCount = await DeviceGroup.count();
        const adsCount = await Ad.count();
        const clientsCount = await Client.count();
        const schedulesCount = await Schedule.count();
        
        const response = {
          devices: devicesCount,
          deviceGroups: deviceGroupsCount,
          ads: adsCount,
          clients: clientsCount,
          schedules: schedulesCount,
        };
        
        console.log(response);
        
        return res.status(200).json({message: "Client Deleted Successfully ", data: response})
    } catch (error) {
        console.log(error);
        return res.status(500).json({message: "Internal Server Error", error: error.message})
    }
}