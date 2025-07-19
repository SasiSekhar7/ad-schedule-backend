require("dotenv").config();
const { Client, DeviceGroup } = require("../models");
// const sequelize = require("./index");
require("dotenv").config(); // Load environment variables from .env

/**
 * Creates a new DeviceGroup with a dummy client.
 * If no clients exist, a new "Dummy Client" is created.
 * @param {string} groupName - The name for the new device group.
 * @returns {Promise<DeviceGroup>} The created device group.
 */
async function createGroupWithDummyClient(groupName) {
  try {
    // await sequelize.authenticate();
    console.log("Connection has been established successfully.");
    let client = await Client.findOne({
      where: {
        email: process.env.DUMMY_CLIENT_EMAIL || "dummyclient@gmail.com",
      },
      attributes: ["client_id", "name", "email", "phone_number"],
    });

    if (!client) {
      console.log("No client found, creating a dummy client.");
      client = await Client.create({
        name: process.env.DUMMY_CLIENT_NAME || "Dummy Client",
        email: process.env.DUMMY_CLIENT_EMAIL || "dummyclient@gmail.com",
        phone_number: process.env.DUMMY_CLIENT_PHONE || "9999999999",
      });
      console.log(`Created dummy client with ID: ${client.client_id}`);
    } else {
      console.log(`Using existing client with ID: ${client.client_id}`);
    }

    const regCode = `DUMMY-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;

    const groupExists = await DeviceGroup.findOne({
      where: {
        client_id: client.client_id,
        name: process.env.DUMMY_GROUP_NAME || groupName || "Initial Group",
      },
    });

    if (groupExists) {
      console.log(
        `Group with name "${groupExists.name}" already exists for client ID: ${client.client_id}`
      );
      return groupExists;
    }

    const group = await DeviceGroup.create({
      client_id: client.client_id,
      name: process.env.DUMMY_GROUP_NAME || groupName || "Initial Group",
      reg_code: regCode,
    });

    console.log(
      `Successfully created group "${group.name}" with ID: ${group.group_id} and registration code ${regCode}`
    );
    return group;
  } catch (error) {
    console.error("Error creating group with dummy client:", error);
    throw error;
  } finally {
    // await sequelize.close();
  }
}

module.exports = { createGroupWithDummyClient };

if (require.main === module) {
  const groupName = process.argv[2];
  createGroupWithDummyClient(groupName);
}
