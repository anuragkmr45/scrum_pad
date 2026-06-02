const crypto = require("crypto");
const https = require("https");

let Pool;
try {
  Pool = require("pg").Pool;
} catch (err) {
  Pool = null;
}

const databaseUrl = process.env.DATABASE_URL || "";
const hasDatabase = Boolean(databaseUrl && Pool);
const upstashRedisRestUrl = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const upstashRedisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const upstashConfigured = Boolean(upstashRedisRestUrl && upstashRedisRestToken);
const configuredCacheTtlSeconds = Number(process.env.UPSTASH_WORKSPACE_CACHE_TTL_SECONDS || 86400);
const workspaceCacheTtlSeconds =
  Number.isFinite(configuredCacheTtlSeconds) && configuredCacheTtlSeconds > 0
    ? configuredCacheTtlSeconds
    : 86400;
const configuredPresenceTtlSeconds = Number(process.env.UPSTASH_WORKSPACE_PRESENCE_TTL_SECONDS || 45);
const workspacePresenceTtlSeconds =
  Number.isFinite(configuredPresenceTtlSeconds) && configuredPresenceTtlSeconds > 0
    ? configuredPresenceTtlSeconds
    : 45;
const configuredLeadLockTtlSeconds = Number(process.env.UPSTASH_WORKSPACE_LEAD_LOCK_TTL_SECONDS || 90);
const workspaceLeadLockTtlSeconds =
  Number.isFinite(configuredLeadLockTtlSeconds) && configuredLeadLockTtlSeconds > 0
    ? configuredLeadLockTtlSeconds
    : 90;
const pool = hasDatabase
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    })
  : null;

const memory = {
  users: [],
  workspaces: [],
  workspace_members: [],
  workspace_invites: [],
  workspace_presence: {},
  lead_locks: {},
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || "",
    email: user.email || "",
    designation: user.designation || "",
    color: user.color || "",
    created_at: user.created_at || user.createdAt || "",
    updated_at: user.updated_at || user.updatedAt || ""
  };
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
}

function passwordCredentials(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    password_hash: hashPassword(password, salt),
    password_salt: salt
  };
}

function hasPasswordCredentials(user) {
  return Boolean(user && user.password_hash && user.password_salt);
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const expected = hashPassword(password, salt);
  const expectedBuffer = Buffer.from(expected, "hex");
  const hashBuffer = Buffer.from(hash, "hex");
  if (expectedBuffer.length !== hashBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, hashBuffer);
}

const memberColors = [
  "#EB5E28",
  "#403D39",
  "#0F766E",
  "#2563EB",
  "#7C2D12",
  "#7C3AED",
  "#B45309",
  "#047857"
];

function normalizeColor(color) {
  const value = String(color || "").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : "";
}

function workspaceEventCacheKey(workspaceId) {
  return `hexscrum:workspace:${workspaceId}:annotation-events`;
}

function workspacePresenceKey(workspaceId) {
  return `hexscrum:workspace:${workspaceId}:presence`;
}

function workspaceLeadLockKey(workspaceId) {
  return `hexscrum:workspace:${workspaceId}:lead-lock`;
}

function userLeadLockKey(userId) {
  return `hexscrum:user:${userId}:lead-workspace`;
}

function upstashCommand(command, pathSuffix = "") {
  if (!upstashConfigured) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(upstashRedisRestUrl);
    } catch (err) {
      reject(err);
      return;
    }

    const body = JSON.stringify(command);
    const basePath = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: `${basePath}${pathSuffix}` || "/",
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstashRedisRestToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      res => {
        let raw = "";
        res.on("data", chunk => {
          raw += chunk.toString();
        });
        res.on("end", () => {
          try {
            const data = raw ? JSON.parse(raw) : {};
            if (res.statusCode >= 400) {
              const err = new Error(data.error || `upstash_${res.statusCode}`);
              err.statusCode = res.statusCode;
              reject(err);
              return;
            }
            resolve(data);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function upstashPipeline(commands) {
  return upstashCommand(commands, "/pipeline");
}

async function upstashGet(key) {
  const data = await upstashCommand(["GET", key]);
  return data ? data.result : null;
}

async function upstashSet(key, value, ttlSeconds, mode) {
  const command = ["SET", key, value, "EX", ttlSeconds];
  if (mode) command.push(mode);
  const data = await upstashCommand(command);
  return data ? data.result : null;
}

async function upstashDel(key) {
  const data = await upstashCommand(["DEL", key]);
  return data ? data.result : null;
}

function pruneMemoryRealtime() {
  const now = Date.now();
  Object.keys(memory.lead_locks).forEach(key => {
    if (memory.lead_locks[key].expiresAt <= now) delete memory.lead_locks[key];
  });
  Object.keys(memory.workspace_presence).forEach(workspaceId => {
    const users = memory.workspace_presence[workspaceId] || {};
    Object.keys(users).forEach(userId => {
      if (users[userId].expiresAt <= now) delete users[userId];
    });
    if (!Object.keys(users).length) delete memory.workspace_presence[workspaceId];
  });
}

async function cacheAnnotationEvent(event) {
  if (!upstashConfigured || !event || !event.workspace_id) return false;
  const key = workspaceEventCacheKey(event.workspace_id);
  try {
    await upstashPipeline([
      ["LPUSH", key, JSON.stringify(event)],
      ["LTRIM", key, 0, 499],
      ["EXPIRE", key, workspaceCacheTtlSeconds]
    ]);
    return true;
  } catch (err) {
    console.warn("Upstash annotation cache skipped:", err.message);
    return false;
  }
}

async function listCachedAnnotationEvents(workspaceId) {
  if (!upstashConfigured || !workspaceId) return [];
  try {
    const data = await upstashCommand(["LRANGE", workspaceEventCacheKey(workspaceId), 0, 499]);
    const rows = Array.isArray(data && data.result) ? data.result : [];
    return rows
      .map(item => {
        try {
          return JSON.parse(item);
        } catch (err) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
  } catch (err) {
    console.warn("Upstash annotation cache read skipped:", err.message);
    return [];
  }
}

async function acquireLeadLock(body) {
  const workspaceId = body.workspaceId || body.workspace_id || "";
  const userId = body.userId || body.user_id || "";
  if (!workspaceId || !userId) {
    const err = new Error("workspace_and_user_required");
    err.statusCode = 400;
    throw err;
  }

  if (!upstashConfigured) {
    pruneMemoryRealtime();
    const workspaceKey = workspaceLeadLockKey(workspaceId);
    const userKey = userLeadLockKey(userId);
    const workspaceLock = memory.lead_locks[workspaceKey];
    const userLock = memory.lead_locks[userKey];
    if (workspaceLock && workspaceLock.value !== userId) {
      return { acquired: false, reason: "workspace_already_has_lead", leadUserId: workspaceLock.value };
    }
    if (userLock && userLock.value !== workspaceId) {
      return { acquired: false, reason: "lead_already_in_other_workspace", workspaceId: userLock.value };
    }
    const expiresAt = Date.now() + workspaceLeadLockTtlSeconds * 1000;
    memory.lead_locks[workspaceKey] = { value: userId, expiresAt };
    memory.lead_locks[userKey] = { value: workspaceId, expiresAt };
    return { acquired: true, workspaceId, userId, ttlSeconds: workspaceLeadLockTtlSeconds };
  }

  const workspaceKey = workspaceLeadLockKey(workspaceId);
  const userKey = userLeadLockKey(userId);
  const [workspaceLock, userLock] = await Promise.all([
    upstashGet(workspaceKey),
    upstashGet(userKey)
  ]);
  if (workspaceLock && workspaceLock !== userId) {
    return { acquired: false, reason: "workspace_already_has_lead", leadUserId: workspaceLock };
  }
  if (userLock && userLock !== workspaceId) {
    return { acquired: false, reason: "lead_already_in_other_workspace", workspaceId: userLock };
  }

  if (workspaceLock === userId && userLock === workspaceId) {
    await upstashPipeline([
      ["SET", workspaceKey, userId, "EX", workspaceLeadLockTtlSeconds],
      ["SET", userKey, workspaceId, "EX", workspaceLeadLockTtlSeconds]
    ]);
    return { acquired: true, workspaceId, userId, ttlSeconds: workspaceLeadLockTtlSeconds, renewed: true };
  }

  const [workspaceSet, userSet] = await Promise.all([
    upstashSet(workspaceKey, userId, workspaceLeadLockTtlSeconds, "NX"),
    upstashSet(userKey, workspaceId, workspaceLeadLockTtlSeconds, "NX")
  ]);
  if (workspaceSet === "OK" && userSet === "OK") {
    return { acquired: true, workspaceId, userId, ttlSeconds: workspaceLeadLockTtlSeconds };
  }

  const [nextWorkspaceLock, nextUserLock] = await Promise.all([
    upstashGet(workspaceKey),
    upstashGet(userKey)
  ]);
  if (nextWorkspaceLock === userId && nextUserLock === workspaceId) {
    return { acquired: true, workspaceId, userId, ttlSeconds: workspaceLeadLockTtlSeconds, renewed: true };
  }
  if (workspaceSet === "OK") await upstashDel(workspaceKey);
  if (userSet === "OK") await upstashDel(userKey);
  return {
    acquired: false,
    reason: nextUserLock && nextUserLock !== workspaceId ? "lead_already_in_other_workspace" : "workspace_already_has_lead",
    workspaceId: nextUserLock || workspaceId,
    leadUserId: nextWorkspaceLock || ""
  };
}

async function releaseLeadLock(body) {
  const workspaceId = body.workspaceId || body.workspace_id || "";
  const userId = body.userId || body.user_id || "";
  if (!workspaceId || !userId) return { released: false };

  if (!upstashConfigured) {
    pruneMemoryRealtime();
    const workspaceKey = workspaceLeadLockKey(workspaceId);
    const userKey = userLeadLockKey(userId);
    if (memory.lead_locks[workspaceKey] && memory.lead_locks[workspaceKey].value === userId) {
      delete memory.lead_locks[workspaceKey];
    }
    if (memory.lead_locks[userKey] && memory.lead_locks[userKey].value === workspaceId) {
      delete memory.lead_locks[userKey];
    }
    return { released: true, workspaceId, userId };
  }

  const [workspaceLock, userLock] = await Promise.all([
    upstashGet(workspaceLeadLockKey(workspaceId)),
    upstashGet(userLeadLockKey(userId))
  ]);
  const commands = [];
  if (workspaceLock === userId) commands.push(["DEL", workspaceLeadLockKey(workspaceId)]);
  if (userLock === workspaceId) commands.push(["DEL", userLeadLockKey(userId)]);
  if (commands.length) await upstashPipeline(commands);
  return { released: true, workspaceId, userId };
}

async function heartbeatWorkspacePresence(body) {
  const workspaceId = body.workspaceId || body.workspace_id || "";
  const userId = body.userId || body.user_id || "";
  if (!workspaceId || !userId) {
    const err = new Error("workspace_and_user_required");
    err.statusCode = 400;
    throw err;
  }

  const now = nowIso();
  const record = {
    workspaceId,
    userId,
    name: body.name || body.userName || "",
    email: body.email || "",
    designation: body.designation || "",
    role: body.role || "reviewer",
    color: normalizeColor(body.color) || "",
    lastSeenAt: now,
    expiresAt: Date.now() + workspacePresenceTtlSeconds * 1000
  };

  if (!upstashConfigured) {
    pruneMemoryRealtime();
    if (!memory.workspace_presence[workspaceId]) memory.workspace_presence[workspaceId] = {};
    memory.workspace_presence[workspaceId][userId] = record;
  } else {
    await upstashPipeline([
      ["HSET", workspacePresenceKey(workspaceId), userId, JSON.stringify(record)],
      ["EXPIRE", workspacePresenceKey(workspaceId), workspacePresenceTtlSeconds]
    ]);
  }

  if (record.role === "lead") {
    await acquireLeadLock({ workspaceId, userId });
  }

  return { ok: true, presence: record, ttlSeconds: workspacePresenceTtlSeconds };
}

async function listWorkspacePresence(workspaceId) {
  if (!workspaceId) return [];
  const now = Date.now();
  if (!upstashConfigured) {
    pruneMemoryRealtime();
    return Object.values(memory.workspace_presence[workspaceId] || {})
      .filter(item => item.expiresAt > now)
      .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
  }

  try {
    const data = await upstashCommand(["HGETALL", workspacePresenceKey(workspaceId)]);
    const result = data ? data.result : null;
    let rows = [];
    if (Array.isArray(result)) {
      for (let i = 1; i < result.length; i += 2) rows.push(result[i]);
    } else if (result && typeof result === "object") {
      rows = Object.values(result);
    }
    return rows
      .map(value => {
        try {
          return typeof value === "string" ? JSON.parse(value) : value;
        } catch (err) {
          return null;
        }
      })
      .filter(item => item && item.expiresAt > now)
      .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
  } catch (err) {
    console.warn("Upstash presence read skipped:", err.message);
    return [];
  }
}

async function clearWorkspacePresence(body) {
  const workspaceId = body.workspaceId || body.workspace_id || "";
  const userId = body.userId || body.user_id || "";
  if (!workspaceId || !userId) return { ok: false };

  if (!upstashConfigured) {
    if (memory.workspace_presence[workspaceId]) {
      delete memory.workspace_presence[workspaceId][userId];
      if (!Object.keys(memory.workspace_presence[workspaceId]).length) {
        delete memory.workspace_presence[workspaceId];
      }
    }
    return { ok: true };
  }

  await upstashCommand(["HDEL", workspacePresenceKey(workspaceId), userId]);
  return { ok: true };
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
      password_hash TEXT,
      password_salt TEXT,
      last_login_at TIMESTAMPTZ,
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
    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'reviewer',
      color TEXT,
      status TEXT DEFAULT 'active',
      invited_by_user_id TEXT,
      joined_at TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(workspace_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS workspace_invites (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      invited_email TEXT NOT NULL,
      invited_user_id TEXT,
      invited_by_user_id TEXT,
      role TEXT DEFAULT 'reviewer',
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT now(),
      accepted_at TIMESTAMPTZ
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
    CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON workspace_invites(invited_email);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email)) WHERE email IS NOT NULL AND email <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_member_color_active
      ON workspace_members(workspace_id, upper(color))
      WHERE status = 'active' AND color IS NOT NULL AND color <> '';
  `);

  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
  `);

  return { databaseConfigured: true, initialized: true, mode: "postgres" };
}

async function health() {
  if (!pool) {
    return {
      configured: false,
      ok: false,
      mode: "memory",
      upstashConfigured,
      workspaceCacheTtlSeconds,
      workspacePresenceTtlSeconds,
      workspaceLeadLockTtlSeconds
    };
  }
  try {
    await query("SELECT 1", []);
    return {
      configured: true,
      ok: true,
      mode: "postgres",
      upstashConfigured,
      workspaceCacheTtlSeconds,
      workspacePresenceTtlSeconds,
      workspaceLeadLockTtlSeconds
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      mode: "postgres",
      error: "database_unreachable",
      upstashConfigured,
      workspaceCacheTtlSeconds,
      workspacePresenceTtlSeconds,
      workspaceLeadLockTtlSeconds
    };
  }
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (!pool) {
    return memory.users.find(item => normalizeEmail(item.email) === normalized) || null;
  }
  const result = await query("SELECT * FROM users WHERE lower(email) = $1 LIMIT 1", [normalized]);
  return result.rows[0] || null;
}

async function completePasswordlessUser(existing, body, password) {
  const email = normalizeEmail(body.email || existing.email);
  const credentials = passwordCredentials(password);
  const completedUser = {
    ...existing,
    name: body.name || existing.name || email.split("@")[0],
    email,
    designation: body.designation || existing.designation || "",
    color: normalizeColor(body.color) || existing.color || memberColors[0],
    password_hash: credentials.password_hash,
    password_salt: credentials.password_salt,
    updated_at: nowIso()
  };

  if (!pool) {
    Object.assign(existing, completedUser);
    await acceptPendingInvites(existing);
    return serializeUser(existing);
  }

  const result = await query(
    `UPDATE users
     SET name = $2,
         email = $3,
         designation = $4,
         color = $5,
         password_hash = $6,
         password_salt = $7,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      existing.id,
      completedUser.name,
      completedUser.email,
      completedUser.designation,
      completedUser.color,
      completedUser.password_hash,
      completedUser.password_salt
    ]
  );
  await acceptPendingInvites(result.rows[0]);
  return serializeUser(result.rows[0]);
}

async function createAuthUser(body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!email || !email.includes("@")) {
    const err = new Error("invalid_email");
    err.statusCode = 400;
    throw err;
  }
  if (password.length < 6) {
    const err = new Error("weak_password");
    err.statusCode = 400;
    throw err;
  }
  const existing = await findUserByEmail(email);
  if (existing) {
    if (!hasPasswordCredentials(existing)) {
      return completePasswordlessUser(existing, body, password);
    }

    const err = new Error("email_already_registered");
    err.statusCode = 409;
    throw err;
  }

  const credentials = passwordCredentials(password);
  const user = {
    id: body.id || makeId("usr"),
    name: body.name || email.split("@")[0],
    email,
    designation: body.designation || "",
    color: normalizeColor(body.color) || memberColors[0],
    password_hash: credentials.password_hash,
    password_salt: credentials.password_salt,
    created_at: nowIso(),
    updated_at: nowIso()
  };

  if (!pool) {
    memory.users.push(user);
    await acceptPendingInvites(user);
    return serializeUser(user);
  }

  const result = await query(
    `INSERT INTO users (id, name, email, designation, color, password_hash, password_salt)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [user.id, user.name, user.email, user.designation, user.color, user.password_hash, user.password_salt]
  );
  await acceptPendingInvites(result.rows[0]);
  return serializeUser(result.rows[0]);
}

async function authenticateUser(email, password) {
  const user = await findUserByEmail(email);
  if (!user) {
    const err = new Error("invalid_credentials");
    err.statusCode = 401;
    throw err;
  }
  if (!hasPasswordCredentials(user)) {
    if (String(password || "").length < 6) {
      const err = new Error("weak_password");
      err.statusCode = 400;
      throw err;
    }
    return completePasswordlessUser(user, { email }, password);
  }
  if (!verifyPassword(password, user.password_salt, user.password_hash)) {
    const err = new Error("invalid_credentials");
    err.statusCode = 401;
    throw err;
  }
  if (!pool) {
    user.last_login_at = nowIso();
    user.updated_at = nowIso();
    await acceptPendingInvites(user);
    return serializeUser(user);
  }
  const result = await query(
    "UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1 RETURNING *",
    [user.id]
  );
  await acceptPendingInvites(result.rows[0]);
  return serializeUser(result.rows[0]);
}

async function getUserById(userId) {
  if (!userId) return null;
  if (!pool) {
    return serializeUser(memory.users.find(item => item.id === userId));
  }
  const result = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
  return serializeUser(result.rows[0]);
}

async function listUsers(search) {
  const term = String(search || "").trim().toLowerCase();
  if (!pool) {
    return memory.users
      .filter(user => {
        if (!term) return true;
        return (
          String(user.name || "").toLowerCase().includes(term) ||
          String(user.email || "").toLowerCase().includes(term) ||
          String(user.designation || "").toLowerCase().includes(term)
        );
      })
      .slice(0, 20)
      .map(serializeUser);
  }
  const result = term
    ? await query(
        `SELECT id, name, email, designation, color, created_at, updated_at
         FROM users
         WHERE lower(name) LIKE $1 OR lower(email) LIKE $1 OR lower(designation) LIKE $1
         ORDER BY updated_at DESC
         LIMIT 20`,
        [`%${term}%`]
      )
    : await query(
        `SELECT id, name, email, designation, color, created_at, updated_at
         FROM users
         ORDER BY updated_at DESC
         LIMIT 20`,
        []
      );
  return result.rows.map(serializeUser);
}

async function getWorkspaceUsedColors(workspaceId, excludeUserId) {
  if (!pool) {
    return memory.workspace_members
      .filter(item => item.workspace_id === workspaceId && item.status === "active" && item.user_id !== excludeUserId)
      .map(item => normalizeColor(item.color))
      .filter(Boolean);
  }
  const result = await query(
    `SELECT color FROM workspace_members
     WHERE workspace_id = $1 AND status = 'active' AND user_id <> $2`,
    [workspaceId, excludeUserId || ""]
  );
  return result.rows.map(row => normalizeColor(row.color)).filter(Boolean);
}

async function assignWorkspaceColor(workspaceId, userId, requestedColor) {
  const used = new Set((await getWorkspaceUsedColors(workspaceId, userId)).map(color => color.toUpperCase()));
  const requested = normalizeColor(requestedColor);
  if (requested && !used.has(requested)) return requested;
  const fallback = memberColors.find(color => !used.has(color.toUpperCase()));
  return fallback || `#${crypto.createHash("md5").update(`${workspaceId}:${userId}`).digest("hex").slice(0, 6)}`.toUpperCase();
}

async function addWorkspaceMember(body) {
  const workspaceId = body.workspaceId || body.workspace_id || "";
  const userId = body.userId || body.user_id || "";
  if (!workspaceId || !userId) return null;

  const user = await getUserById(userId);
  const member = {
    id: body.id || makeId("mem"),
    workspace_id: workspaceId,
    user_id: userId,
    role: body.role || "reviewer",
    color: await assignWorkspaceColor(workspaceId, userId, body.color || (user && user.color)),
    status: body.status || "active",
    invited_by_user_id: body.invitedByUserId || body.invited_by_user_id || "",
    joined_at: nowIso(),
    created_at: nowIso()
  };

  if (!pool) {
    const existing = memory.workspace_members.find(
      item => item.workspace_id === member.workspace_id && item.user_id === member.user_id
    );
    if (existing) {
      Object.assign(existing, {
        role: member.role || existing.role,
        color: member.color || existing.color,
        status: member.status,
        joined_at: member.joined_at
      });
      return existing;
    }
    memory.workspace_members.push(member);
    return member;
  }

  const result = await query(
    `INSERT INTO workspace_members
      (id, workspace_id, user_id, role, color, status, invited_by_user_id, joined_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET
       role = EXCLUDED.role,
       color = EXCLUDED.color,
       status = EXCLUDED.status,
       joined_at = EXCLUDED.joined_at
     RETURNING *`,
    [
      member.id,
      member.workspace_id,
      member.user_id,
      member.role,
      member.color,
      member.status,
      member.invited_by_user_id,
      member.joined_at
    ]
  );
  return result.rows[0];
}

async function acceptPendingInvites(user) {
  const serialized = serializeUser(user);
  if (!serialized || !serialized.email) return [];
  const email = normalizeEmail(serialized.email);

  if (!pool) {
    const invites = memory.workspace_invites.filter(
      invite => invite.invited_email === email && invite.status === "pending" && !invite.invited_user_id
    );
    for (const invite of invites) {
      invite.status = "accepted";
      invite.accepted_at = nowIso();
      invite.invited_user_id = serialized.id;
      await addWorkspaceMember({
        workspaceId: invite.workspace_id,
        userId: serialized.id,
        role: invite.role || "reviewer",
        invitedByUserId: invite.invited_by_user_id
      });
    }
    return invites;
  }

  const result = await query(
    `UPDATE workspace_invites
     SET status = 'accepted', accepted_at = now(), invited_user_id = $1
     WHERE invited_email = $2
       AND status = 'pending'
       AND (invited_user_id IS NULL OR invited_user_id = '')
     RETURNING *`,
    [serialized.id, email]
  );
  for (const invite of result.rows) {
    await addWorkspaceMember({
      workspaceId: invite.workspace_id,
      userId: serialized.id,
      role: invite.role || "reviewer",
      invitedByUserId: invite.invited_by_user_id
    });
  }
  return result.rows;
}

async function acceptWorkspaceInvite(body) {
  const workspaceId = body.workspaceId || body.workspace_id || "";
  const userId = body.userId || body.user_id || "";
  if (!workspaceId || !userId) return null;

  const user = await getUserById(userId);
  if (!user) return null;
  const email = normalizeEmail(user.email);

  if (!pool) {
    const invite = memory.workspace_invites.find(
      item => item.workspace_id === workspaceId &&
        item.status !== "blocked" &&
        (item.invited_user_id === userId || item.invited_email === email)
    );
    if (!invite) return null;
    invite.status = "accepted";
    invite.accepted_at = invite.accepted_at || nowIso();
    invite.invited_user_id = userId;
    const member = await addWorkspaceMember({
      workspaceId,
      userId,
      role: invite.role || "reviewer",
      invitedByUserId: invite.invited_by_user_id
    });
    return { invite, member };
  }

  const existing = await query(
    `SELECT *
     FROM workspace_invites
     WHERE workspace_id = $1
       AND status <> 'blocked'
       AND (invited_user_id = $2 OR invited_email = $3)
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, userId, email]
  );
  const invite = existing.rows[0];
  if (!invite) return null;

  const accepted = await query(
    `UPDATE workspace_invites
     SET status = 'accepted',
         accepted_at = COALESCE(accepted_at, now()),
         invited_user_id = $2
     WHERE id = $1
     RETURNING *`,
    [invite.id, userId]
  );
  const nextInvite = accepted.rows[0];
  const member = await addWorkspaceMember({
    workspaceId,
    userId,
    role: nextInvite.role || "reviewer",
    invitedByUserId: nextInvite.invited_by_user_id
  });
  return { invite: nextInvite, member };
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
    if (existing) {
      Object.assign(existing, {
        name: row.name || existing.name || "",
        email: row.email || existing.email || "",
        designation: row.designation || existing.designation || "",
        color: row.color || existing.color || "",
        updated_at: nowIso()
      });
    }
    else memory.users.push({ ...row, created_at: nowIso(), updated_at: nowIso() });
    return row;
  }
  await query(
    `INSERT INTO users (id, name, email, designation, color)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name),
       email = COALESCE(NULLIF(EXCLUDED.email, ''), users.email),
       designation = COALESCE(NULLIF(EXCLUDED.designation, ''), users.designation),
       color = COALESCE(NULLIF(EXCLUDED.color, ''), users.color),
       updated_at = now()`,
    [row.id, row.name, row.email, row.designation, row.color]
  );
  return row;
}

async function createWorkspace(body) {
  const joiningUserId =
    body.authUserId ||
    body.auth_user_id ||
    (body.metadata && (body.metadata.authUserId || body.metadata.auth_user_id)) ||
    "";
  const memberRole = body.memberRole || body.member_role || "reviewer";
  const workspace = {
    id: body.id || body.workspaceId || body.workspace_id || makeId("ws"),
    name: body.name || "Untitled Workspace",
    owner_user_id: body.ownerUserId || body.owner_user_id || "",
    status: body.status || "active",
    metadata: body.metadata || {},
    started_at: body.startedAt || body.started_at || nowIso(),
    created_at: nowIso()
  };
  const memberUserId = workspace.owner_user_id || joiningUserId;
  const ensureMember = async workspaceId => {
    if (!memberUserId) return null;
    if (memberRole !== "lead") {
      const accepted = await acceptWorkspaceInvite({
        workspaceId,
        userId: memberUserId
      });
      if (accepted && accepted.member) return accepted.member;
    }
    return addWorkspaceMember({
      workspaceId,
      userId: memberUserId,
      role: memberRole,
      color: workspace.metadata.userColor
    });
  };
  if (!pool) {
    const existing = memory.workspaces.find(item => item.id === workspace.id);
    if (existing) {
      Object.assign(existing, {
        ...workspace,
        owner_user_id: existing.owner_user_id || workspace.owner_user_id
      });
      await ensureMember(existing.id);
      return existing;
    }
    memory.workspaces.push(workspace);
    await ensureMember(workspace.id);
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
  await ensureMember(result.rows[0].id);
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

async function listWorkspacesForUser(userId) {
  if (!userId) return { workspaces: [], invitations: [] };
  if (!pool) {
    const memberships = memory.workspace_members.filter(
      member => member.user_id === userId
    );
    const workspaces = memberships
      .map(member => {
        const workspace = memory.workspaces.find(item => item.id === member.workspace_id);
        if (!workspace) return null;
        return {
          ...workspace,
          member_role: member.role,
          member_color: member.color,
          member_status: member.status || "active",
          member_joined_at: member.joined_at || member.created_at || workspace.created_at,
          participant_count: memory.workspace_members.filter(
            item => item.workspace_id === workspace.id && item.status === "active"
          ).length,
          document_count: memory.documents.filter(item => item.workspace_id === workspace.id).length,
          annotation_event_count: memory.annotation_events.filter(item => item.workspace_id === workspace.id).length
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(b.member_joined_at || b.created_at).localeCompare(String(a.member_joined_at || a.created_at)));
    const user = memory.users.find(item => item.id === userId);
    const invitations = user
      ? memory.workspace_invites.filter(
          invite => invite.invited_email === normalizeEmail(user.email) || invite.invited_user_id === userId
        ).map(invite => {
          const workspace = memory.workspaces.find(item => item.id === invite.workspace_id);
          return {
            ...invite,
            workspace_name: workspace ? workspace.name : ""
          };
        }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      : [];
    return { workspaces, invitations };
  }

  const user = await getUserById(userId);
  const userEmail = user && user.email ? normalizeEmail(user.email) : "";

  const workspaceResult = await query(
    `SELECT
       w.*,
       wm.role AS member_role,
       wm.color AS member_color,
       wm.status AS member_status,
       wm.joined_at AS member_joined_at,
       wm.created_at AS member_created_at,
       (SELECT count(*)::int FROM workspace_members m WHERE m.workspace_id = w.id AND m.status = 'active') AS participant_count,
       (SELECT count(*)::int FROM documents d WHERE d.workspace_id = w.id) AS document_count,
       (SELECT count(*)::int FROM annotation_events e WHERE e.workspace_id = w.id) AS annotation_event_count
     FROM workspaces w
     INNER JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = $1
     ORDER BY COALESCE(wm.joined_at, wm.created_at, w.created_at) DESC`,
    [userId]
  );
  const invitationResult = await query(
    `SELECT wi.*, w.name AS workspace_name
     FROM workspace_invites wi
     LEFT JOIN workspaces w ON w.id = wi.workspace_id
     WHERE wi.invited_user_id = $1 OR wi.invited_email = $2
     ORDER BY wi.created_at DESC`,
    [userId, userEmail]
  );
  return {
    workspaces: workspaceResult.rows,
    invitations: invitationResult.rows
  };
}

async function listWorkspaceMembers(workspaceId) {
  if (!workspaceId) return [];
  if (!pool) {
    return memory.workspace_members
      .filter(member => member.workspace_id === workspaceId)
      .map(member => {
        const user = memory.users.find(item => item.id === member.user_id) || {};
        return {
          ...member,
          user_name: user.name || "",
          user_email: user.email || "",
          user_designation: user.designation || ""
        };
      })
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  const result = await query(
    `SELECT
       wm.*,
       u.name AS user_name,
       u.email AS user_email,
       u.designation AS user_designation
     FROM workspace_members wm
     LEFT JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1
     ORDER BY wm.created_at ASC`,
    [workspaceId]
  );
  return result.rows;
}

async function getWorkspaceMember(workspaceId, userId) {
  if (!workspaceId || !userId) return null;
  if (!pool) {
    return memory.workspace_members.find(
      member => member.workspace_id === workspaceId && member.user_id === userId
    ) || null;
  }

  const result = await query(
    `SELECT *
     FROM workspace_members
     WHERE workspace_id = $1 AND user_id = $2
     LIMIT 1`,
    [workspaceId, userId]
  );
  return result.rows[0] || null;
}

async function updateWorkspaceMemberStatus(body) {
  const workspaceId = body.workspaceId || body.workspace_id || "";
  const userId = body.userId || body.user_id || "";
  const status = String(body.status || "").trim().toLowerCase();
  const allowedStatuses = new Set(["active", "kicked", "blocked", "ended"]);
  if (!workspaceId || !userId || !allowedStatuses.has(status)) {
    const err = new Error("invalid_member_status");
    err.statusCode = 400;
    throw err;
  }

  const workspace = await getWorkspace(workspaceId);
  if (workspace && workspace.owner_user_id === userId && status !== "active") {
    const err = new Error("lead_reviewer_cannot_be_removed");
    err.statusCode = 400;
    throw err;
  }

  if (!pool) {
    const member = memory.workspace_members.find(
      item => item.workspace_id === workspaceId && item.user_id === userId
    );
    if (!member) return null;
    member.status = status;
    member.updated_at = nowIso();
    return member;
  }

  const result = await query(
    `UPDATE workspace_members
     SET status = $3
     WHERE workspace_id = $1 AND user_id = $2
     RETURNING *`,
    [workspaceId, userId, status]
  );
  return result.rows[0] || null;
}

async function inviteWorkspaceUser(body) {
  const workspaceId = body.workspaceId || body.workspace_id || "";
  const invitedUserId = body.userId || body.user_id || body.invitedUserId || body.invited_user_id || "";
  const email = normalizeEmail(body.email || body.invitedEmail || body.invited_email);
  const invitedUser = invitedUserId
    ? await getUserById(invitedUserId)
    : email
      ? await findUserByEmail(email)
      : null;
  if (!workspaceId || !invitedUser) {
    const err = new Error("registered_user_required");
    err.statusCode = 400;
    throw err;
  }

  const invitedEmail = normalizeEmail(invitedUser.email);
  const invite = {
    id: body.id || makeId("inv"),
    workspace_id: workspaceId,
    invited_email: invitedEmail,
    invited_user_id: invitedUser.id,
    invited_by_user_id: body.invitedByUserId || body.invited_by_user_id || "",
    role: body.role || "reviewer",
    status: "pending",
    created_at: nowIso(),
    accepted_at: null
  };

  if (!pool) {
    const existing = memory.workspace_invites.find(
      item => item.workspace_id === workspaceId && item.invited_user_id === invitedUser.id
    );
    if (existing) {
      Object.assign(existing, invite, {
        id: existing.id,
        status: existing.status === "accepted" ? "accepted" : "pending",
        accepted_at: existing.status === "accepted" ? existing.accepted_at : null
      });
      return existing;
    }
    memory.workspace_invites.push(invite);
    return invite;
  }

  const existing = await query(
    `SELECT *
     FROM workspace_invites
     WHERE workspace_id = $1 AND invited_user_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, invitedUser.id]
  );
  if (existing.rows[0]) {
    const result = await query(
      `UPDATE workspace_invites
       SET invited_email = $2,
           invited_by_user_id = $3,
           role = $4,
           status = CASE WHEN status = 'accepted' THEN status ELSE 'pending' END,
           accepted_at = CASE WHEN status = 'accepted' THEN accepted_at ELSE NULL END
       WHERE id = $1
       RETURNING *`,
      [existing.rows[0].id, invite.invited_email, invite.invited_by_user_id, invite.role]
    );
    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO workspace_invites
      (id, workspace_id, invited_email, invited_user_id, invited_by_user_id, role, status, accepted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      invite.id,
      invite.workspace_id,
      invite.invited_email,
      invite.invited_user_id,
      invite.invited_by_user_id,
      invite.role,
      invite.status,
      invite.accepted_at
    ]
  );
  return result.rows[0];
}

async function endWorkspace(workspaceId) {
  if (!workspaceId) return null;
  if (!pool) {
    const workspace = memory.workspaces.find(item => item.id === workspaceId);
    if (!workspace) return null;
    workspace.status = "ended";
    workspace.ended_at = nowIso();
    memory.workspace_members.forEach(member => {
      if (member.workspace_id === workspaceId) member.status = "ended";
    });
    return workspace;
  }
  const result = await query(
    "UPDATE workspaces SET status = 'ended', ended_at = now() WHERE id = $1 RETURNING *",
    [workspaceId]
  );
  await query("UPDATE workspace_members SET status = 'ended' WHERE workspace_id = $1", [workspaceId]);
  return result.rows[0] || null;
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
    cacheAnnotationEvent(event).catch(() => {});
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
  cacheAnnotationEvent(result.rows[0]).catch(() => {});
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

async function listRecentAnnotationEvents(workspaceId) {
  const cached = await listCachedAnnotationEvents(workspaceId);
  if (cached.length) return cached;
  return listAnnotationEvents(workspaceId);
}

async function annotationTimeline(workspaceId, annotationId) {
  const id = String(annotationId || "").trim();
  if (!workspaceId || !id) return [];
  const events = await listAnnotationEvents(workspaceId);
  return events
    .filter(event => String(event.annotation_id || "") === id)
    .map(event => ({
      id: event.id,
      annotationId: event.annotation_id,
      workspaceId: event.workspace_id,
      documentId: event.document_id,
      pageNumber: event.page_number,
      action: event.action,
      toolType: event.tool_type,
      userId: event.user_id,
      userName: event.user_name,
      userDesignation: event.user_designation,
      userColor: event.user_color,
      payload: event.payload_json || {},
      beforeState: event.before_state,
      afterState: event.after_state,
      timestamp: event.occurred_at
    }));
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
  createAuthUser,
  authenticateUser,
  getUserById,
  listUsers,
  createWorkspace,
  getWorkspace,
  listWorkspacesForUser,
  addWorkspaceMember,
  listWorkspaceMembers,
  getWorkspaceMember,
  updateWorkspaceMemberStatus,
  inviteWorkspaceUser,
  acceptWorkspaceInvite,
  endWorkspace,
  acquireLeadLock,
  releaseLeadLock,
  heartbeatWorkspacePresence,
  listWorkspacePresence,
  clearWorkspacePresence,
  createDocument,
  recordAnnotationEvent,
  listAnnotationEvents,
  listRecentAnnotationEvents,
  annotationTimeline,
  saveMeetingNote,
  listMeetingNotes,
  userWiseReport,
  annotationHistoryReport,
  generateArchive
};
