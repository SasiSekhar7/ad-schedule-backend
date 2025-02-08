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
    const {user_id} = req.user;
    const user  = await User.findOne({attributes:['name', 'email', 'role'], where:{
      user_id
    }})

    res.json({user});
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
