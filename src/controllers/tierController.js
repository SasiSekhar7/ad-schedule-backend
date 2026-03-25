const { Tier } = require("../models");

// Get all tiers
exports.getAllTiers = async (req, res) => {
  try {
    const tiers = await Tier.findAll({
      where: { is_active: true },
    });
    res.json(tiers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const tiers = await Tier.findAll();
    res.json(tiers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createTier = async (req, res) => {
  try {
    const tier = await Tier.create(req.body);
    res.status(201).json(tier);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateTier = async (req, res) => {
  try {
    const { tier_id } = req.params;

    const tier = await Tier.findByPk(tier_id);
    if (!tier) {
      return res.status(404).json({ message: "Tier not found" });
    }

    await tier.update(req.body);

    res.json(tier);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.toggleTierStatus = async (req, res) => {
  try {
    const { tier_id } = req.params;

    const tier = await Tier.findByPk(tier_id);
    if (!tier) {
      return res.status(404).json({ message: "Tier not found" });
    }

    tier.is_active = !tier.is_active;
    await tier.save();

    res.json({
      message: "Tier status updated",
      is_active: tier.is_active,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
