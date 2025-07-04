const moment = require("moment");

module.exports.getCustomUTCDateTime = () => {
  // return moment().utc().format('YYYY-MM-DD HH:mm:ss'); // Example format
  return moment().utc().format();
};

module.exports.getUTCDate = () => {
  return moment().utc().format("YYYY-MM-DD");
};

// Generate a 6-digit random numeric pairing code
module.exports.generatePairingCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
