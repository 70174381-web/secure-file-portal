require("dotenv").config();

const express    = require("express");
const helmet     = require("helmet");
const cors       = require("cors");
const rateLimit  = require("express-rate-limit");
const multer     = require("multer");
const jwt        = require("jsonwebtoken");
const crypto     = require("crypto");
const path       = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUCKET = "files";

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use(express.static(path.join(__dirname, "public")));

// Multer — memory storage (we stream straight to Supabase)
const upload = multer({ storage: multer.memoryStorage() });

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

// ── UPLOAD ───────────────────────────────────────────────────────
app.post("/api/upload-file", authenticate, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file received" });

    const fileId          = crypto.randomUUID();
    const storagePath     = `${req.user.id}/${fileId}`;
    const originalFilename = req.body.originalFilename || "decrypted-file";
    const contentType      = req.body.contentType     || "application/octet-stream";

    // Upload encrypted blob to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: "application/octet-stream",
        upsert: false
      });

    if (uploadError) throw new Error(uploadError.message);

    // Store metadata as a small JSON file alongside the encrypted blob
    const meta = { originalFilename, contentType, ownerId: req.user.id, uploadedAt: new Date().toISOString() };
    await supabase.storage
      .from(BUCKET)
      .upload(`${storagePath}.meta.json`, Buffer.from(JSON.stringify(meta)), {
        contentType: "application/json",
        upsert: true
      });

    const s3Key = storagePath;
    console.log("✓ Uploaded to Supabase:", storagePath);
    res.json({ fileId, s3Key });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

// ── DOWNLOAD ─────────────────────────────────────────────────────
app.get("/api/download", authenticate, async (req, res) => {
  try {
    const s3Key = req.query.key;
    if (!s3Key) return res.status(400).json({ error: "Missing key parameter" });

    // Read metadata
    const { data: metaData, error: metaError } = await supabase.storage
      .from(BUCKET)
      .download(`${s3Key}.meta.json`);

    let originalFilename = "decrypted-file";
    let contentType      = "application/octet-stream";

    if (!metaError && metaData) {
      try {
        const meta     = JSON.parse(await metaData.text());
        originalFilename = meta.originalFilename || originalFilename;
        contentType      = meta.contentType      || contentType;
      } catch {}
    }

    // Generate a signed URL (valid for 1 hour)
    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(s3Key, 3600);

    if (signedError) throw new Error(signedError.message);

    console.log("✓ Signed URL generated for:", s3Key);
    res.json({
      presignedUrl: signedData.signedUrl,
      originalFilename,
      contentType
    });
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Download failed: " + err.message });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log("Server running on port " + PORT));
}

module.exports = app;