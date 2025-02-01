const { Client, Ad } = require("../models");

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

module.exports.getAllClients = async(req, res) =>{
    try {   
        const clients = await Client.findAll({include: {model:Ad}});

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


