require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

const WAHelper = require("./whatsapp.helper");
const path = require("path");
const multer = require("multer");

// CONFIGURATION
const fileSize = 250; // 250MB
const fileTypes = /jpeg|jpg|png|mp4|pdf/;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 * fileSize },
    fileFilter: (req, file, cb) => {
        const ext = fileTypes.test(path.extname(file.originalname).toLowerCase());
        if (ext && file.mimetype) cb(null, true);
        else cb(new Error(`Only ${fileTypes} extensions allowed`), false);
    }
});

// helper to override env from req.body
function overrideEnv(fields) {
  const keys = [
    "PORT",
    "META_API_URI",
    "META_APP_ID",
    "META_ACCESS_TOKEN",
    "META_BUSINESS_ACC_ID"
  ];
  keys.forEach(k => {
    if (fields[k] !== undefined) {
      process.env[k] = fields[k];
    }
  });
}

// UPLOAD MEDIA ROUTE
app.post('/uploadMedia', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err instanceof multer.MulterError
        ? `Max file size ${fileSize}MB exceeded`
        : "Something went wrong, please try again";
      return res.status(400).json({ message: msg });
    }
    if (!req.file) {
      return res.status(400).json({ message: "File is required" });
    }

    // Override process.env with any form‑fields
    overrideEnv(req.body);

    try {
      // Create session using current process.env values
      const session = await WAHelper.RUCreateSession({
        file_length: req.file.size,
        file_name:   req.file.originalname,
        file_type:   req.file.mimetype
      });
      if (session.body.error) {
        throw session.body.error;
      }

      const iupload = await WAHelper.RUInitiateUpload(
        session.body.id,
        req.file.buffer
      );
      if (iupload.body.h) {
        return res.status(200).json({
          message: "Uploaded!",
          body:    iupload.body
        });
      }
      throw iupload.body.error || new Error("Unknown upload error");
    }
    catch (e) {
      const userMsg = e.error_user_title
        ? `${e.error_user_title} (${e.error_user_msg})`
        : e.message;
      console.error(e);
      return res.status(400).json({ message: userMsg });
    }
  });
});

// CREATE TEMPLATE
app.post('/createTemplate', async (req, res) => {
  // Override env here too, if needed:
  overrideEnv(req.body);

  try {
    const template = await WAHelper.createWABANOTemplates(req.body);
    if (template.body.id) {
      return res.status(200).json({
        message: "Template Created!",
        body:    template.body
      });
    }
    throw template.body.error || new Error("Unknown template error");
  }
  catch (e) {
    const userMsg = e.error_user_title
      ? `${e.error_user_title} (${e.error_user_msg})`
      : e.message;
    console.error(e);
    return res.status(400).json({ message: userMsg });
  }
});

// SERVER LISTEN
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.info(`Listening on port ${port}`);
}).on("error", err => {
  console.error(err.message);
});
