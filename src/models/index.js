const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const defaultTimestamps = {
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
};
const Client = sequelize.define(
  "Client",
  {
    client_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: DataTypes.STRING,
    email: {
      type: DataTypes.STRING,
      validate: { isEmail: true },
    },
    phone_number: {
      type: DataTypes.STRING,
      validate: { isNumeric: true },
    },
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const Ad = sequelize.define(
  "Ad",
  {
    ad_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    client_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    url: { type: DataTypes.STRING, allowNull: false },
    duration: { type: DataTypes.INTEGER, allowNull: false },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const Device = sequelize.define(
  "Device",
  {
    device_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    device_type: {
      type: DataTypes.ENUM("mobile", "laptop", "tv", "tablet", "desktop"),
      allowNull: false,
      defaultValue: "tv",
    },

    device_model: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    device_os_version: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // ENUM for orientation
    device_orientation: {
      type: DataTypes.ENUM("portrait", "landscape", "auto"),
      allowNull: false,
      defaultValue: "auto",
    },

    device_resolution: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // ENUM for OS
    device_os: {
      type: DataTypes.ENUM(
        "tizen",
        "android",
        "webos",
        "ios",
        "windows",
        "linux"
      ),
      allowNull: true,
    },
    device_on_time: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "06:00:00", // 6:00 AM
    },
    device_off_time: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "23:00:00", // 11:00 PM
    },
    device_name: {
      type: DataTypes.STRING,
      defaultValue: "Unknown Device",
      allowNull: false,
    },
    group_id: { type: DataTypes.UUID, allowNull: false },
    android_id: { type: DataTypes.STRING, allowNull: false },
    location: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    registration_status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    pairing_code: { type: DataTypes.INTEGER, allowNull: true },

    last_synced: { type: DataTypes.DATE, allowNull: false },
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const DeviceGroup = sequelize.define(
  "DeviceGroup",
  {
    group_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    max_days_schedules: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
    }, // Max number of days schedules can be created for
    current_content_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "ad",
    }, //website, stream, ad
    client_id: { type: DataTypes.UUID, allowNull: false },
    reg_code: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    last_pushed: DataTypes.DATE,
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const ScrollText = sequelize.define(
  "ScrollText",
  {
    scrolltext_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    group_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "DeviceGroups", key: "group_id" },
      onDelete: "CASCADE",
    },
    message: { type: DataTypes.TEXT, allowNull: false },
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const Schedule = sequelize.define(
  "Schedule",
  {
    schedule_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    content_id: { type: DataTypes.UUID, allowNull: false },
    content_type: { type: DataTypes.STRING, allowNull: false }, //website, stream, ad
    // ad_id: { type: DataTypes.UUID, allowNull: false },
    group_id: { type: DataTypes.UUID, allowNull: false },
    start_time: { type: DataTypes.DATE, allowNull: false },
    end_time: { type: DataTypes.DATE, allowNull: false },
    total_duration: DataTypes.INTEGER,
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const LiveContent = sequelize.define(
  "LiveContent",
  {
    live_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    client_id: { type: DataTypes.UUID, allowNull: false },
    content_type: { type: DataTypes.STRING, allowNull: false }, // website, live, ppt
    name: { type: DataTypes.STRING, allowNull: false },
    url: { type: DataTypes.STRING, allowNull: false },
    stream_platform: { type: DataTypes.STRING, allowNull: false }, // youtube, ipTV
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const AdPlayback = sequelize.define("AdPlayback", {
  schedule_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  ad_id: { type: DataTypes.UUID, allowNull: false },
  device_id: { type: DataTypes.UUID, allowNull: false },
  played_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  duration_played: { type: DataTypes.INTEGER, allowNull: false },
  sync_time: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});

const User = sequelize.define(
  "User",
  {
    user_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    client_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    phone_number: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isNumeric: true },
    },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false },
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const SiteUser = sequelize.define(
  "SiteUser",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: DataTypes.STRING,
    email: {
      type: DataTypes.STRING,
      unique: true,
      validate: { isEmail: true },
    },
    phone_number: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      validate: { isNumeric: true },
    },
    is_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    last_login: DataTypes.DATE,
    ip_address: DataTypes.STRING,
    user_agent: DataTypes.STRING,
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const Campaign = sequelize.define(
  "Campaign",
  {
    campaign_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    client_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Client, key: "client_id" },
    },
    name: { type: DataTypes.STRING, allowNull: false },
    description: DataTypes.TEXT,
    requires_phone: { type: DataTypes.BOOLEAN, defaultValue: true },
    requires_questions: { type: DataTypes.BOOLEAN, defaultValue: false },
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const Coupon = sequelize.define(
  "Coupon",
  {
    coupon_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Campaign, key: "campaign_id" },
    },
    coupon_code: { type: DataTypes.STRING, allowNull: false },
    description: DataTypes.TEXT,
    expiry_date: DataTypes.DATE,
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const CampaignInteraction = sequelize.define(
  "CampaignInteraction",
  {
    interaction_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Campaign, key: "campaign_id" },
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: SiteUser, key: "id" },
    },
    count: { type: DataTypes.INTEGER, allowNull: false },
    ...defaultTimestamps,
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const SelectedSeries = sequelize.define("SelectedSeries", {
  series_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  series_name: { type: DataTypes.STRING, allowNull: false },
  match_list: DataTypes.STRING,
  live_match_id: DataTypes.UUID,
});

const DailyImpressionSummary = sequelize.define(
  "DailyImpressionSummary",
  {
    summary_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    summary_date: { type: DataTypes.DATEONLY, allowNull: false },
    group_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "DeviceGroups", key: "group_id" },
    },
    ad_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "Ads", key: "ad_id" },
    },
    client_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "Clients", key: "client_id" },
    },
    device_count: { type: DataTypes.INTEGER, allowNull: false },
    total_loop_duration_seconds: { type: DataTypes.INTEGER, allowNull: false },
    loops_per_day: { type: DataTypes.INTEGER, allowNull: false },
    impressions: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  },
  {
    tableName: "DailyImpressionSummaries",
    indexes: [
      {
        unique: true,
        fields: ["summary_date", "group_id", "ad_id"],
        name: "daily_group_ad_unique",
      },
      { fields: ["summary_date"] },
      { fields: ["client_id"] },
      { fields: ["group_id"] },
      { fields: ["ad_id"] },
    ],
  }
);

const ApkVersion = sequelize.define(
  "ApkVersion",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    version_code: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    version_name: { type: DataTypes.STRING, allowNull: false },
    file_name: { type: DataTypes.STRING, allowNull: false },
    s3_key: { type: DataTypes.STRING, allowNull: false, unique: true },
    file_size_bytes: { type: DataTypes.BIGINT, allowNull: false },
    release_notes: DataTypes.TEXT,
    is_mandatory: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: false },
    checksum_sha256: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    uploaded_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    timestamps: false, // ✅ disables Sequelize's automatic createdAt/updatedAt
  }
);

const ProofOfPlayLog = sequelize.define(
  "ProofOfPlayLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    event_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    device_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "Devices", key: "device_id" },
    },
    ad_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "Ads", key: "ad_id" },
    },
    schedule_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "Schedules", key: "schedule_id" },
    },

    start_time: { type: DataTypes.DATE, allowNull: false },
    end_time: { type: DataTypes.DATE, allowNull: false },
    duration_played_ms: { type: DataTypes.INTEGER, allowNull: false },
    ...defaultTimestamps,
  },
  { timestamps: false }
);

const DeviceTelemetryLog = sequelize.define(
  "DeviceTelemetryLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    device_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "Devices", key: "device_id" },
    },
    timestamp: { type: DataTypes.DATE, allowNull: false },
    cpu_usage: DataTypes.FLOAT,
    ram_free_mb: DataTypes.INTEGER,
    storage_free_mb: DataTypes.INTEGER,
    network_type: DataTypes.STRING,
    app_version_code: DataTypes.INTEGER,
    ...defaultTimestamps,
  },
  { timestamps: false, indexes: [{ fields: ["device_id", "timestamp"] }] }
);

const DeviceEventLog = sequelize.define(
  "DeviceEventLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    event_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    device_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "Devices", key: "device_id" },
    },
    timestamp: { type: DataTypes.DATE, allowNull: false },
    event_type: { type: DataTypes.STRING, allowNull: false },
    payload: { type: DataTypes.JSONB, allowNull: false },
    ...defaultTimestamps,
  },
  {
    timestamps: false,
    indexes: [
      { fields: ["device_id", "timestamp"] },
      { fields: ["event_type"] },
    ],
  }
);

DailyImpressionSummary.belongsTo(DeviceGroup, { foreignKey: "group_id" });
DailyImpressionSummary.belongsTo(Ad, { foreignKey: "ad_id" });

Client.hasMany(Campaign, { foreignKey: "client_id" });
Campaign.belongsTo(Client, { foreignKey: "client_id" });

SiteUser.hasMany(CampaignInteraction, { foreignKey: "user_id" });
CampaignInteraction.belongsTo(SiteUser, { foreignKey: "user_id" });
Campaign.hasMany(CampaignInteraction, { foreignKey: "campaign_id" });
CampaignInteraction.belongsTo(Campaign, { foreignKey: "campaign_id" });
Campaign.hasMany(Coupon, { foreignKey: "campaign_id", as: "coupons" });
Coupon.belongsTo(Campaign, { foreignKey: "campaign_id" });
Client.hasMany(Ad, { foreignKey: "client_id" });
Ad.belongsTo(Client, { foreignKey: "client_id" });
LiveContent.belongsTo(Client, { foreignKey: "client_id" });
Client.hasMany(DeviceGroup, { foreignKey: "client_id" });
DeviceGroup.belongsTo(Client, { foreignKey: "client_id" });
// Ad.hasMany(Schedule, { foreignKey: "ad_id" });
// Schedule.belongsTo(Ad, { foreignKey: "ad_id" });
DeviceGroup.hasMany(Schedule, { foreignKey: "group_id" });
Schedule.belongsTo(DeviceGroup, { foreignKey: "group_id" });
Device.belongsTo(DeviceGroup, { foreignKey: "group_id" });
DeviceGroup.hasMany(Device, { foreignKey: "group_id" });
DeviceGroup.hasOne(ScrollText, { foreignKey: "group_id", onDelete: "CASCADE" });
ScrollText.belongsTo(DeviceGroup, { foreignKey: "group_id" });
Schedule.hasOne(AdPlayback, { foreignKey: "schedule_id" });
User.belongsTo(Client, { foreignKey: "client_id" });
Client.hasMany(User, { foreignKey: "client_id" });

Device.hasMany(ProofOfPlayLog, { foreignKey: "device_id" });
Device.hasMany(DeviceTelemetryLog, { foreignKey: "device_id" });
Device.hasMany(DeviceEventLog, { foreignKey: "device_id" });

// Each log entry belongs to a single Device.
ProofOfPlayLog.belongsTo(Device, { foreignKey: "device_id" });
DeviceTelemetryLog.belongsTo(Device, { foreignKey: "device_id" });
DeviceEventLog.belongsTo(Device, { foreignKey: "device_id" });

// An Ad can be part of many Proof of Play logs.
Ad.hasMany(ProofOfPlayLog, { foreignKey: "ad_id" });
ProofOfPlayLog.belongsTo(Ad, { foreignKey: "ad_id" });

// A Schedule can have many associated Proof of Play logs.
Schedule.hasMany(ProofOfPlayLog, { foreignKey: "schedule_id" });
ProofOfPlayLog.belongsTo(Schedule, { foreignKey: "schedule_id" });

// === Associations ===
Schedule.belongsTo(LiveContent, {
  foreignKey: "content_id",
  constraints: false,
  as: "liveContent",
});
Schedule.belongsTo(Ad, {
  foreignKey: "content_id",
  constraints: false,
  as: "adContent",
});

DeviceGroup.hasMany(Schedule, { foreignKey: "group_id" });
Schedule.belongsTo(DeviceGroup, { foreignKey: "group_id" });

// Optional helper method
Schedule.prototype.getContent = async function () {
  return this.content_type === "stream"
    ? await this.getLiveContent() // ✅ this exists
    : await this.getAdContent(); // ✅ this exists
};

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
  SelectedSeries,
  DailyImpressionSummary,
  ApkVersion,
  ProofOfPlayLog,
  DeviceTelemetryLog,
  DeviceEventLog,
  LiveContent,
};
