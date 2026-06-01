const crypto = require("crypto");

let Pool;
try {
  Pool = require("pg").Pool;
} catch (err) {
  Pool = null;
}

const databaseUrl = process.env.DATABASE_URL || "";
const hasDatabase = Boolean(databaseUrl && Pool);
const pool = hasDatabase
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    })
  : null;

const memory = {
  users: [],
  workspaces: [],
  documents: [],
  pages: [],
  annotations: [],
  annotation_events: [],
  meeting_notes: [],
  exports: []
};

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

async function query(sql, params) {
  if (!pool) return null;
  return pool.query(sql, params);
}

async function initSchema() {
  if (!pool) {
    return { databaseConfigured: false, initialized: false, mode: "memory" };
  }

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      designation TEXT,
      color TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id TEXT,
      status TEXT DEFAULT 'active',
      metadata JSONB DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ DEFAULT now(),
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      original_file_name TEXT,
      source_mime_type TEXT,
      storage_url TEXT,
      converted_pdf_url TEXT,
      uploaded_by_user_id TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      page_number INTEGER,
      width NUMERIC,
      height NUMERIC,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      document_id TEXT,
      page_id TEXT,
      created_by_user_id TEXT,
      type TEXT,
      color TEXT,
      payload_json JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      deleted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS annotation_events (
      id TEXT PRIMARY KEY,
      annotation_id TEXT,
      workspace_id TEXT,
      document_id TEXT,
      page_number INTEGER,
      action TEXT,
      tool_type TEXT,
      user_id TEXT,
      user_name TEXT,
      user_designation TEXT,
      user_color TEXT,
      payload_json JSONB DEFAULT '{}'::jsonb,
      before_state JSONB,
      after_state JSONB,
      occurred_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS meeting_notes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      author_user_id TEXT,
      author_name TEXT,
      body TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS exports (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      requested_by_user_id TEXT,
      export_type TEXT,
      storage_url TEXT,
      status TEXT,
      payload_json JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_annotation_events_workspace ON annotation_events(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_meeting_notes_workspace ON meeting_notes(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);
  `);

  return { databaseConfigured: true, initialized: true, mode: "postgres" };
}

async function health() {
  if (!pool) return { configured: false, ok: false, mode: "memory" };
  try {
    await query("SELECT 1", []);
    return { configured: true, ok: true, mode: "postgres" };
  } catch (err) {
    return { configured: true, ok: false, mode: "postgres", error: "database_unreachable" };
  }
}

async function upsertUser(user) {
  if (!user || !user.id) return null;
  const row = {
    id: user.id,
    name: user.name || "",
    email: user.email || "",
    designation: user.designation || "",
    color: user.color || ""
  };
  if (!pool) {
    const existing = memory.users.find(item => item.id === row.id);
    if (existing) Object.assign(existing, row, { updated_at: nowIso() });
    else memory.users.push({ ...row, created_at: nowIso(), updated_at: nowIso() });
    return row;
  }
  await query(
    `INSERT INTO users (id, name, email, designation, color)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       designation = EXCLUDED.designation,
       color = EXCLUDED.color,
       updated_at = now()`,
    [row.id, row.name, row.email, row.designation, row.color]
  );
  return row;
}

async function createWorkspace(body) {
  const workspace = {
    id: body.id || makeId("ws"),
    name: body.name || "Untitled Workspace",
    owner_user_id: body.ownerUserId || body.owner_user_id || "",
    status: body.status || "active",
    metadata: body.metadata || {},
    started_at: body.startedAt || body.started_at || nowIso(),
    created_at: nowIso()
  };
  if (!pool) {
    const existing = memory.workspaces.find(item => item.id === workspace.id);
    if (existing) {
      Object.assign(existing, {
        ...workspace,
        owner_user_id: existing.owner_user_id || workspace.owner_user_id
      });
      return existing;
    }
    memory.workspaces.push(workspace);
    return workspace;
  }
  const result = await query(
    `INSERT INTO workspaces (id, name, owner_user_id, status, metadata, started_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       owner_user_id = COALESCE(NULLIF(workspaces.owner_user_id, ''), EXCLUDED.owner_user_id),
       metadata = workspaces.metadata || EXCLUDED.metadata
     RETURNING *`,
    [workspace.id, workspace.name, workspace.owner_user_id, workspace.status, workspace.metadata, workspace.started_at]
  );
  return result.rows[0];
}

async function getWorkspace(id) {
  if (!pool) {
    const workspace = memory.workspaces.find(item => item.id === id);
    if (!workspace) return null;
    return {
      ...workspace,
      documents: memory.documents.filter(item => item.workspace_id === id),
      meeting_notes: memory.meeting_notes.filter(item => item.workspace_id === id),
      annotation_event_count: memory.annotation_events.filter(item => item.workspace_id === id).length
    };
  }
  const workspace = await query("SELECT * FROM workspaces WHERE id = $1", [id]);
  if (!workspace.rows[0]) return null;
  const documents = await query("SELECT * FROM documents WHERE workspace_id = $1 ORDER BY created_at DESC", [id]);
  const notes = await query("SELECT * FROM meeting_notes WHERE workspace_id = $1 ORDER BY created_at DESC", [id]);
  const events = await query("SELECT count(*)::int AS count FROM annotation_events WHERE workspace_id = $1", [id]);
  return {
    ...workspace.rows[0],
    documents: documents.rows,
    meeting_notes: notes.rows,
    annotation_event_count: events.rows[0].count
  };
}

async function createDocument(body) {
  const document = {
    id: body.id || makeId("doc"),
    workspace_id: body.workspaceId || body.workspace_id || "",
    original_file_name: body.originalFileName || body.original_file_name || "",
    source_mime_type: body.sourceMimeType || body.source_mime_type || "",
    storage_url: body.storageUrl || body.storage_url || "",
    converted_pdf_url: body.convertedPdfUrl || body.converted_pdf_url || body.storageUrl || "",
    uploaded_by_user_id: body.uploadedByUserId || body.uploaded_by_user_id || "",
    metadata: body.metadata || {},
    created_at: nowIso()
  };
  if (!pool) {
    memory.documents.push(document);
    return document;
  }
  const result = await query(
    `INSERT INTO documents
      (id, workspace_id, original_file_name, source_mime_type, storage_url, converted_pdf_url, uploaded_by_user_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      document.id,
      document.workspace_id,
      document.original_file_name,
      document.source_mime_type,
      document.storage_url,
      document.converted_pdf_url,
      document.uploaded_by_user_id,
      document.metadata
    ]
  );
  return result.rows[0];
}

async function recordAnnotationEvent(body) {
  const event = {
    id: body.id || makeId("evt"),
    annotation_id: body.annotationId || body.annotation_id || "",
    workspace_id: body.workspaceId || body.workspace_id || "",
    document_id: body.documentId || body.document_id || "",
    page_number: Number(body.pageNumber || body.page_number || 1),
    action: body.action || "",
    tool_type: body.toolType || body.tool_type || "",
    user_id: body.userId || body.user_id || "",
    user_name: body.userName || body.user_name || "",
    user_designation: body.userDesignation || body.user_designation || "",
    user_color: body.userColor || body.user_color || "",
    payload_json: body.payload || body.payload_json || {},
    before_state: body.beforeState || body.before_state || null,
    after_state: body.afterState || body.after_state || null,
    occurred_at: body.timestamp || body.occurred_at || nowIso()
  };
  await upsertUser({
    id: event.user_id,
    name: event.user_name,
    designation: event.user_designation,
    color: event.user_color
  });
  if (!pool) {
    memory.annotation_events.push(event);
    return event;
  }
  const result = await query(
    `INSERT INTO annotation_events
      (id, annotation_id, workspace_id, document_id, page_number, action, tool_type,
       user_id, user_name, user_designation, user_color, payload_json, before_state, after_state, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      event.id,
      event.annotation_id,
      event.workspace_id,
      event.document_id,
      event.page_number,
      event.action,
      event.tool_type,
      event.user_id,
      event.user_name,
      event.user_designation,
      event.user_color,
      event.payload_json,
      event.before_state,
      event.after_state,
      event.occurred_at
    ]
  );
  return result.rows[0];
}

async function listAnnotationEvents(workspaceId) {
  if (!pool) {
    return memory.annotation_events
      .filter(item => !workspaceId || item.workspace_id === workspaceId)
      .sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
  }
  const result = workspaceId
    ? await query("SELECT * FROM annotation_events WHERE workspace_id = $1 ORDER BY occurred_at ASC", [workspaceId])
    : await query("SELECT * FROM annotation_events ORDER BY occurred_at ASC LIMIT 500", []);
  return result.rows;
}

async function saveMeetingNote(body) {
  const note = {
    id: body.id || makeId("note"),
    workspace_id: body.workspaceId || body.workspace_id || "",
    author_user_id: body.authorUserId || body.author_user_id || "",
    author_name: body.authorName || body.author_name || "",
    body: body.body || "",
    created_at: nowIso(),
    updated_at: nowIso()
  };
  if (!pool) {
    memory.meeting_notes.push(note);
    return note;
  }
  const result = await query(
    `INSERT INTO meeting_notes (id, workspace_id, author_user_id, author_name, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [note.id, note.workspace_id, note.author_user_id, note.author_name, note.body]
  );
  return result.rows[0];
}

async function listMeetingNotes(workspaceId) {
  if (!pool) {
    return memory.meeting_notes
      .filter(item => !workspaceId || item.workspace_id === workspaceId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  const result = workspaceId
    ? await query("SELECT * FROM meeting_notes WHERE workspace_id = $1 ORDER BY created_at DESC", [workspaceId])
    : await query("SELECT * FROM meeting_notes ORDER BY created_at DESC LIMIT 500", []);
  return result.rows;
}

async function userWiseReport(workspaceId) {
  const events = await listAnnotationEvents(workspaceId);
  const groups = {};
  events.forEach(event => {
    const key = event.user_id || event.user_name || "unknown";
    if (!groups[key]) {
      groups[key] = {
        userId: event.user_id || "",
        userName: event.user_name || "Unknown",
        designation: event.user_designation || "",
        color: event.user_color || "",
        total: 0,
        byAction: {},
        byTool: {},
        byPage: {}
      };
    }
    groups[key].total += 1;
    groups[key].byAction[event.action || "unknown"] = (groups[key].byAction[event.action || "unknown"] || 0) + 1;
    groups[key].byTool[event.tool_type || "unknown"] = (groups[key].byTool[event.tool_type || "unknown"] || 0) + 1;
    groups[key].byPage[event.page_number || 1] = (groups[key].byPage[event.page_number || 1] || 0) + 1;
  });
  return Object.values(groups);
}

async function annotationHistoryReport(workspaceId) {
  const events = await listAnnotationEvents(workspaceId);
  return events.map(event => ({
    timestamp: event.occurred_at,
    workspaceId: event.workspace_id,
    documentId: event.document_id,
    pageNumber: event.page_number,
    annotationId: event.annotation_id,
    action: event.action,
    toolType: event.tool_type,
    userId: event.user_id,
    userName: event.user_name,
    userDesignation: event.user_designation,
    userColor: event.user_color
  }));
}

async function generateArchive(body) {
  const workspaceId = body.workspaceId || body.workspace_id;
  const workspace = workspaceId ? await getWorkspace(workspaceId) : null;
  const notes = await listMeetingNotes(workspaceId);
  const annotationEvents = await listAnnotationEvents(workspaceId);
  const userWise = await userWiseReport(workspaceId);
  const history = await annotationHistoryReport(workspaceId);
  const documents = workspaceId
    ? pool
      ? (await query("SELECT * FROM documents WHERE workspace_id = $1 ORDER BY created_at ASC", [workspaceId])).rows
      : memory.documents.filter(item => item.workspace_id === workspaceId)
    : [];
  const manifest = {
    archiveId: makeId("archive"),
    generatedAt: nowIso(),
    workspace,
    documents,
    meetingNotes: notes,
    annotationEvents,
    reports: {
      userWise,
      annotationHistory: history
    },
    limitations:
      "MVP archive is a JSON manifest. It references Cloudinary URLs and metadata; it is not a full binary ZIP archive."
  };
  const exportRow = {
    id: manifest.archiveId,
    workspace_id: workspaceId || "",
    requested_by_user_id: body.requestedByUserId || body.requested_by_user_id || "",
    export_type: "meeting_archive_manifest",
    storage_url: "",
    status: "generated",
    payload_json: manifest,
    created_at: manifest.generatedAt,
    completed_at: manifest.generatedAt
  };
  if (!pool) memory.exports.push(exportRow);
  else {
    await query(
      `INSERT INTO exports (id, workspace_id, requested_by_user_id, export_type, storage_url, status, payload_json, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        exportRow.id,
        exportRow.workspace_id,
        exportRow.requested_by_user_id,
        exportRow.export_type,
        exportRow.storage_url,
        exportRow.status,
        exportRow.payload_json,
        exportRow.completed_at
      ]
    );
  }
  return manifest;
}

module.exports = {
  initSchema,
  health,
  createWorkspace,
  getWorkspace,
  createDocument,
  recordAnnotationEvent,
  listAnnotationEvents,
  saveMeetingNote,
  listMeetingNotes,
  userWiseReport,
  annotationHistoryReport,
  generateArchive
};
