import multer from "multer";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";

// Define the uploads directory path
const uploadsDir = path.join(__dirname, "uploads");

// Ensure that the uploads directory exists, create it if it doesn't
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, uploadsDir);
  },
  filename(req, file, callback) {
    const id = uuid();
    const extName = file.originalname.split(".").pop();
    callback(null, `${id}.${extName}`);
  },
});

export const singleUpload = multer({ storage }).single("photo");
