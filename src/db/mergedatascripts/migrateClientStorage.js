require("dotenv").config();
// const { Sequelize } = require("sequelize");
const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");

// const { sequelize } = require("../../models");
const { Client, Tier, Ad } = require("../../models");
const { getSubscriptionExpiry } = require("../../utils/subscriptionHelper");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const bucketName = process.env.AWS_BUCKET_NAME;

async function migrateClientStorage() {
  try {
    console.log(" Starting Client Storage Migration...\n");

    //  Get Basic Tier
    const basicTier = await Tier.findOne({
      where: { name: "Basic" },
    });

    if (!basicTier) {
      throw new Error(" Basic tier not found. Please create it first.");
    }

    console.log(" Basic Tier Found:", basicTier.name);

    // 2 Get clients without tier
    const clients = await Client.findAll({
      where: {
        tier_id: null,
      },
    });

    console.log(`Found ${clients.length} clients to migrate\n`);

    for (const client of clients) {
      console.log(` Processing Client: ${client.client_id}`);

      const ads = await Ad.findAll({
        where: {
          client_id: client.client_id,
          isDeleted: false,
        },
      });

      let totalSize = BigInt(0);

      for (const ad of ads) {
        try {
          const fileKey = ad.url; // Make sure this is S3 key

          const metadata = await s3.send(
            new HeadObjectCommand({
              Bucket: bucketName,
              Key: fileKey,
            }),
          );

          const fileSize = BigInt(metadata.ContentLength);
          totalSize += fileSize;

          console.log(` Ad ${ad.ad_id} → ${fileSize} bytes`);
        } catch (err) {
          console.log(
            `    Could not fetch size for Ad ${ad.ad_id}: ${err.message}`,
          );
        }
      }

      // Update Client
      client.tier_id = basicTier.tier_id;
      client.used_storage_bytes = totalSize.toString();
      client.subscription_status = "active";

      // Start subscription from today (1 year)
      client.subscription_expiry = getSubscriptionExpiry();

      await client.save();

      console.log(`Updated Client → Used Storage: ${totalSize} bytes\n`);
    }

    console.log(" Migration Completed Successfully!");
    process.exit(0);
  } catch (error) {
    console.error(" Migration Failed:", error);
    process.exit(1);
  }
}

migrateClientStorage();
