const { Client, Coupon, Campaign, SiteUser, CampaignInteraction } = require("../models");

module.exports.createClient = async (req, res) => {
  try {
    const { name, email, phoneNumber } = req.body;
    const client = await Client.create({
      name,
      email,
      phone_number: phoneNumber,
    });

    return res
      .status(200)
      .json({
        message: "Client Created Successfully ",
        client_id: client.client_id,
      });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports.createCampaign = async (req, res) => {
  try {
    const { name, description, coupons } = req.body;
    const { client_id } = req.params;

    const campaign = await Campaign.create({
      client_id,
      name,
      description,
      requires_phone: true,
      requires_questions: false,
    });

    if (Array.isArray(coupons) && coupons.length> 0) {
      await Promise.all(
        coupons.map(async (coupon) => 
          module.exports.addCoupon(coupon, campaign.campaign_id)
        )
      );
    }

    return res.status(200).json({
      message: "Campaign Created Successfully",
      campaign_id: campaign.campaign_id,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports.addCoupon = async (coupon, campaign_id) => {
  try {
    const { coupon_code, coupon_description, expiry_date, is_active } = coupon;

    await Coupon.create({
      campaign_id,
      coupon_code,
      description: coupon_description,
      expiry_date,
      is_active,
    });

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

module.exports.updateCampaignWithCoupons = async (req, res) => {
  try {
    const { campaign_id, name, description, requires_phone, requires_questions, coupons } = req.body;

    // Find the existing campaign
    const campaign = await Campaign.findByPk(campaign_id);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    // Update campaign attributes
    await campaign.update({ name, description, requires_phone, requires_questions });

    // Delete all existing coupons for this campaign
    await Coupon.destroy({ where: { campaign_id } });

    // Insert new coupons if provided
    if (Array.isArray(coupons) && coupons.length > 0) {
      const newCoupons = coupons.map(({ coupon_code, coupon_description, expiry_date, is_active }) => ({
        campaign_id,
        coupon_code,
        description: coupon_description,
        expiry_date,
        is_active,
      }));

      await Coupon.bulkCreate(newCoupons);
    }

    return res.status(200).json({ message: "Campaign and coupons updated successfully", campaign_id });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
module.exports.deleteCampaign = async (req, res) => {
  try {
    const { campaign_id } = req.params;

    // Find the campaign
    const campaign = await Campaign.findByPk(campaign_id);
    console.log(campaign, campaign_id)
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    // Delete all associated coupons first
    await Coupon.destroy({ where: { campaign_id } });

    // Delete the campaign
    await campaign.destroy();

    return res.status(200).json({ message: "Campaign and associated coupons deleted successfully" });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};


module.exports.allCampaigns = async (req,res) => {
  try {
    const campaigns = await Campaign.findAll({
      include: [
        {
          model: Coupon,
          as: "coupons",
          attributes: [
            "coupon_id",
            "coupon_code",
            ["description", "coupon_description"], // Renaming for expected output
            "expiry_date",
            "is_active",
          ],
        },
      ],
      attributes: [
        "campaign_id",
        "client_id",
        "name",
        "description",
        "requires_phone",
        "requires_questions",
      ],
    });
    return res
    .status(200)
    .json({
      message: "coupon added Successfully ",
      campaigns
    });
} catch (error) {
  console.log(error);
  return res
    .status(500)
    .json({ message: "Internal Server Error", error: error.message });
}
};

// Call the function (Example Usage)


module.exports.fetchCampaignInteractions = async (req, res) => {
  try {
    const interactions = await CampaignInteraction.findAll({
      attributes: ["interaction_id", "count", "created_at"],
      include: [
        {
          model: Campaign,
          attributes: ["campaign_id", "name", "description"],
        },
        {
          model: SiteUser,
          attributes: ["id", "phone_number"],
        },
      ],
      raw: true, // Flattens the result
      nest: false, // Ensures no nesting occurs
    });

    // Transform data into a fully flat structure
    const formattedInteractions = interactions.map((interaction) => ({
      interaction_id: interaction.interaction_id,
      count: interaction.count,
      created_at: interaction.created_at,
      campaign_id: interaction["Campaign.campaign_id"], // Flattened
      campaign_name: interaction["Campaign.name"], // Flattened
      campaign_description: interaction["Campaign.description"], // Flattened
      user_id: interaction["SiteUser.id"], // Flattened
      phone_number: interaction["SiteUser.phone_number"], // Flattened
    }));

    return res.status(200).json({ interactions: formattedInteractions });
  } catch (error) {
    console.error("Fetch Campaign Interactions Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};


module.exports.getCampaign = async (req, res) => {
  try {
    const { campaign_id } = req.params;
    console.log(campaign_id)
    const campaign = await Campaign.findOne({
      include: [
        {
          model: Coupon,
          as: "coupons",
          attributes: [
            "coupon_id",
            "coupon_code",
            ["description", "coupon_description"], // Renaming for expected output
            "expiry_date",
            "is_active",
          ],
        },
      ],
      attributes: [
        "campaign_id",
        "client_id",
        "name",
        "description",
        "requires_phone",
        "requires_questions",
      ],
      where:{
        campaign_id
      }
    });

    
    return res
      .status(200)
      .json({
        message: "coupon added Successfully ",
        campaign,
      });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
module.exports.getCampaignCode = async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const campaignData = await Campaign.findOne({
      where: { campaign_id },
      include: [
        {
          model: Coupon,
          as: "coupons", // Ensure this matches the model association
        },
        {
          model: Client,
          required: true,
        },
      ],
    });

    // Debugging output
    if (!campaignData) {
      return res.status(404).json({ message: "Campaign not found" });
    }


    // Ensure coupons exist before accessing properties
    const firstCoupon = campaignData.coupons?.length > 0 ? campaignData.coupons[0] : null;

    const campaign = {
      coupon_code: firstCoupon ? firstCoupon.coupon_code : null,
      coupon_description: firstCoupon ? firstCoupon.description : null,
      client_name: campaignData.Client.name,
      phoneRequired: campaignData.requires_phone,
    };

    return res.status(200).json({
      message: "Campaign retrieved successfully",
      campaign,
    });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
