require("dotenv").config();

const express    = require("express");
const helmet     = require("helmet");
const cors       = require("cors");
const rateLimit  = require("express-rate-limit");
const multer     = require("multer");
const jwt        = require("jsonwebtoken");
const crypto     = require("crypto");
const path       = require("path");
const fs         = require("fs");

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "https:", "'unsafe-inline'"],
      fontSrc:    ["'self'", "https:", "data:"],
      imgSrc:     ["'self'", "data:"],
      connectSrc: ["'self'"],
    }
  }
}));
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use(express.static(path.join(__dirname, "public")));

const uploadsDir = process.env.VERCEL ? "/tmp/uploads" : path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const metadataPath = path.join(uploadsDir, "metadata.json");
function readMetadata() {
  if (!fs.existsSync(metadataPath)) return {};
  try { return JSON.parse(fs.readFileSync(metadataPath, "utf8")); } catch { return {}; }
}
function writeMetadata(all) { fs.writeFileSync(metadataPath, JSON.stringify(all, null, 2)); }
function saveFileMetadata(fileId, data) { const all = readMetadata(); all[fileId] = data; writeMetadata(all); }
function getFileMetadata(fileId) { return readMetadata()[fileId] || null; }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => cb(null, crypto.randomUUID())
});
const upload = multer({ storage });

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.get("/test-token", (req, res) => {
  const userId = req.query.userId || "test_user";
  const token  = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.json({ token });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/api/upload-file", authenticate, upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file received" });
    const fileId = req.file.filename;
    const s3Key  = "uploads/" + req.user.id + "/" + fileId;
    const originalFilename = req.body.originalFilename || req.file.originalname || "decrypted-file";
    const contentType      = req.body.contentType || "application/octet-stream";
    saveFileMetadata(fileId, { originalFilename, contentType, ownerId: req.user.id, uploadedAt: new Date().toISOString() });
    res.json({ fileId, s3Key });
  } catch (err) {
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

app.get("/api/download", authenticate, (req, res) => {
  try {
    const s3Key = req.query.key;
    if (!s3Key) return res.status(400).json({ error: "Missing key parameter" });
    const fileId   = path.basename(s3Key);
    const filePath = path.join(uploadsDir, fileId);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    const meta = getFileMetadata(fileId) || {};
    res.json({
      presignedUrl: "/api/file/" + fileId,
      originalFilename: meta.originalFilename || "decrypted-file",
      contentType: meta.contentType || "application/octet-stream"
    });
  } catch (err) {
    res.status(500).json({ error: "Download failed: " + err.message });
  }
});

app.get("/api/file/:fileId", authenticate, (req, res) => {
  try {
    const filePath = path.join(uploadsDir, req.params.fileId);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    res.setHeader("Content-Type", "application/octet-stream");
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: "Could not serve file" });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log("Server running on port " + PORT));
}

module.exports = app;
