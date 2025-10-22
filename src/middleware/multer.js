const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const uploadDir = "uploads";

// Ensure upload directories exist
const fileName = path.join(uploadDir, "ads");
// const videoDir = path.join(uploadDir, 'videos');

if (!fs.existsSync(fileName)) fs.mkdirSync(fileName, { recursive: true });
// if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, fileName);
  },
  filename: function (req, file, cb) {
    cb(
      null,
      `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`
    );
  },
});

// File filter to allow only images and videos
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mkv|mov/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    return cb(
      new Error(
        "Only images (JPEG, PNG, GIF) and videos (MP4, AVI, MKV, MOV) are allowed!"
      ),
      false
    );
  }
};

// Set up Multer
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max for videos, 10MB max for images
  fileFilter: fileFilter,
});

// module.exports = upload;
