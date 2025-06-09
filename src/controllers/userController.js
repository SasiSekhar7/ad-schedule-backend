const { User,Client } = require("../models");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");

const saltRounds = 10;
module.exports.addUser = async (req, res) => {
  try {
    const { name, client_id, email, phone_number, role, password } = req.body;

    if (!name | !client_id | !email | !phone_number | !role | !password) {
      return res.status(400).json({ error: "Missing required parameters" });
    }
    const hash = bcrypt.hashSync(password, saltRounds);

    await User.create({
        name,
        client_id,
        email,
        phone_number,
        role, 
        password:hash,
      });

    res.json({ message: "User created successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.getAllusers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['user_id', 'name', 'email', 'role', 'phone_number'], 
      include: [
        {
          model: Client,
          attributes: ['name'],
        },
      ],
    });
    const formattedUsers = users.map(user => ({
      ...user.toJSON(),
      client_name: user.Client?.name || '',
    }));

    res.json({ users: formattedUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


module.exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.user_id;

    const user = await User.findOne({ where: { user_id: userId } });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    await User.destroy({ where: { user_id: userId } });

    return res.json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.resetPass = async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: "Password too short" });
  }

  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const hashed = await bcrypt.hash(newPassword, saltRounds);
    user.password = hashed;
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports.getUserData = async (req, res) => {
  try {
    const { user_id } = req.user;

    const user = await User.findOne({
      attributes: ['name', 'email', 'role'],
      where: { user_id }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Define nav structures
    const navMainAdmin = [
      {
        title:"Users",
        url: "/users",
        icon: "Users",
        items: [
          { title: "All", url: "/user/all" }
        ]
      },
      {
        title: "Devices ",
        url: "/devices",
        icon: "SquareTerminal",
        items: [
          { title: "All", url: "/devices" },
          { title: "Device Groups", url: "/devices/groups" }
        ]
      },
      {
        title: "Ads",
        url: "/ads",
        icon: "Bot",
        items: [
          { title: "All", url: "/ads" },
          { title: "Clients", url: "/ads/clients" }
        ]
      },
      {
        title: "Schedule",
        url: "/schedule",
        icon: "BookOpen",
        items: [
          { title: "All", url: "/schedule" },
          { title: "Add", url: "/schedule/add" },
          { title: "Calendar", url: "/schedule/calendar" },
          { title: "Placeholder", url: "/schedule/placeholder" }
        ]
      },
      {
        title: "Version Control",
        url: "/apkVersion",
        icon: "QrCode",
        items: [
          { title: "Android", url: "/apkVersion" },

        ]
      },
      {
        title: "QR Campaign",
        url: "/campaigns",
        icon: "QrCode",
        items: [
          { title: "All", url: "/campaigns" },
          { title: "Interactions", url: "/campaigns/interactions" },
          { title: "New", url: "/campaigns/new" }
        ]
      }
    ];

    const navMainClient = [
      {
        title: "Devices",
        url: "/devices",
        icon: "SquareTerminal",
        items: [
          { title: "All", url: "/devices" },
          { title: "Device Groups", url: "/devices/groups" }
        ]
      },
      {
        title: "Ads",
        url: "/ads",
        icon: "Bot",
        items: [
          { title: "All", url: "/ads" },
        ]
      },

      {
        title: "Schedule",
        url: "/schedule",
        icon: "BookOpen",
        items: [
          { title: "All", url: "/schedule" },
          { title: "Add", url: "/schedule/add" },
          { title: "Placeholder", url: "/schedule/placeholder" }
        ]
      }
    ];

    // Example teams (same for both roles here, but you can customize)
    const teams = [
      { name: "AdUp Console", logo: "/logo.png", plan: "Enterprise" }
    ];

    const userData = {
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: "/avatars/shadcn.jpg"
      },
      teams,
      navMain: user.role === "Admin" ? navMainAdmin : navMainClient
    };

    res.json(userData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.getAccountInfo = async (req, res) => {
  try {
    const { user_id } = req.user; 

    const user = await User.findOne({
      where: { user_id },
      attributes: ['user_id', 'name', 'email', 'phone_number', 'role', 'createdAt']
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const accountInfo = {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      phone_number: user.phone_number,
      role: user.role,
      joined_on: user.createdAt,
      avatar: "/avatars/shadcn.jpg"
    };

    res.json({ account: accountInfo });
  } catch (error) {
    console.error("Error fetching account info:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.updateAccountInfo = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { name, email, phone_number, newPassword, confirmPassword } = req.body;

    const user = await User.findOne({ where: { user_id } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (email && email !== user.email) {
      const existingEmail = await User.findOne({
        where: { email, user_id: { [Op.ne]: user_id } },
      });
      if (existingEmail) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }

    if (phone_number && phone_number !== user.phone_number) {
      const existingPhone = await User.findOne({
        where: { phone_number, user_id: { [Op.ne]: user_id } },
      });
      if (existingPhone) {
        return res.status(400).json({ message: "Phone number already in use" });
      }
      user.phone_number = phone_number;
    }

    if (name) user.name = name;

    if (newPassword || confirmPassword) {
      if (!newPassword || !confirmPassword) {
        return res.status(400).json({ message: "Both new password and confirm password are required" });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: "New password and confirm password do not match" });
      }

      const passwordRegex = /^(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          message: "Password must be at least 8 characters long, contain at least one number and one special character",
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      user.password = hashedPassword;
    }

    await user.save();

    res.json({
      message: "Account information updated successfully",
      updatedAccount: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        joined_on: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Error updating account info:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

