const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const PDFDocument = require("pdfkit");
const pdfParse = require("pdf-parse");

const uploadUrl = process.env.DOC_SMOKE_UPLOAD_URL || "http://localhost:4000/upload";
const workspaceId = process.env.DOC_SMOKE_WORKSPACE_ID || "smoke-workspace";

function writeMultipartBody(filePath, fields) {
  const boundary = `----hexscrum-smoke-${Date.now()}`;
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = {
    ".pdf": "application/pdf",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const chunks = [];

  Object.keys(fields).forEach((name) => {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(`${fields[name]}\r\n`));
  });

  chunks.push(Buffer.from(`--${boundary}\r\n`));
  chunks.push(Buffer.from(`Content-Disposition: form-data; name="sampleFile"; filename="${filename}"\r\n`));
  chunks.push(Buffer.from(`Content-Type: ${mimeMap[ext] || "application/octet-stream"}\r\n\r\n`));
  chunks.push(fs.readFileSync(filePath));
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    body: Buffer.concat(chunks),
    boundary,
  };
}

function requestBuffer(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === "https:" ? https : http;
    const req = client.request(target, options, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${options.method || "GET"} ${url} failed with ${res.statusCode}: ${responseBody.toString("utf8")}`));
          return;
        }
        resolve(responseBody);
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function uploadFixture(filePath) {
  const multipart = writeMultipartBody(filePath, {
    workspaceId,
    userId: "smoke-user",
    userName: "Smoke Test",
    userDesignation: "QA",
    userColor: "#EB5E28",
  });
  const body = await requestBuffer(uploadUrl, {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${multipart.boundary}`,
      "content-length": multipart.body.length,
    },
  }, multipart.body);
  return JSON.parse(body.toString("utf8"));
}

function createMultiPagePdf(filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 36 });
    const stream = fs.createWriteStream(filePath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);
    for (let page = 1; page <= 4; page += 1) {
      doc.addPage({ size: "A4" });
      doc.fontSize(16).text(`HexScrum smoke PDF page ${page}`, 36, 48);
      doc.fontSize(10).text(`Footer alignment marker ${page}`, 36, 780);
    }
    doc.end();
  });
}

function createCsv(filePath, delimiter, rows, cols) {
  const lines = [];
  for (let row = 0; row < rows; row += 1) {
    const values = [];
    for (let col = 0; col < cols; col += 1) {
      values.push(`R${row + 1}C${col + 1}`);
    }
    lines.push(values.join(delimiter));
  }
  fs.writeFileSync(filePath, lines.join("\n"));
}

async function assertPdf(url, minPages) {
  const body = await requestBuffer(url);
  const parsed = await pdfParse(body);
  if (parsed.numpages < minPages) {
    throw new Error(`${url} produced ${parsed.numpages} pages, expected at least ${minPages}`);
  }
  return parsed.numpages;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hexscrum-doc-smoke-"));
  const fixtures = [];
  const pdfPath = path.join(dir, "alignment-multipage.pdf");
  const commaCsvPath = path.join(dir, "comma-grid.csv");
  const tabCsvPath = path.join(dir, "tab-grid.csv");

  await createMultiPagePdf(pdfPath);
  createCsv(commaCsvPath, ",", 60, 14);
  createCsv(tabCsvPath, "\t", 40, 10);

  fixtures.push({ path: pdfPath, minPages: 4, expectedKind: "pdf" });
  fixtures.push({ path: commaCsvPath, minPages: 1, expectedKind: "spreadsheet" });
  fixtures.push({ path: tabCsvPath, minPages: 1, expectedKind: "spreadsheet" });

  [
    "wide-grid.xlsx",
    "tall-grid.xlsx",
    "slides-multipage.pptx",
    "document-multipage.docx",
  ].forEach((name) => {
    const fixturePath = path.join(__dirname, "..", "test", "fixtures", name);
    if (fs.existsSync(fixturePath)) {
      fixtures.push({ path: fixturePath, minPages: 1, expectedKind: name.endsWith(".xlsx") ? "spreadsheet" : "office" });
    }
  });

  for (const fixture of fixtures) {
    const result = await uploadFixture(fixture.path);
    if (fixture.expectedKind && result.documentKind !== fixture.expectedKind) {
      throw new Error(`${path.basename(fixture.path)} returned documentKind=${result.documentKind}`);
    }
    if (fixture.expectedKind === "spreadsheet" && !["grid-fit", "libreoffice-default"].includes(result.conversionProfile)) {
      throw new Error(`${path.basename(fixture.path)} returned conversionProfile=${result.conversionProfile}`);
    }
    if (fixture.expectedKind === "spreadsheet") {
      const firstSheet = result.spreadsheet && result.spreadsheet.model && result.spreadsheet.model.sheets && result.spreadsheet.model.sheets[0];
      if (!result.spreadsheetEditable || !firstSheet) {
        throw new Error(`${path.basename(fixture.path)} did not return an editable spreadsheet model`);
      }
      if (!firstSheet.rowCount || !firstSheet.columnCount) {
        throw new Error(`${path.basename(fixture.path)} returned an empty spreadsheet model`);
      }
    }
    const pages = await assertPdf(result.secure_url || result.url, fixture.minPages);
    console.log(`${path.basename(fixture.path)} ok: ${pages} PDF page(s), ${result.documentKind}/${result.conversionProfile}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
