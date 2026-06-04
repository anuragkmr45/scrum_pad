const express = require("express");
const fileUpload = require("express-fileupload");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
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
const configuredSpreadsheetMaxRows = Number(process.env.SPREADSHEET_EDITABLE_MAX_ROWS || 1000);
const configuredSpreadsheetMaxColumns = Number(process.env.SPREADSHEET_EDITABLE_MAX_COLUMNS || 120);
const spreadsheetEditableMaxRows =
  Number.isFinite(configuredSpreadsheetMaxRows) && configuredSpreadsheetMaxRows > 0
    ? configuredSpreadsheetMaxRows
    : 1000;
const spreadsheetEditableMaxColumns =
  Number.isFinite(configuredSpreadsheetMaxColumns) && configuredSpreadsheetMaxColumns > 0
    ? configuredSpreadsheetMaxColumns
    : 120;
const officeConverter = (process.env.OFFICE_CONVERTER || "libreoffice").toLowerCase();
const uploadDir = path.resolve("./test");
const publicUploadDir = path.resolve(process.env.LOCAL_UPLOAD_DIR || "./uploaded-files");
const agoraAppId = process.env.AGORA_APP_ID || "";
const agoraAppCertificate = process.env.AGORA_APP_CERTIFICATE || "";
const authSecret =
  process.env.AUTH_SECRET ||
  process.env.AGORA_APP_CERTIFICATE ||
  process.env.CLOUDINARY_API_SECRET ||
  "hexscrum-dev-auth-secret";
const authSecretConfigured = Boolean(process.env.AUTH_SECRET);
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
const cloudinaryPublicPdfDelivery =
  String(process.env.CLOUDINARY_PUBLIC_PDF_DELIVERY || "").toLowerCase() === "true";

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
const spreadsheetExtensions = new Set([".xls", ".xlsx", ".ods", ".csv"]);
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

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function signTokenSegment(value) {
  return base64UrlEncode(crypto.createHmac("sha256", authSecret).update(value).digest());
}

function createAuthToken(user) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    })
  );
  const body = `${header}.${payload}`;
  return `${body}.${signTokenSegment(body)}`;
}

function verifyAuthToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const expected = signTokenSegment(body);
  const actual = parts[2];
  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

async function readAuthUser(req) {
  const auth = String(req.headers.authorization || "");
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const payload = verifyAuthToken(match[1]);
  if (!payload) return null;
  return auditStore.getUserById(payload.sub);
}

function requireAuth(handler) {
  return asyncRoute(async function(req, res, next) {
    const user = await readAuthUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required." });
    req.user = user;
    return handler(req, res, next);
  });
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
  res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT,PATCH,DELETE");
  res.header("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, Content-Length");
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

function cloudinaryRawFileUrl(fileName) {
  const cloudName = cloudinaryRuntimeConfig && cloudinaryRuntimeConfig.cloud_name;
  if (!cloudName || !fileName) return "";
  const folder = String(cloudinaryFolder || "")
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
  const encodedFileName = encodeURIComponent(path.basename(fileName));
  const folderPrefix = folder ? `${folder}/` : "";
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/raw/upload/${folderPrefix}${encodedFileName}`;
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

function getLibreOfficeCommand() {
  return commandExists("libreoffice") ? "libreoffice" : commandExists("soffice") ? "soffice" : "";
}

let spreadsheetProfileAvailableCache = null;

function spreadsheetProfileAvailable() {
  if (spreadsheetProfileAvailableCache !== null) {
    return spreadsheetProfileAvailableCache;
  }

  const scriptPath = path.join(__dirname, "scripts", "spreadsheet_to_pdf.py");
  const unoCheck = commandExists("python3")
    ? spawnSync("python3", ["-c", "import uno"], { encoding: "utf8" })
    : { status: 1 };

  spreadsheetProfileAvailableCache = Boolean(
    getLibreOfficeCommand() &&
      fs.existsSync(scriptPath) &&
      unoCheck.status === 0
  );

  return spreadsheetProfileAvailableCache;
}

async function detectCsvDelimiter(inputPath) {
  const sample = await fs.promises.readFile(inputPath, { encoding: "utf8" }).catch(() => "");
  const lines = sample
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  const candidates = ["\t", ",", ";"];
  let best = ",";
  let bestScore = -1;

  candidates.forEach(candidate => {
    const score = lines.reduce((sum, line) => sum + (line.split(candidate).length - 1), 0);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  return bestScore > 0 ? best : ",";
}

function csvFilterOptions(delimiter) {
  const codeMap = {
    "\t": 9,
    ",": 44,
    ";": 59
  };
  const separatorCode = codeMap[delimiter] || 44;
  return `${separatorCode},34,76,1`;
}

function createUploadTimer(publicId, fileName) {
  const startedAt = Date.now();
  let lastAt = startedAt;
  const stages = [];
  return {
    mark(stage, extra = {}) {
      const now = Date.now();
      const item = {
        stage,
        deltaMs: now - lastAt,
        totalMs: now - startedAt,
        ...extra
      };
      stages.push(item);
      lastAt = now;
      console.info(
        `[upload:${publicId}] ${stage} +${item.deltaMs}ms total=${item.totalMs}ms file=${fileName}`
      );
      return item;
    },
    stages() {
      return stages.slice();
    }
  };
}

async function convertSpreadsheetToPdf(inputPath, outputPath, ext) {
  const scriptPath = path.join(__dirname, "scripts", "spreadsheet_to_pdf.py");
  const command = getLibreOfficeCommand();
  const csvDelimiter = ext === ".csv" ? await detectCsvDelimiter(inputPath) : "";

  if (!command || !spreadsheetProfileAvailable()) {
    await convertOfficeToPdf(inputPath, outputPath);
    return {
      conversionProfile: "libreoffice-default",
      csvDelimiter
    };
  }

  const profileDir = path.join(uploadDir, `lo-profile-grid-${path.basename(outputPath, ".pdf")}`);
  const port = 21000 + crypto.randomInt(10000);
  await fs.promises.mkdir(profileDir, { recursive: true });

  const listener = spawn(command, [
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    "--headless",
    "--nologo",
    "--nodefault",
    "--nofirststartwizard",
    "--nolockcheck",
    "--norestore",
    `--accept=socket,host=127.0.0.1,port=${port};urp;StarOffice.ComponentContext`
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOME: process.env.LIBREOFFICE_HOME || "/tmp",
      TMPDIR: process.env.TMPDIR || "/tmp"
    }
  });

  let listenerStderr = "";
  listener.stderr.on("data", chunk => {
    listenerStderr += chunk.toString();
  });

  try {
    await runCommand("python3", [
      scriptPath,
      inputPath,
      outputPath,
      ext,
      String(port),
      csvFilterOptions(csvDelimiter)
    ], { timeoutMs: 180000 });
  } catch (err) {
    console.warn(
      "spreadsheet grid-fit conversion failed; falling back to default LibreOffice:",
      err.message,
      listenerStderr.trim()
    );
    await convertOfficeToPdf(inputPath, outputPath);
    return {
      conversionProfile: "libreoffice-default",
      csvDelimiter
    };
  } finally {
    listener.kill("SIGTERM");
    fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }

  if (!fs.existsSync(outputPath)) {
    await convertOfficeToPdf(inputPath, outputPath);
    return {
      conversionProfile: "libreoffice-default",
      csvDelimiter
    };
  }

  return {
    conversionProfile: "grid-fit",
    csvDelimiter
  };
}

async function runSpreadsheetModelScript(args, timeoutMs = 180000) {
  const command = getLibreOfficeCommand();
  const scriptPath = path.join(__dirname, "scripts", "spreadsheet_model.py");
  if (!command || !fs.existsSync(scriptPath)) {
    throw new Error("converter_not_available");
  }

  const profileDir = path.join(uploadDir, `lo-profile-sheet-${crypto.randomBytes(6).toString("hex")}`);
  const port = 22000 + crypto.randomInt(10000);
  await fs.promises.mkdir(profileDir, { recursive: true });

  const listener = spawn(command, [
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    "--headless",
    "--nologo",
    "--nodefault",
    "--nofirststartwizard",
    "--nolockcheck",
    "--norestore",
    `--accept=socket,host=127.0.0.1,port=${port};urp;StarOffice.ComponentContext`
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOME: process.env.LIBREOFFICE_HOME || "/tmp",
      TMPDIR: process.env.TMPDIR || "/tmp"
    }
  });

  let listenerStderr = "";
  listener.stderr.on("data", chunk => {
    listenerStderr += chunk.toString();
  });

  try {
    await runCommand("python3", [
      scriptPath,
      ...args(port)
    ], { timeoutMs });
  } catch (err) {
    const suffix = listenerStderr.trim() ? ` ${listenerStderr.trim()}` : "";
    throw new Error(`${err.message}${suffix}`);
  } finally {
    listener.kill("SIGTERM");
    fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractSpreadsheetModel(inputPath, ext, csvDelimiter) {
  const outputJson = path.join(uploadDir, `spreadsheet-model-${crypto.randomBytes(8).toString("hex")}.json`);
  try {
    await runSpreadsheetModelScript(
      port => [
        "parse",
        inputPath,
        outputJson,
        ext,
        String(port),
        csvFilterOptions(csvDelimiter || ",")
      ],
      180000
    );
    return JSON.parse(await fs.promises.readFile(outputJson, "utf8"));
  } finally {
    deleteFile(outputJson);
  }
}

async function prepareSpreadsheetUpload(inputPath, outputPath, ext) {
  const outputJson = path.join(uploadDir, `spreadsheet-prepare-${crypto.randomBytes(8).toString("hex")}.json`);
  const csvDelimiter = ext === ".csv" ? await detectCsvDelimiter(inputPath) : "";
  try {
    await runSpreadsheetModelScript(
      port => [
        "prepare",
        inputPath,
        outputPath,
        outputJson,
        ext,
        String(port),
        csvFilterOptions(csvDelimiter || ","),
        String(spreadsheetEditableMaxRows),
        String(spreadsheetEditableMaxColumns)
      ],
      180000
    );
    if (!fs.existsSync(outputPath)) {
      throw new Error("spreadsheet_pdf_missing");
    }
    let model = null;
    let modelError = "";
    try {
      model = JSON.parse(await fs.promises.readFile(outputJson, "utf8"));
      modelError = model && model.modelError ? String(model.modelError) : "";
      if (!model || !Array.isArray(model.sheets) || !model.sheets.length) {
        model = null;
        modelError = modelError || "spreadsheet_model_unavailable";
      }
    } catch (err) {
      model = null;
      modelError = err.message || "spreadsheet_model_unavailable";
    }
    return {
      outputPath,
      converted: true,
      contentType: "application/pdf",
      documentKind: "spreadsheet",
      conversionProfile: "grid-fit",
      sourceExtension: ext,
      csvDelimiter,
      spreadsheetModel: model,
      spreadsheetModelError: modelError,
      truncated: Boolean(model && model.truncated),
      editableLimits: {
        maxRows: spreadsheetEditableMaxRows,
        maxColumns: spreadsheetEditableMaxColumns
      }
    };
  } finally {
    deleteFile(outputJson);
  }
}

async function exportSpreadsheetModel(model, outputPath, format) {
  const inputJson = path.join(uploadDir, `spreadsheet-export-${crypto.randomBytes(8).toString("hex")}.json`);
  try {
    await fs.promises.writeFile(inputJson, JSON.stringify(model || { sheets: [] }), "utf8");
    await runSpreadsheetModelScript(
      port => [
        "export",
        inputJson,
        outputPath,
        format === "pdf" ? "pdf" : "xlsx",
        String(port)
      ],
      180000
    );
    if (!fs.existsSync(outputPath)) {
      throw new Error("spreadsheet_export_missing");
    }
    const stat = await fs.promises.stat(outputPath);
    if (!stat.size || stat.size < 512) {
      throw new Error("spreadsheet_export_empty");
    }
    if (format === "xlsx") {
      const handle = await fs.promises.open(outputPath, "r");
      try {
        const signature = Buffer.alloc(4);
        await handle.read(signature, 0, 4, 0);
        if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
          throw new Error("spreadsheet_export_invalid_xlsx");
        }
      } finally {
        await handle.close();
      }
    }
  } finally {
    deleteFile(inputJson);
  }
}

function spreadsheetModelHasVisibleContent(model) {
  const sheets = Array.isArray(model && model.sheets) ? model.sheets : [];
  return sheets.some(sheet => {
    const cells = sheet && sheet.cells && typeof sheet.cells === "object" ? sheet.cells : {};
    const hasCellValue = Object.keys(cells).some(key => {
      const cell = cells[key] || {};
      return String(cell.value || "").trim() ||
        String(cell.fillColor || "").trim() ||
        String(cell.textColor || "").trim();
    });
    const hasOverlays = Array.isArray(sheet && sheet.overlays) && sheet.overlays.length > 0;
    return hasCellValue || hasOverlays;
  });
}

function convertImageToPdf(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    let image;
    try {
      image = doc.openImage(inputPath);
    } catch (err) {
      reject(err);
      return;
    }
    const padding = 36;
    const pageWidth = image.width + padding * 2;
    const pageHeight = image.height + padding * 2;
    const stream = fs.createWriteStream(outputPath);

    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);

    doc.pipe(stream);
    doc.addPage({ size: [pageWidth, pageHeight], margin: 0 });
    doc.image(inputPath, padding, padding, {
      width: image.width,
      height: image.height
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
    return {
      outputPath: inputPath,
      converted: false,
      contentType: "application/pdf",
      documentKind: "pdf",
      conversionProfile: "source-pdf",
      sourceExtension: ext
    };
  }

  if (imageExtensions.has(ext)) {
    await convertImageToPdf(inputPath, outputPath);
    return {
      outputPath,
      converted: true,
      contentType: "application/pdf",
      documentKind: "image",
      conversionProfile: "image-pdf",
      sourceExtension: ext
    };
  }

  if (spreadsheetExtensions.has(ext)) {
    if (!converterAvailable()) {
      throw new Error("converter_not_available");
    }
    if (spreadsheetProfileAvailable()) {
      try {
        return await prepareSpreadsheetUpload(inputPath, outputPath, ext);
      } catch (err) {
        console.warn("spreadsheet prepare failed; falling back to PDF-only conversion:", err.message);
      }
    }
    const profile = await convertSpreadsheetToPdf(inputPath, outputPath, ext);
    return {
      outputPath,
      converted: true,
      contentType: "application/pdf",
      documentKind: "spreadsheet",
      conversionProfile: profile.conversionProfile,
      sourceExtension: ext,
      csvDelimiter: profile.csvDelimiter,
      spreadsheetModel: null,
      spreadsheetModelError: "spreadsheet_editable_model_unavailable",
      truncated: false,
      editableLimits: {
        maxRows: spreadsheetEditableMaxRows,
        maxColumns: spreadsheetEditableMaxColumns
      }
    };
  }

  if (officeExtensions.has(ext)) {
    if (!converterAvailable()) {
      throw new Error("converter_not_available");
    }
    await convertOfficeToPdf(inputPath, outputPath);
    return {
      outputPath,
      converted: true,
      contentType: "application/pdf",
      documentKind: "office",
      conversionProfile: "office-pdf",
      sourceExtension: ext
    };
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
app.get("/files/:fileName", function(req, res) {
  if (!cloudinaryPublicPdfDelivery) {
    return res.status(404).send(`Cannot GET /files/${req.params.fileName}`);
  }
  const fallbackUrl = cloudinaryRawFileUrl(req.params.fileName);
  if (!fallbackUrl) {
    return res.status(404).send(`Cannot GET /files/${req.params.fileName}`);
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  return res.redirect(302, fallbackUrl);
});
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
      upstashConfigured: db.upstashConfigured,
      workspaceCacheTtlSeconds: db.workspaceCacheTtlSeconds,
      workspacePresenceTtlSeconds: db.workspacePresenceTtlSeconds,
      workspaceLeadLockTtlSeconds: db.workspaceLeadLockTtlSeconds,
      cloudinaryConfigured: cloudinaryReady,
      cloudinaryEnvPresent: cloudinaryConfigured,
      agoraRtmTokenConfigured: agoraTokenConfigured(),
      authSecretConfigured,
      converterAvailable: converterAvailable(),
      spreadsheetProfileAvailable: spreadsheetProfileAvailable(),
      uploadField: "sampleFile",
      maxUploadMb,
      spreadsheetEditableMaxRows,
      spreadsheetEditableMaxColumns,
      auditSchemaReady: !schemaInitError
    });
  })
);

app.post(
  "/api/auth/register",
  asyncRoute(async function(req, res) {
    const user = await auditStore.createAuthUser(req.body || {});
    return res.status(201).json({
      user,
      token: createAuthToken(user)
    });
  })
);

app.post(
  "/api/auth/login",
  asyncRoute(async function(req, res) {
    const user = await auditStore.authenticateUser(req.body.email || "", req.body.password || "");
    return res.status(200).json({
      user,
      token: createAuthToken(user)
    });
  })
);

app.get(
  "/api/auth/me",
  requireAuth(async function(req, res) {
    return res.status(200).json({ user: req.user });
  })
);

app.get(
  "/api/users",
  requireAuth(async function(req, res) {
    const users = await auditStore.listUsers(req.query.q || req.query.search || "");
    return res.status(200).json({ users });
  })
);

app.get(
  "/api/workspaces",
  requireAuth(async function(req, res) {
    const result = await auditStore.listWorkspacesForUser(req.user.id);
    return res.status(200).json(result);
  })
);

app.post(
  "/api/workspaces/:id/lead-lock",
  requireAuth(async function(req, res) {
    const result = await auditStore.acquireLeadLock({
      workspaceId: req.params.id,
      userId: req.user.id
    });
    return res.status(result.acquired ? 200 : 409).json(result);
  })
);

app.delete(
  "/api/workspaces/:id/lead-lock",
  requireAuth(async function(req, res) {
    const result = await auditStore.releaseLeadLock({
      workspaceId: req.params.id,
      userId: req.user.id
    });
    return res.status(200).json(result);
  })
);

app.post(
  "/api/workspaces/:id/presence",
  requireAuth(async function(req, res) {
    const member = await auditStore.getWorkspaceMember(req.params.id, req.user.id);
    if (member && ["kicked", "blocked", "ended"].includes(member.status)) {
      return res.status(403).json({
        error: "workspace_access_removed",
        status: member.status
      });
    }
    const result = await auditStore.heartbeatWorkspacePresence({
      workspaceId: req.params.id,
      userId: req.user.id,
      name: req.user.name,
      email: req.user.email,
      designation: req.user.designation,
      color: req.body.color || req.user.color,
      role: req.body.role || "reviewer"
    });
    return res.status(200).json({
      ...result,
      memberStatus: member ? member.status : "active"
    });
  })
);

app.get(
  "/api/workspaces/:id/presence",
  requireAuth(async function(req, res) {
    const participants = await auditStore.listWorkspacePresence(req.params.id);
    return res.status(200).json({ participants });
  })
);

app.delete(
  "/api/workspaces/:id/presence",
  requireAuth(async function(req, res) {
    const result = await auditStore.clearWorkspacePresence({
      workspaceId: req.params.id,
      userId: req.user.id
    });
    return res.status(200).json(result);
  })
);

async function requireWorkspaceSpreadsheetAccess(req, res) {
  const member = await auditStore.getWorkspaceMember(req.params.id, req.user.id);
  if (!member || ["kicked", "blocked", "ended"].includes(member.status)) {
    res.status(403).json({ error: "workspace_access_denied" });
    return null;
  }
  return member;
}

app.get(
  "/api/workspaces/:id/documents/:documentId/spreadsheet",
  requireAuth(async function(req, res) {
    const member = await requireWorkspaceSpreadsheetAccess(req, res);
    if (!member) return;
    const state = await auditStore.getSpreadsheetState(req.params.id, req.params.documentId);
    if (!state) return res.status(404).json({ error: "spreadsheet_not_found" });
    return res.status(200).json({
      documentId: state.document_id,
      workspaceId: state.workspace_id,
      revision: state.revision || 0,
      model: state.model_json || {}
    });
  })
);

app.patch(
  "/api/workspaces/:id/documents/:documentId/spreadsheet/ops",
  requireAuth(async function(req, res) {
    const member = await requireWorkspaceSpreadsheetAccess(req, res);
    if (!member) return;
    const result = await auditStore.applySpreadsheetOperations({
      workspaceId: req.params.id,
      documentId: req.params.documentId,
      operations: req.body.operations || req.body.ops || [],
      operation: req.body.operation,
      userId: req.user.id,
      userName: req.user.name
    });
    return res.status(200).json({
      documentId: req.params.documentId,
      workspaceId: req.params.id,
      revision: result.revision,
      operations: result.operations,
      model: result.model
    });
  })
);

app.post(
  "/api/workspaces/:id/documents/:documentId/spreadsheet/export",
  requireAuth(async function(req, res) {
    const member = await requireWorkspaceSpreadsheetAccess(req, res);
    if (!member) return;
    const state = await auditStore.getSpreadsheetState(req.params.id, req.params.documentId);
    if (!state) return res.status(404).json({ error: "spreadsheet_not_found" });
    const format = String(req.body.format || req.query.format || "pdf").toLowerCase() === "xlsx" ? "xlsx" : "pdf";
    if (!spreadsheetModelHasVisibleContent(state.model_json || {})) {
      return res.status(422).json({ error: "Spreadsheet export is empty. Add cell content or overlay annotations before exporting." });
    }
    const extension = format === "xlsx" ? "xlsx" : "pdf";
    const outputPath = path.join(uploadDir, `spreadsheet-export-${crypto.randomBytes(8).toString("hex")}.${extension}`);
    await exportSpreadsheetModel(state.model_json || {}, outputPath, format);
    const filename = `hexscrum-spreadsheet-${req.params.documentId}.${extension}`;
    res.setHeader(
      "Content-Type",
      format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.sendFile(outputPath, err => {
      deleteFile(outputPath);
      if (err && !res.headersSent) {
        res.status(500).json({ error: "spreadsheet_export_failed" });
      }
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

    if (!sampleFile.size) {
      return res.status(400).json({ error: "Uploaded file is empty. Re-select the document and upload again." });
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
    let uploadTiming = createUploadTimer(publicId, safeName);

    try {
      await moveUploadedFile(sampleFile, inputPath);
      uploadTiming.mark("file_save", { bytes: sampleFile.size });
      prepared = await preparePdf(inputPath, outputPath, ext);
      uploadTiming.mark("prepare_pdf", {
        documentKind: prepared.documentKind,
        conversionProfile: prepared.conversionProfile,
        editable: Boolean(prepared.spreadsheetModel)
      });
      const upload = await uploadOutput(prepared.outputPath, publicId, prepared.contentType);
      uploadTiming.mark("storage_upload", { provider: upload.provider });
      const publicPath = path.join(publicUploadDir, publicFileName);
      await copyFile(prepared.outputPath, publicPath);
      const servedPdfUrl = publicFileUrl(req, publicFileName);
      uploadTiming.mark("local_pdf_copy");
      const spreadsheetModel = prepared.spreadsheetModel || null;
      const spreadsheetModelError = prepared.spreadsheetModelError || "";
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
              documentKind: prepared.documentKind,
              conversionProfile: prepared.conversionProfile,
              sourceExtension: prepared.sourceExtension,
              csvDelimiter: prepared.csvDelimiter || "",
              spreadsheetEditable: Boolean(spreadsheetModel),
              spreadsheetModelError,
              spreadsheetTruncated: Boolean(prepared.truncated),
              spreadsheetEditableLimits: prepared.editableLimits || {},
              storageProvider,
              backendFileUrl: servedPdfUrl,
              cloudinaryUrl: upload.secure_url || upload.url,
              cloudinaryPublicId: upload.publicId || "",
              originalMimeType: sampleFile.mimetype || "",
              uploaderName: req.body.userName || "",
              uploaderDesignation: req.body.userDesignation || "",
              uploadTiming: uploadTiming.stages()
            }
          })
        : null;
      uploadTiming.mark("db_document_save", { hasDocument: Boolean(document) });
      let spreadsheet = null;
      if (document && spreadsheetModel) {
        const state = await auditStore.saveSpreadsheetState({
          workspaceId: document.workspace_id || req.body.workspaceId,
          documentId: document.id,
          revision: 0,
          model: spreadsheetModel
        });
        spreadsheet = {
          documentId: document.id,
          workspaceId: document.workspace_id || req.body.workspaceId,
          revision: state.revision || 0,
          model: spreadsheetModel
        };
      }
      uploadTiming.mark("spreadsheet_state_save", { editable: Boolean(spreadsheet) });

      uploadTiming.mark("response");
      return res.status(200).json({
        url: servedPdfUrl,
        secure_url: servedPdfUrl,
        cloudinary_url: upload.secure_url || upload.url,
        backend_file_url: servedPdfUrl,
        storageProvider: `${upload.provider}+backend-files`,
        originalName: safeName,
        mimeType: sampleFile.mimetype || "",
        size: sampleFile.size,
        converted: prepared.converted,
        documentKind: prepared.documentKind,
        conversionProfile: prepared.conversionProfile,
        sourceExtension: prepared.sourceExtension,
        csvDelimiter: prepared.csvDelimiter || "",
        spreadsheetEditable: Boolean(spreadsheet),
        spreadsheetModelError,
        spreadsheetWarning: spreadsheetModelError
          ? "Spreadsheet PDF fallback was created, but editable grid mode could not be prepared."
          : "",
        spreadsheetTruncated: Boolean(prepared.truncated),
        spreadsheetEditableLimits: prepared.editableLimits || {},
        uploadTiming: uploadTiming.stages(),
        document,
        spreadsheet
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
    const requestUser = await readAuthUser(req);
    const body = req.body || {};
    const metadata = body.metadata || {};
    const ownerUserId =
      body.ownerUserId ||
      body.owner_user_id ||
      (requestUser && body.memberRole === "lead" ? requestUser.id : "");
    const workspace = await auditStore.createWorkspace({
      ...body,
      ownerUserId
    });
    let member = null;
    if (requestUser) {
      const acceptedInvite = await auditStore.acceptWorkspaceInvite({
        workspaceId: workspace.id,
        userId: requestUser.id
      });
      member = acceptedInvite && acceptedInvite.member
        ? acceptedInvite.member
        : await auditStore.addWorkspaceMember({
            workspaceId: workspace.id,
            userId: requestUser.id,
            role: body.memberRole || (workspace.owner_user_id === requestUser.id ? "lead" : "reviewer"),
            color: body.userColor || metadata.userColor || requestUser.color
          });
    }
    res.status(201).json({ workspace, member });
  })
);

app.post(
  "/api/workspaces/:id/invites",
  requireAuth(async function(req, res) {
    const workspace = await auditStore.getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });
    if (workspace.owner_user_id && workspace.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: "Only the lead reviewer can share this workspace." });
    }
    const invitedUserId = req.body.userId || req.body.user_id || req.body.invitedUserId || req.body.invited_user_id;
    if (!invitedUserId) {
      return res.status(400).json({ error: "Select a registered reviewer before sending an invite." });
    }
    if (invitedUserId === req.user.id) {
      return res.status(400).json({ error: "Lead reviewer is already in this workspace." });
    }
    const invite = await auditStore.inviteWorkspaceUser({
      workspaceId: req.params.id,
      userId: invitedUserId,
      role: req.body.role || "reviewer",
      invitedByUserId: req.user.id
    });
    return res.status(201).json({ invite });
  })
);

app.get(
  "/api/workspaces/:id/members",
  requireAuth(async function(req, res) {
    const workspace = await auditStore.getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });
    if (workspace.owner_user_id && workspace.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: "Only the lead reviewer can view participant controls." });
    }
    const members = await auditStore.listWorkspaceMembers(req.params.id);
    return res.status(200).json({ members });
  })
);

app.patch(
  "/api/workspaces/:id/members/:userId",
  requireAuth(async function(req, res) {
    const workspace = await auditStore.getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });
    if (workspace.owner_user_id && workspace.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: "Only the lead reviewer can manage participants." });
    }
    const member = await auditStore.updateWorkspaceMemberStatus({
      workspaceId: req.params.id,
      userId: req.params.userId,
      status: req.body.status
    });
    if (!member) return res.status(404).json({ error: "Workspace member not found." });
    return res.status(200).json({ member });
  })
);

app.post(
  "/api/workspaces/:id/end",
  requireAuth(async function(req, res) {
    const workspace = await auditStore.getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });
    if (workspace.owner_user_id && workspace.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: "Only the lead reviewer can end this workspace." });
    }
    const ended = await auditStore.endWorkspace(req.params.id);
    await auditStore.releaseLeadLock({
      workspaceId: req.params.id,
      userId: req.user.id
    });
    return res.status(200).json({ workspace: ended });
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

app.get(
  "/api/annotations/recent",
  asyncRoute(async function(req, res) {
    const events = await auditStore.listRecentAnnotationEvents(req.query.workspaceId || "");
    res.status(200).json({ events });
  })
);

app.get(
  "/api/annotations/:annotationId/timeline",
  asyncRoute(async function(req, res) {
    const events = await auditStore.annotationTimeline(req.query.workspaceId || "", req.params.annotationId);
    res.status(200).json({ annotationId: req.params.annotationId, events });
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
  const status = err.statusCode || 500;
  const messages = {
    invalid_email: "Enter a valid email address.",
    weak_password: "Password must be at least 6 characters.",
    email_already_registered: "This email is already registered.",
    account_password_not_set: "This account exists but has no password yet. Use Create account once with this email to set the password.",
    invalid_credentials: "Email or password is incorrect.",
    workspace_and_email_required: "Workspace and email are required."
  };
  res.status(status).json({ error: messages[err.message] || (status >= 500 ? "Internal API error." : err.message) });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`HexScrum converter API running on port ${PORT}`);
  });
}

module.exports = app;
