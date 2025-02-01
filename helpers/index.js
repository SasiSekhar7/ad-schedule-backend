const moment = require("moment");

module.exports.getCustomUTCDateTime = () => {
    // return moment().utc().format('YYYY-MM-DD HH:mm:ss'); // Example format
    return moment().utc().format(); 

};

module.exports.getUTCDate = () => {
    return moment().utc().format('YYYY-MM-DD');
}
