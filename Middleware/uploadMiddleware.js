import multer from "multer";
import path from "path";
import fs from "fs";

// Create uploads folder if missing
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const fileFilter = (req, file, cb) => {
  console.log("🚨 Uploaded file mimetype:", file.mimetype);
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/pjpeg",
    "application/octet-stream",
    "binary/octet-stream"
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

  if ((!file.mimetype || file.mimetype.trim() === '') && allowedExts.includes(ext)) {
    return cb(null, true);
  }

  if (!allowedTypes.includes(file.mimetype) && !allowedExts.includes(ext)) {
    return cb(new Error("Invalid file type. Only images allowed."), false);
  }

  cb(null, true);
};

// Export Multer instance
const upload = multer({ storage, fileFilter });

export default upload;
