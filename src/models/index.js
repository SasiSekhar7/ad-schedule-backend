const { DataTypes } = require("sequelize");
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
    allowNull: true, // Email is optional but recommended
    validate: {
      isEmail: true, // Ensures email format is valid
    },
  },
  phone_number: {
    type: DataTypes.STRING,
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
  android_id: {
    type: DataTypes.STRING,
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
  client_id: {
    type: DataTypes.UUIDV4,
    allowNull: false,
  },
  reg_code: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false, // Name is optional
  },
  last_pushed: {
    type: DataTypes.DATE,
    allowNull:true,
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

const ScrollText = sequelize.define("ScrollText", {
  scrolltext_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "DeviceGroups", // Reference to DeviceGroup table
      key: "group_id",
    },
    onDelete: "CASCADE",
  },
  message: {
    type: DataTypes.TEXT, // Supports longer UTF-8 text
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
  group_id: {
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
  role: {
    type: DataTypes.STRING,
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

const SiteUser = sequelize.define("SiteUser", {
  id: {
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
    allowNull: false, // Phone number is required for OTP
    validate: {
      isNumeric: true, // Ensures only numbers are stored
    },
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false, // User is not verified by default
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true, // Optional, updated on successful logins
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true, // Optional: Can be used for additional security tracking
  },
  user_agent: {
    type: DataTypes.STRING,
    allowNull: true, // Optional: Helps track login patterns
  },
});

const Campaign = sequelize.define("Campaign", {
  campaign_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  client_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Client,
      key: "client_id",
    },
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  requires_phone: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  requires_questions: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
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

const Coupon = sequelize.define("Coupon", {
  coupon_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  campaign_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Campaign,
      key: "campaign_id",
    },
  },
  coupon_code: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  expiry_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
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

const CampaignInteraction = sequelize.define("CampaignInteraction", {
  interaction_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  campaign_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Campaign,
      key: "campaign_id",
    },
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: SiteUser,
      key: "id",
    },
  },
  count: {
    type: DataTypes.INTEGER, // Changed from DataTypes.NUMBER to DataTypes.INTEGER
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

const SelectedSeries = sequelize.define("SelectedSeries", {
  series_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  series_name:{
    type: DataTypes.STRING,
    allowNull: false
  },
  match_list:{
    type: DataTypes.STRING,
    allowNull: true
  },
  live_match_id:{
    type: DataTypes.UUID,
    allowNull: true
  }
});

// Define Associations
Client.hasMany(Campaign, { foreignKey: "client_id" });
Campaign.belongsTo(Client, { foreignKey: "client_id" });

// Correct association: use 'user_id' as the foreign key, not 'id'
SiteUser.hasMany(CampaignInteraction, { foreignKey: "user_id" });
CampaignInteraction.belongsTo(SiteUser, { foreignKey: "user_id" });

Campaign.hasMany(CampaignInteraction, { foreignKey: "campaign_id" });
CampaignInteraction.belongsTo(Campaign, { foreignKey: "campaign_id" });

// A Campaign has one Coupon (adjust to hasMany if needed)
Campaign.hasMany(Coupon, { foreignKey: "campaign_id" ,as: "coupons" });
Coupon.belongsTo(Campaign, { foreignKey: "campaign_id" });

// A Client can have many Ads
Client.hasMany(Ad, { foreignKey: "client_id" });
Ad.belongsTo(Client, { foreignKey: "client_id" });

Client.hasMany(DeviceGroup, { foreignKey: "client_id" });
DeviceGroup.belongsTo(Client, { foreignKey: "client_id" });

// An Ad can be scheduled on multiple Devices
Ad.hasMany(Schedule, { foreignKey: "ad_id" });
Schedule.belongsTo(Ad, { foreignKey: "ad_id" });

// A Device can have multiple scheduled Ads
DeviceGroup.hasMany(Schedule, { foreignKey: "group_id" });
Schedule.belongsTo(DeviceGroup, { foreignKey: "group_id" });

Device.belongsTo(DeviceGroup, { foreignKey: "group_id" });
DeviceGroup.hasMany(Device, { foreignKey: "group_id" });

DeviceGroup.hasOne(ScrollText, {
  foreignKey: "group_id",
  onDelete: "CASCADE",
});

ScrollText.belongsTo(DeviceGroup, {
  foreignKey: "group_id",
});

Schedule.hasOne(AdPlayback, { foreignKey: "schedule_id" });

User.belongsTo(Client, { foreignKey: "client_id" });
Client.hasMany(User, { foreignKey: "client_id" });

module.exports = {
  sequelize,
  Client,
  Ad,
  Device,
  ScrollText,
  Schedule,
  AdPlayback,
  DeviceGroup,
  User,
  SiteUser,
  Campaign,
  Coupon,
  CampaignInteraction,
  SelectedSeries
};
