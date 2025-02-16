const api = require("../api");
const { getCustomUTCDateTime } = require("../helpers");
const { SiteUser, CampaignInteraction } = require("../models");
const customerId = process.env.CUST_ID;

module.exports.sendOtp = async (req, res) => {
  try {
    const { phoneNumber, ipAddress, userAgent, campaign_id } = req.body;
    console.log(req.body);

    //api
    const response = await api.post(
      `/send?countryCode=91&customerId=${customerId}&flowType=SMS&mobileNumber=${phoneNumber}`
    );
    // const response = await api.get(`/`);
    // console.log(response);

    if (response.responseCode === 200) {
      const { verificationId } = response.data;

      // Find or create the user record based on the phone number.
      let user = await SiteUser.findOne({ where: { phone_number: phoneNumber } });
      if (user) {
        await SiteUser.update(
          {
            is_verified: false,
            updated_at: getCustomUTCDateTime(),
            ip_address: ipAddress,
            user_agent: userAgent,
          },
          {
            where: { phone_number: phoneNumber },
          }
        );
      } else {
        user = await SiteUser.create({
          phone_number: phoneNumber,
          is_verified: false,
          created_at: getCustomUTCDateTime(),
          ip_address: ipAddress,
          user_agent: userAgent,
        });
      }

      // Await the helper function to ensure errors are caught.
      await addOrUpdateInteraction(user.id, campaign_id);

      return res
        .status(200)
        .json({ message: "OTP sent successfully", verId: verificationId });
    } else {
      return res.status(400).json({ message: "Error Sending OTP" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error!", error });
  }
};

/**
 * Helper function to add or update campaign interaction.
 * This function is defined outside the main try block for clarity.
 */
async function addOrUpdateInteraction(user_id, campaign_id) {
  try {
    console.log(user_id, campaign_id)
    const campaignInteraction = await CampaignInteraction.findOne({
      where: { user_id, campaign_id },
    });
    if (campaignInteraction) {
      // Using atomic increment to avoid race conditions:
      await campaignInteraction.increment("count", { by: 1 });
      await campaignInteraction.update({ updated_at: getCustomUTCDateTime() });
    } else {
      await CampaignInteraction.create({
        user_id,
        campaign_id,
        count: 1,
        created_at: getCustomUTCDateTime(),
      });
    }
  } catch (err) {
    console.error("Error in addOrUpdateInteraction:", err);
    throw err; // Rethrow so that the parent try/catch can handle it.
  }
}

module.exports.verifyOtp = async (req, res) => {
  try {
    const { otp, verificationId, phoneNumber } = req.body;
    //api
    const response = await api.get(
      `/validateOtp?countryCode=91&mobileNumber=${phoneNumber}&verificationId=${verificationId}&customerId=${customerId}&code=${otp}`
    );
    // const response = await api.get('/')
    // console.log(response)
    if (response.responseCode === 200) {
      await SiteUser.update(
        {
          is_verified: true,
          updated_at: getCustomUTCDateTime(),
          last_login: getCustomUTCDateTime(),
        },
        {
          where: {
            phone_number: phoneNumber,
          },
        }
      );
      return res.status(200).json({ message: "OTP Verified succesfully" });
    } else {
      await SiteUser.update(
        {
          is_verified: false,
          updated_at: getCustomUTCDateTime(),
        },
        {
          where: {
            phone_number: phoneNumber,
          },
        }
      );
      return res.status(400).json({ message: "OTP Verification failed" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal server error!", error });
  }
};
