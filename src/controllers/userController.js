const { User } = require("../models");
const bcrypt = require("bcrypt");

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
          { title: "View", url: "/schedule" }
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
