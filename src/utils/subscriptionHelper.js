require("dotenv").config();
const DEFAULT_YEARS = Number(process.env.SUBSCRIPTION_YEARS) || 1;

const getSubscriptionExpiry = ({
  baseDate = new Date(),
  years = DEFAULT_YEARS,
} = {}) => {
  const expiry = new Date(baseDate);
  expiry.setFullYear(expiry.getFullYear() + years);
  return expiry;
};

module.exports = {
  getSubscriptionExpiry,
};
