const multer = require('multer');

const storage = multer.memoryStorage();



// Set up Multer
const upload = multer({
    storage: storage
});

module.exports = upload;