const express = require("express");
const fileUpload = require("express-fileupload");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { spawn, spawnSync } = require("child_process");
const randomstring = require("randomstring");
const PDFDocument = require("pdfkit");
const cloudinary = require("cloudinary").v2;
require("dotenv").config();

const unoconv = require("./dist");
const auditStore = require("./audit-store");
const { RtmTokenBuilder, RtmRole } = require("agora-access-token");

const PORT = process.env.PORT || 4000;
const storageProvider = (process.env.STORAGE_PROVIDER || "cloudinary").toLowerCase();
const cloudinaryFolder = process.env.CLOUDINARY_FOLDER || "hexscrum-workspace";
const configuredMaxUploadMb = Number(process.env.MAX_UPLOAD_MB || 25);
const maxUploadMb = Number.isFinite(configuredMaxUploadMb) && configuredMaxUploadMb > 0 ? configuredMaxUploadMb : 25;
const maxUploadBytes = maxUploadMb * 1024 * 1024;
const officeConverter = (process.env.OFFICE_CONVERTER || "libreoffice").toLowerCase();
const uploadDir = path.resolve("./test");
const publicUploadDir = path.resolve(process.env.LOCAL_UPLOAD_DIR || "./uploaded-files");
const agoraAppId = process.env.AGORA_APP_ID || "";
const agoraAppCertificate = process.env.AGORA_APP_CERTIFICATE || "";
const configuredAgoraTokenTtlSeconds = Number(process.env.AGORA_RTM_TOKEN_TTL_SECONDS || 3600);
const agoraTokenTtlSeconds =
  Number.isFinite(configuredAgoraTokenTtlSeconds) && configuredAgoraTokenTtlSeconds > 0
    ? configuredAgoraTokenTtlSeconds
    : 3600;

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(publicUploadDir)) {
  fs.mkdirSync(publicUploadDir, { recursive: true });
}

const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET)
);

function cloudinaryConfigFromEnv() {
  if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) {
    return {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    };
  }

  if (process.env.CLOUDINARY_URL) {
    try {
      const parsed = new URL(process.env.CLOUDINARY_URL);
      return {
        cloud_name: parsed.hostname,
        api_key: decodeURIComponent(parsed.username),
        api_secret: decodeURIComponent(parsed.password)
      };
    } catch (err) {
      return null;
    }
  }

  return null;
}

const cloudinaryRuntimeConfig = cloudinaryConfigFromEnv();
const cloudinaryReady = Boolean(
  cloudinaryRuntimeConfig &&
    cloudinaryRuntimeConfig.cloud_name &&
    cloudinaryRuntimeConfig.api_key &&
    cloudinaryRuntimeConfig.api_secret
);

if (cloudinaryReady) {
  cloudinary.config({
    ...cloudinaryRuntimeConfig,
    secure: true
  });
} else if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
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
  if (storageProvider === "cloudinary") return cloudinaryReady;
  return false;
}

function agoraTokenConfigured() {
  return Boolean(agoraAppId && agoraAppCertificate);
}

function buildAgoraRtmToken(uid) {
  const account = String(uid || "").trim();
  if (!account || account.length > 64) {
    const err = new Error("invalid_agora_uid");
    err.statusCode = 400;
    throw err;
  }

  const expiresAt = Math.floor(Date.now() / 1000) + agoraTokenTtlSeconds;
  const token = RtmTokenBuilder.buildToken(
    agoraAppId,
    agoraAppCertificate,
    account,
    RtmRole.Rtm_User,
    expiresAt
  );
  return { token, expiresAt };
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

function copyFile(source, destination) {
  return fs.promises.copyFile(source, destination);
}

function publicFileUrl(req, fileName) {
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("host");
  return `${proto}://${host}/files/${encodeURIComponent(fileName)}`;
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

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs || 180000;
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        HOME: process.env.LIBREOFFICE_HOME || "/tmp",
        TMPDIR: process.env.TMPDIR || "/tmp",
        ...(options.env || {})
      }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("conversion_timeout"));
    }, timeoutMs);

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("error", err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) return resolve();
      const error = new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`);
      error.code = code;
      return reject(error);
    });
  });
}

async function convertWithLibreOffice(inputPath, outputPath) {
  const command = commandExists("libreoffice") ? "libreoffice" : commandExists("soffice") ? "soffice" : "";
  if (!command) {
    throw new Error("converter_not_available");
  }

  const outputDir = path.dirname(outputPath);
  const generatedPath = path.join(outputDir, `${path.basename(inputPath, path.extname(inputPath))}.pdf`);
  const profileDir = path.join(uploadDir, `lo-profile-${path.basename(outputPath, ".pdf")}`);
  await fs.promises.mkdir(profileDir, { recursive: true });

  try {
    await runCommand(command, [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      "--headless",
      "--nologo",
      "--nodefault",
      "--nofirststartwizard",
      "--nolockcheck",
      "--norestore",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      inputPath
    ]);
  } finally {
    fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }

  if (fs.existsSync(outputPath)) return;
  if (fs.existsSync(generatedPath)) {
    await fs.promises.rename(generatedPath, outputPath);
    return;
  }

  throw new Error("conversion_output_missing");
}

async function convertOfficeToPdf(inputPath, outputPath) {
  const hasLibreOffice = commandExists("libreoffice") || commandExists("soffice");
  if (officeConverter === "unoconv" && commandExists("unoconv")) {
    try {
      await convertWithUnoconv(inputPath, outputPath);
      return;
    } catch (err) {
      if (!hasLibreOffice) {
        throw err;
      }
      console.warn("unoconv failed; falling back to LibreOffice:", err.message);
    }
  }
  await convertWithLibreOffice(inputPath, outputPath);
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
  const isPdf = contentType === "application/pdf";
  const cloudinaryPublicId =
    isPdf && !publicId.toLowerCase().endsWith(".pdf") ? `${publicId}.pdf` : publicId;
  const result = await cloudinary.uploader.upload(filePath, {
    folder: cloudinaryFolder,
    public_id: cloudinaryPublicId,
    resource_type: isPdf ? "raw" : "auto",
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
    if (!cloudinaryReady) {
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
    await convertOfficeToPdf(inputPath, outputPath);
    return { outputPath, converted: true, contentType: "application/pdf" };
  }

  throw new Error("unsupported_file_type");
}

const app = express();
let schemaInitError = null;

app.set("trust proxy", true);

auditStore.initSchema().catch(err => {
  schemaInitError = err;
  console.warn("Audit schema initialization skipped or failed:", err.message);
});

app.use(corsMiddleware);
app.use(
  "/files",
  express.static(publicUploadDir, {
    setHeaders(res) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "private, max-age=3600");
    }
  })
);
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
      cloudinaryConfigured: cloudinaryReady,
      cloudinaryEnvPresent: cloudinaryConfigured,
      agoraRtmTokenConfigured: agoraTokenConfigured(),
      converterAvailable: converterAvailable(),
      uploadField: "sampleFile",
      maxUploadMb,
      auditSchemaReady: !schemaInitError
    });
  })
);

app.get(
  "/api/agora/rtm-token",
  asyncRoute(async function(req, res) {
    if (!agoraTokenConfigured()) {
      return res.status(501).json({
        error:
          "Agora RTM token generation is not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE on the backend."
      });
    }

    const uid = String(req.query.uid || "").trim();
    try {
      const result = buildAgoraRtmToken(uid);
      return res.status(200).json({
        uid,
        token: result.token,
        expiresAt: result.expiresAt
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        error: "Invalid Agora RTM uid. Use a non-empty uid up to 64 characters."
      });
    }
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
    const publicFileName = `${publicId}.pdf`;
    let prepared;

    try {
      await moveUploadedFile(sampleFile, inputPath);
      prepared = await preparePdf(inputPath, outputPath, ext);
      const upload = await uploadOutput(prepared.outputPath, publicId, prepared.contentType);
      const publicPath = path.join(publicUploadDir, publicFileName);
      await copyFile(prepared.outputPath, publicPath);
      const servedPdfUrl = publicFileUrl(req, publicFileName);
      const document = req.body.workspaceId
        ? await auditStore.createDocument({
            workspaceId: req.body.workspaceId,
            originalFileName: safeName,
            sourceMimeType: sampleFile.mimetype || "",
            storageUrl: servedPdfUrl,
            convertedPdfUrl: servedPdfUrl,
            uploadedByUserId: req.body.userId || "",
            metadata: {
              size: sampleFile.size,
              converted: prepared.converted,
              storageProvider,
              cloudinaryUrl: upload.secure_url || upload.url,
              cloudinaryPublicId: upload.publicId || "",
              originalMimeType: sampleFile.mimetype || "",
              uploaderName: req.body.userName || "",
              uploaderDesignation: req.body.userDesignation || ""
            }
          })
        : null;

      return res.status(200).json({
        url: servedPdfUrl,
        secure_url: servedPdfUrl,
        cloudinary_url: upload.secure_url || upload.url,
        storageProvider: `${upload.provider}+backend-files`,
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
