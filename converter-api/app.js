const express = require("express");
const fileUpload = require("express-fileupload");
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const randomstring = require("randomstring");
const PDFDocument = require("pdfkit");
const cloudinary = require("cloudinary").v2;
require("dotenv").config();

const unoconv = require("./dist");
const auditStore = require("./audit-store");

const PORT = process.env.PORT || 4000;
const storageProvider = (process.env.STORAGE_PROVIDER || "cloudinary").toLowerCase();
const cloudinaryFolder = process.env.CLOUDINARY_FOLDER || "hexscrum-workspace";
const configuredMaxUploadMb = Number(process.env.MAX_UPLOAD_MB || 25);
const maxUploadMb = Number.isFinite(configuredMaxUploadMb) && configuredMaxUploadMb > 0 ? configuredMaxUploadMb : 25;
const maxUploadBytes = maxUploadMb * 1024 * 1024;
const uploadDir = path.resolve("./test");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET)
);

if (cloudinaryConfigured && !process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
} else if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
}

const allowedExtensions = new Set([
  ".pdf",
  ".ppt",
  ".pptx",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".rtf",
  ".odt",
  ".odp",
  ".ods",
  ".png",
  ".jpg",
  ".jpeg"
]);

const imageExtensions = new Set([".png", ".jpg", ".jpeg"]);
const officeExtensions = new Set([
  ".ppt",
  ".pptx",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".rtf",
  ".odt",
  ".odp",
  ".ods"
]);

function commandExists(command) {
  const result = spawnSync("which", [command], { encoding: "utf8" });
  return result.status === 0;
}

function converterAvailable() {
  return commandExists("unoconv") || commandExists("libreoffice") || commandExists("soffice");
}

function storageConfigured() {
  if (storageProvider === "cloudinary") return cloudinaryConfigured;
  return false;
}

function allowedOrigins() {
  return new Set(
    [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
      process.env.FRONTEND_ORIGIN,
      ...(process.env.CORS_ORIGINS || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
    ].filter(Boolean)
  );
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins().has(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".vercel.app");
  } catch (err) {
    return false;
  }
}

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) {
    res.header("Access-Control-Allow-Origin", "*");
  } else if (isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT,DELETE");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
}

function asyncRoute(handler) {
  return function route(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function moveUploadedFile(file, destination) {
  return new Promise((resolve, reject) => {
    file.mv(destination, function(err) {
      if (err) return reject(err);
      return resolve();
    });
  });
}

function deleteFile(filepath) {
  if (!filepath) return;
  fs.unlink(filepath, function(err) {
    if (err && err.code !== "ENOENT") {
      console.warn("Unable to delete temp file", path.basename(filepath), err.message);
    }
  });
}

function convertWithUnoconv(inputPath, outputPath) {
  return unoconv.convert(inputPath, outputPath);
}

function convertImageToPdf(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(outputPath);

    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);

    doc.pipe(stream);
    doc.addPage({ size: "A4", margin: 36 });
    doc.image(inputPath, 36, 36, {
      fit: [doc.page.width - 72, doc.page.height - 72],
      align: "center",
      valign: "center"
    });
    doc.end();
  });
}

async function uploadToCloudinary(filePath, publicId, contentType) {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: cloudinaryFolder,
    public_id: publicId,
    resource_type: "auto",
    use_filename: false,
    unique_filename: true,
    type: "upload"
  });
  return {
    provider: "cloudinary",
    url: result.secure_url,
    secure_url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    contentType
  };
}

async function uploadOutput(filePath, publicId, contentType) {
  if (storageProvider === "cloudinary") {
    if (!cloudinaryConfigured) {
      throw new Error("cloudinary_not_configured");
    }
    return uploadToCloudinary(filePath, publicId, contentType);
  }

  throw new Error("storage_provider_not_supported");
}

async function preparePdf(inputPath, outputPath, ext) {
  if (ext === ".pdf") {
    return { outputPath: inputPath, converted: false, contentType: "application/pdf" };
  }

  if (imageExtensions.has(ext)) {
    await convertImageToPdf(inputPath, outputPath);
    return { outputPath, converted: true, contentType: "application/pdf" };
  }

  if (officeExtensions.has(ext)) {
    if (!converterAvailable()) {
      throw new Error("converter_not_available");
    }
    await convertWithUnoconv(inputPath, outputPath);
    return { outputPath, converted: true, contentType: "application/pdf" };
  }

  throw new Error("unsupported_file_type");
}

const app = express();
let schemaInitError = null;

auditStore.initSchema().catch(err => {
  schemaInitError = err;
  console.warn("Audit schema initialization skipped or failed:", err.message);
});

app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(
  fileUpload({
    limits: { fileSize: maxUploadBytes },
    abortOnLimit: true,
    responseOnLimit: `Filesize should not be more than ${maxUploadMb} MB`
  })
);

app.get(
  "/health",
  asyncRoute(async function(req, res) {
    const db = await auditStore.health();
    res.status(200).json({
      ok: true,
      service: "hexscrum-converter-api",
      storageProvider,
      storageConfigured: storageConfigured(),
      databaseConfigured: db.configured,
      databaseOk: db.ok,
      databaseMode: db.mode,
      cloudinaryConfigured,
      converterAvailable: converterAvailable(),
      uploadField: "sampleFile",
      maxUploadMb,
      auditSchemaReady: !schemaInitError
    });
  })
);

app.post(
  "/upload",
  asyncRoute(async function(req, res) {
    if (!req.files || Object.keys(req.files).length === 0 || !req.files.sampleFile) {
      return res.status(400).json({ error: "No sampleFile upload was provided." });
    }

    if (!storageConfigured()) {
      return res.status(500).json({
        error:
          "Storage is not configured. Set STORAGE_PROVIDER=cloudinary with CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET."
      });
    }

    let sampleFile = req.files.sampleFile;
    if (Array.isArray(sampleFile)) {
      sampleFile = sampleFile[0];
    }

    if (sampleFile.size > maxUploadBytes) {
      return res.status(413).json({ error: `Filesize should not be more than ${maxUploadMb} MB` });
    }

    const safeName = path.basename(sampleFile.name || "upload").replace(/[^\w.-]/g, "_");
    const ext = path.extname(safeName).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return res.status(415).json({
        error:
          "Unsupported file type. Allowed: PDF, PPT/PPTX, DOC/DOCX, XLS/XLSX, CSV/TXT/RTF, ODT/ODP/ODS, PNG, JPG."
      });
    }

    const randomStr = randomstring.generate(10);
    const inputPath = path.resolve(uploadDir, `${randomStr}-${safeName}`);
    const outputPath = path.resolve(uploadDir, `${randomStr}.pdf`);
    const publicId = `${Date.now()}-${randomStr}`;
    let prepared;

    try {
      await moveUploadedFile(sampleFile, inputPath);
      prepared = await preparePdf(inputPath, outputPath, ext);
      const upload = await uploadOutput(prepared.outputPath, publicId, prepared.contentType);
      const document = req.body.workspaceId
        ? await auditStore.createDocument({
            workspaceId: req.body.workspaceId,
            originalFileName: safeName,
            sourceMimeType: sampleFile.mimetype || "",
            storageUrl: upload.secure_url || upload.url,
            convertedPdfUrl: upload.secure_url || upload.url,
            uploadedByUserId: req.body.userId || "",
            metadata: {
              size: sampleFile.size,
              converted: prepared.converted,
              storageProvider,
              originalMimeType: sampleFile.mimetype || "",
              uploaderName: req.body.userName || "",
              uploaderDesignation: req.body.userDesignation || ""
            }
          })
        : null;

      return res.status(200).json({
        url: upload.secure_url || upload.url,
        secure_url: upload.secure_url || upload.url,
        storageProvider: upload.provider,
        originalName: safeName,
        mimeType: sampleFile.mimetype || "",
        size: sampleFile.size,
        converted: prepared.converted,
        document
      });
    } catch (err) {
      const messageMap = {
        cloudinary_not_configured:
          "Cloudinary storage is not configured. Set Cloudinary variables on the backend only.",
        converter_not_available:
          "LibreOffice/unoconv is unavailable. Use the Render Docker image or install conversion runtime locally.",
        unsupported_file_type: "Unsupported file type."
      };
      console.error("Upload failed:", messageMap[err.message] || err.message);
      return res.status(500).json({
        error:
          messageMap[err.message] ||
          "File upload/conversion failed. Confirm LibreOffice/unoconv and Cloudinary credentials are configured."
      });
    } finally {
      deleteFile(inputPath);
      if (prepared && prepared.outputPath !== inputPath) {
        deleteFile(prepared.outputPath);
      } else {
        deleteFile(outputPath);
      }
    }
  })
);

app.post(
  "/api/workspaces",
  asyncRoute(async function(req, res) {
    const workspace = await auditStore.createWorkspace(req.body || {});
    res.status(201).json({ workspace });
  })
);

app.get(
  "/api/workspaces/:id",
  asyncRoute(async function(req, res) {
    const workspace = await auditStore.getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });
    return res.status(200).json({ workspace });
  })
);

app.post(
  "/api/annotations/events",
  asyncRoute(async function(req, res) {
    const event = await auditStore.recordAnnotationEvent(req.body || {});
    res.status(201).json({ event });
  })
);

app.get(
  "/api/annotations/events",
  asyncRoute(async function(req, res) {
    const events = await auditStore.listAnnotationEvents(req.query.workspaceId || "");
    res.status(200).json({ events });
  })
);

app.post(
  "/api/meeting-notes",
  asyncRoute(async function(req, res) {
    const note = await auditStore.saveMeetingNote(req.body || {});
    res.status(201).json({ note });
  })
);

app.get(
  "/api/meeting-notes",
  asyncRoute(async function(req, res) {
    const notes = await auditStore.listMeetingNotes(req.query.workspaceId || "");
    res.status(200).json({ notes });
  })
);

app.get(
  "/api/reports/user-wise",
  asyncRoute(async function(req, res) {
    const report = await auditStore.userWiseReport(req.query.workspaceId || "");
    res.status(200).json({ report });
  })
);

app.get(
  "/api/reports/annotation-history",
  asyncRoute(async function(req, res) {
    const report = await auditStore.annotationHistoryReport(req.query.workspaceId || "");
    res.status(200).json({ report });
  })
);

app.post(
  "/api/archives/generate",
  asyncRoute(async function(req, res) {
    const manifest = await auditStore.generateArchive(req.body || {});
    res.status(201).json({ manifest });
  })
);

app.use(function(err, req, res, next) {
  console.error("API error:", err.message);
  res.status(500).json({ error: "Internal API error." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`HexScrum converter API running on port ${PORT}`);
  });
}

module.exports = app;
