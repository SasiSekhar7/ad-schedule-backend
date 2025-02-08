const { DataTypes, HasOne } = require("sequelize");
const sequelize = require("../db");

const Client = sequelize.define("Client", {
  client_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true, // Name is optional
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true, // Email is optional but recommended
    validate: {
      isEmail: true, // Ensures email format is valid
    },
  },
  phone_number: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true,
    validate: {
      isNumeric: true, // Ensures only numbers are stored
    },
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

const Ad = sequelize.define("Ad", {
  ad_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  client_id: {
    type: DataTypes.UUIDV4,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false, // Name is optional
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

const Device = sequelize.define("Device", {
  device_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  location: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  last_synced: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

const DeviceGroup = sequelize.define("DeviceGroup", {
  group_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false, // Name is optional
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

const Schedule = sequelize.define("Schedule", {
  schedule_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  ad_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  device_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  start_time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  end_time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  total_duration: {
    type: DataTypes.INTEGER,
    allowNull: null,
  },
  priority: {
    type: DataTypes.INTEGER, // Higher number = higher priority
    allowNull: false,
    defaultValue: 1,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

const AdPlayback = sequelize.define("AdPlayback", {
  schedule_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  ad_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  device_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  played_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW, // Timestamp when the ad actually played
  },
  duration_played: {
    type: DataTypes.INTEGER, // In seconds, how long the ad was actually played
    allowNull: false,
  },
  sync_time: {
    type: DataTypes.DATE, // When this playback was reported by the device
    defaultValue: DataTypes.NOW,
  },
});

const User = sequelize.define("User", {
  user_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  client_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  phone_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role:{
    type:DataTypes.STRING,
    allowNull:false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});
// A Client can have many Ads
Client.hasMany(Ad, { foreignKey: "client_id" });
Ad.belongsTo(Client, { foreignKey: "client_id" });

// An Ad can be scheduled on multiple Devices
Ad.hasMany(Schedule, { foreignKey: "ad_id" });
Schedule.belongsTo(Ad, { foreignKey: "ad_id" });

// A Device can have multiple scheduled Ads
Device.hasMany(Schedule, { foreignKey: "device_id" });
Schedule.belongsTo(Device, { foreignKey: "device_id" });

Device.belongsTo(DeviceGroup, { foreignKey: "group_id" });
DeviceGroup.hasMany(Device, { foreignKey: "group_id" });

Schedule.hasOne(AdPlayback, { foreignKey: "schedule_id" });

User.belongsTo(Client, {foreignKey: 'client_id'})
Client.hasMany(User, {foreignKey: 'client_id'})

module.exports = {
  sequelize,
  Client,
  Ad,
  Device,
  Schedule,
  AdPlayback,
  DeviceGroup,
  User
};
