import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import net from "net";
import tls from "tls";
import { createServer as createViteServer } from "vite";
import cookieParser from "cookie-parser";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pg from "pg";
import { registerType } from "pgvector/pg";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change_me_in_env";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const useSecureCookies = process.env.NODE_ENV === "production";
const hasDatabase = Boolean(process.env.DATABASE_URL || process.env.PG_VECTOR_URL);
const hasVectorDatabase = Boolean(process.env.PG_VECTOR_URL);

app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());

const VectorPool = new pg.Pool({
  connectionString: process.env.PG_VECTOR_URL || undefined,
});

const DBPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.PG_VECTOR_URL || undefined,
});

VectorPool.on("connect", async (client) => {
  try {
    await registerType(client);
  } catch (err) {
    console.error("Failed to register pgvector type:", err);
  }
});

function requireDatabase(res: express.Response) {
  if (!hasDatabase) {
    res.status(503).json({
      error: "Database is not configured. Set DATABASE_URL or PG_VECTOR_URL.",
    });
    return false;
  }
  return true;
}

function requireVectorDatabase(res: express.Response) {
  if (!hasVectorDatabase) {
    res.status(503).json({
      error: "PG_VECTOR_URL is not configured.",
    });
    return false;
  }
  return true;
}

function requireGemini(res: express.Response) {
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({
      error: "GEMINI_API_KEY is not configured.",
    });
    return false;
  }
  return true;
}

function parseAiJson(text: string | undefined) {
  const raw = String(text || "").trim();
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned || "{}");
}

async function withDb<T>(fn: (client: pg.PoolClient) => Promise<T>) {
  const client = await DBPool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function withVector<T>(fn: (client: pg.PoolClient) => Promise<T>) {
  const client = await VectorPool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function getRecordList(entity: string) {
  return withDb(async (client) => {
    const result = await client.query(
      "SELECT data FROM crm_records WHERE entity = $1 ORDER BY updated_at DESC",
      [entity],
    );
    return result.rows.map((row) => row.data);
  });
}

async function getRecord(entity: string, id: string) {
  return withDb(async (client) => {
    const result = await client.query(
      "SELECT data FROM crm_records WHERE entity = $1 AND id = $2",
      [entity, id],
    );
    return result.rows[0]?.data;
  });
}

async function upsertRecord(entity: string, id: string, data: unknown) {
  return withDb(async (client) => {
    await client.query(
      `
      INSERT INTO crm_records (entity, id, data, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (entity, id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
      `,
      [entity, id, JSON.stringify(data)],
    );
  });
}

async function deleteRecord(entity: string, id: string) {
  return withDb(async (client) => {
    await client.query("DELETE FROM crm_records WHERE entity = $1 AND id = $2", [
      entity,
      id,
    ]);
  });
}

async function initDB() {
  if (!hasDatabase) {
    console.warn("DATABASE_URL/PG_VECTOR_URL is not configured. DB APIs will return 503.");
    return;
  }

  await withDb(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS crm_records (
        entity VARCHAR(80) NOT NULL,
        id VARCHAR(120) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (entity, id)
      );
    `);

    const count = await client.query("SELECT COUNT(*) FROM system_users");
    if (Number(count.rows[0].count) === 0) {
      const defaultPassword = await bcrypt.hash("password", 10);
      await client.query(
        `
        INSERT INTO system_users (id, name, email, password_hash, role, status)
        VALUES
        ('usr_1', 'System Admin', 'admin@acmecorp.com', $1, 'superadmin', 'Active'),
        ('usr_2', 'Alice Sales', 'alice@acmecorp.com', $1, 'sales', 'Active'),
        ('usr_3', 'Charlie Support', 'charlie@acmecorp.com', $1, 'support', 'Active');
        `,
        [defaultPassword],
      );
    }
  });
}

initDB().catch((err) => {
  console.error("Failed to initialize database:", err);
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: { headers: { "User-Agent": "AgentCRM" } },
});

type ModelProvider = "openai" | "anthropic" | "google" | "openrouter" | "custom";

type ModelProfile = {
  id?: string;
  name?: string;
  provider?: ModelProvider;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
};

function providerApiKey(profile: ModelProfile) {
  if (profile.apiKey) return profile.apiKey;
  if (profile.provider === "openai" || profile.provider === "custom") {
    return process.env.OPENAI_API_KEY || "";
  }
  if (profile.provider === "openrouter") {
    return process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
  }
  if (profile.provider === "anthropic") return process.env.ANTHROPIC_API_KEY || "";
  return process.env.GEMINI_API_KEY || "";
}

function requireModelProfile(profile: ModelProfile, res: express.Response) {
  const provider = profile.provider || "google";
  const model = profile.model || (provider === "google" ? GEMINI_MODEL : "");
  const apiKey = providerApiKey({ ...profile, provider });

  if (!model) {
    res.status(400).json({ error: "Selected model profile does not include a model name." });
    return null;
  }
  if (!apiKey) {
    res.status(503).json({
      error: `API key is not configured for model profile "${profile.name || model}". Add it in Settings or set the matching server environment secret.`,
    });
    return null;
  }

  return { ...profile, provider, model, apiKey };
}

async function generateWithModelProfile(
  profile: Required<Pick<ModelProfile, "provider" | "model" | "apiKey">> & ModelProfile,
  agentInstructions: string,
  prompt: string,
) {
  const temperature = profile.temperature ?? 0.4;
  const instructions =
    agentInstructions ||
    "You are a CRM automation agent. Execute tasks carefully and report concise operational logs.";

  if (profile.provider === "google") {
    const profileAi = new GoogleGenAI({
      apiKey: profile.apiKey,
      httpOptions: { headers: { "User-Agent": "AgentCRM" } },
    });
    const response = await profileAi.models.generateContent({
      model: profile.model,
      contents: `${instructions}\n\n${prompt}`,
      config: { responseMimeType: "application/json", temperature },
    });
    return response.text || "";
  }

  if (profile.provider === "anthropic") {
    const response = await fetch(profile.baseUrl || "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": profile.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: profile.model,
        max_tokens: 1000,
        temperature,
        system: instructions,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error?.message || `Anthropic request failed with HTTP ${response.status}.`);
    }
    return data.content?.map((part: any) => part.text).filter(Boolean).join("\n") || "";
  }

  const baseUrl =
    profile.baseUrl ||
    (profile.provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1");
  const endpoint = baseUrl.replace(/\/$/, "").endsWith("/chat/completions")
    ? baseUrl.replace(/\/$/, "")
    : `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${profile.apiKey}`,
      ...(profile.provider === "openrouter"
        ? { "HTTP-Referer": "https://agentcrm.local", "X-Title": "AgentCRM" }
        : {}),
    },
    body: JSON.stringify({
      model: profile.model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI-compatible request failed with HTTP ${response.status}.`);
  }
  return data.choices?.[0]?.message?.content || "";
}

app.post("/api/login", async (req, res) => {
  if (!requireDatabase(res)) return;

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const user = await withDb(async (client) => {
      const result = await client.query(
        "SELECT * FROM system_users WHERE email = $1",
        [String(email).toLowerCase()],
      );
      return result.rows[0];
    });

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.cookie("crm_token", token, {
      httpOnly: true,
      secure: useSecureCookies,
      sameSite: useSecureCookies ? "none" : "lax",
      maxAge: 86400000,
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err: any) {
    console.error("Login Auth Error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/api/logout", (_req, res) => {
  res.clearCookie("crm_token", {
    secure: useSecureCookies,
    sameSite: useSecureCookies ? "none" : "lax",
  });
  res.json({ success: true });
});

const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.cookies?.crm_token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
};

app.put("/api/users/profile", authMiddleware, async (req: any, res) => {
  if (!requireDatabase(res)) return;

  const { name, email, password } = req.body;
  const userId = req.user.id;

  try {
    const updatedUser = await withDb(async (client) => {
      if (password) {
        const hashed = await bcrypt.hash(password, 10);
        await client.query(
          "UPDATE system_users SET name = $1, email = $2, password_hash = $3 WHERE id = $4",
          [name, email, hashed, userId],
        );
      } else {
        await client.query(
          "UPDATE system_users SET name = $1, email = $2 WHERE id = $3",
          [name, email, userId],
        );
      }

      const result = await client.query(
        "SELECT id, name, email, role, status FROM system_users WHERE id = $1",
        [userId],
      );
      return result.rows[0];
    });

    const token = jwt.sign(
      { id: updatedUser.id, email: updatedUser.email, role: updatedUser.role },
      JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.cookie("crm_token", token, {
      httpOnly: true,
      secure: useSecureCookies,
      sameSite: useSecureCookies ? "none" : "lax",
      maxAge: 86400000,
    });

    res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Failed to update profile." });
  }
});

app.get("/api/config/vector", async (_req, res) => {
  if (!hasVectorDatabase) {
    return res.json({
      configured: false,
      status: "Not Configured",
      details: "PG_VECTOR_URL is not set in environment secrets.",
    });
  }

  try {
    const status = await withVector(async (client) => {
      const result = await client.query(
        "SELECT extname FROM pg_extension WHERE extname = 'vector'",
      );
      return result.rows.length > 0 ? "Operational" : "Warning";
    });

    res.json({
      configured: true,
      status,
      details:
        status === "Operational"
          ? "Connected to Postgres with pgvector."
          : "Connected to Postgres, but pgvector extension is missing.",
    });
  } catch (err: any) {
    res.json({ configured: true, status: "Error", details: err.message });
  }
});

app.post("/api/vector/init", async (_req, res) => {
  if (!requireVectorDatabase(res)) return;
  try {
    await withVector(async (client) => {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      await client.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id bigserial PRIMARY KEY,
          title text,
          content text,
          embedding vector(1536),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    });
    res.json({ success: true, message: "Vector database initialized." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function crudRoutes(entity: string, route: string) {
  app.get(route, async (_req, res) => {
    if (!requireDatabase(res)) return;
    try {
      res.json(await getRecordList(entity));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get(`${route}/:id`, async (req, res) => {
    if (!requireDatabase(res)) return;
    try {
      const record = await getRecord(entity, req.params.id);
      record ? res.json(record) : res.status(404).json({ error: "Not found." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(route, async (req, res) => {
    if (!requireDatabase(res)) return;
    const id = req.body.id || `${entity}_${Date.now()}`;
    const data = { ...req.body, id };
    try {
      await upsertRecord(entity, id, data);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put(`${route}/:id`, async (req, res) => {
    if (!requireDatabase(res)) return;
    const data = { ...req.body, id: req.params.id };
    try {
      await upsertRecord(entity, req.params.id, data);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(`${route}/:id`, async (req, res) => {
    if (!requireDatabase(res)) return;
    try {
      await deleteRecord(entity, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

crudRoutes("customers", "/api/crm/customers");
crudRoutes("products", "/api/crm/products");
crudRoutes("quotes", "/api/crm/quotes");
crudRoutes("inbox_messages", "/api/communication/inbox");
crudRoutes("agent_pending_actions", "/api/agent/actions/pending");
crudRoutes("knowledge_documents", "/api/knowledge");
crudRoutes("email_signatures", "/api/email/signatures");
crudRoutes("email_mappings", "/api/email/mappings");

type MailSecurity = "ssl" | "starttls" | "none";

type MailSocket = net.Socket | tls.TLSSocket;

const MAIL_CONNECT_TIMEOUT_MS = 8000;
const MAIL_RESPONSE_TIMEOUT_MS = 8000;
const IMAP_SYNC_VERSION = "imap-sync-v9-html-body";

function escapeImapString(value: string) {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function normalizeMailSecurity(security: unknown, port: number): MailSecurity {
  if (security === "ssl" || security === "starttls" || security === "none") return security;
  if (port === 993 || port === 465) return "ssl";
  if (port === 143 || port === 587) return "starttls";
  return "ssl";
}

function connectMailSocket(options: {
  host: string;
  port: number;
  secure: boolean;
  rejectUnauthorized: boolean;
}): Promise<MailSocket> {
  return new Promise((resolve, reject) => {
    const socket = options.secure
      ? tls.connect({
          host: options.host,
          port: options.port,
          servername: options.host,
          rejectUnauthorized: options.rejectUnauthorized,
        })
      : net.connect({ host: options.host, port: options.port });
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Connection timed out."));
    }, MAIL_CONNECT_TIMEOUT_MS);
    socket.once(options.secure ? "secureConnect" : "connect", () => {
      clearTimeout(timeout);
      socket.setTimeout(MAIL_RESPONSE_TIMEOUT_MS);
      resolve(socket);
    });
    socket.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Connection timed out."));
    });
  });
}

function createLineReader(socket: MailSocket) {
  let buffer = "";
  const pending: Array<{ resolve: (line: string) => void }> = [];
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    while (pending.length > 0) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) break;
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      pending.shift()?.resolve(line);
    }
  });
  return (stage = "unlabeled IMAP response") =>
    new Promise<string>((resolve, reject) => {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        resolve(line);
        return;
      }
      const pendingItem = {
        resolve: (line: string) => {
          clearTimeout(timer);
          resolve(line);
        },
      };
      const timer = setTimeout(() => {
        const index = pending.indexOf(pendingItem);
        if (index >= 0) pending.splice(index, 1);
        reject(new Error(`Timed out waiting for ${stage}.`));
      }, MAIL_RESPONSE_TIMEOUT_MS);
      pending.push(pendingItem);
    });
}

function writeLine(socket: MailSocket, line: string) {
  socket.write(`${line}\r\n`);
}

async function readSmtpResponse(readLine: () => Promise<string>) {
  const lines: string[] = [];
  let line = await readLine();
  lines.push(line);
  while (/^\d{3}-/.test(line)) {
    line = await readLine();
    lines.push(line);
  }
  return lines;
}

async function upgradeToTls(socket: MailSocket, host: string, rejectUnauthorized: boolean) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect({
      socket,
      servername: host,
      rejectUnauthorized,
    });
    secureSocket.once("secureConnect", () => resolve(secureSocket));
    secureSocket.once("error", reject);
  });
}

function assertMailConfig(host: string, port: unknown, user?: string, pass?: string) {
  if (!host?.trim()) throw new Error("Host is required.");
  const parsedPort = Number(port);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    throw new Error("A valid port is required.");
  }
  if (!user?.trim()) throw new Error("Username is required.");
  if (!pass) throw new Error("Password is required.");
  return parsedPort;
}

function encodeMimeHeader(value: string) {
  const text = String(value || "");
  return /[^\x20-\x7e]/.test(text)
    ? `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`
    : text.replace(/\r?\n/g, " ");
}

function normalizeEmailRecipients(value: unknown) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  const recipients = raw
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.match(/<([^>]+)>/)?.[1]?.trim() || item);
  return Array.from(new Set(recipients));
}

function extractEmailAddress(value: string) {
  return value.match(/<([^>]+)>/)?.[1]?.trim() || value.trim();
}

function formatFromHeader(value: string) {
  const trimmed = value.trim();
  const address = extractEmailAddress(trimmed);
  const name = trimmed.includes("<") ? trimmed.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "") : "";
  return name ? `${encodeMimeHeader(name)} <${address}>` : address;
}

function dotStuffSmtpData(value: string) {
  return String(value || "")
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function stripHtmlForEmail(value: string) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function authenticateSmtp(
  socket: MailSocket,
  readLine: () => Promise<string>,
  smtpUser: string,
  smtpPass: string,
) {
  writeLine(socket, "AUTH LOGIN");
  let response = await readSmtpResponse(readLine);
  if (/^334/.test(response[0])) {
    writeLine(socket, Buffer.from(smtpUser).toString("base64"));
    response = await readSmtpResponse(readLine);
    if (!/^334/.test(response[0])) throw new Error(`SMTP username was not accepted: ${response.join(" ")}`);
    writeLine(socket, Buffer.from(smtpPass).toString("base64"));
    response = await readSmtpResponse(readLine);
  } else {
    const authPlain = Buffer.from(`\0${smtpUser}\0${smtpPass}`).toString("base64");
    writeLine(socket, `AUTH PLAIN ${authPlain}`);
    response = await readSmtpResponse(readLine);
  }
  if (!/^235/.test(response[0])) throw new Error(`SMTP authentication failed: ${response.join(" ")}`);
}

async function openSmtpSession(profile: {
  smtpHost: string;
  smtpPort: string;
  smtpSecurity?: MailSecurity;
  smtpRejectUnauthorized?: boolean;
  smtpUser: string;
  smtpPass: string;
}) {
  const port = assertMailConfig(profile.smtpHost || "", profile.smtpPort, profile.smtpUser, profile.smtpPass);
  const security = normalizeMailSecurity(profile.smtpSecurity, port);
  let socket = await connectMailSocket({
    host: profile.smtpHost,
    port,
    secure: security === "ssl",
    rejectUnauthorized: profile.smtpRejectUnauthorized !== false,
  });
  let readLine = createLineReader(socket);
  let response = await readSmtpResponse(readLine);
  if (!/^220/.test(response[0])) throw new Error(`Unexpected SMTP greeting: ${response.join(" ")}`);

  writeLine(socket, "EHLO agentcrm.local");
  response = await readSmtpResponse(readLine);
  if (!/^250/.test(response[0])) throw new Error(`SMTP EHLO failed: ${response.join(" ")}`);

  if (security === "starttls") {
    writeLine(socket, "STARTTLS");
    response = await readSmtpResponse(readLine);
    if (!/^220/.test(response[0])) throw new Error(`SMTP STARTTLS failed: ${response.join(" ")}`);
    socket = await upgradeToTls(socket, profile.smtpHost, profile.smtpRejectUnauthorized !== false);
    readLine = createLineReader(socket);
    writeLine(socket, "EHLO agentcrm.local");
    response = await readSmtpResponse(readLine);
    if (!/^250/.test(response[0])) throw new Error(`SMTP EHLO after STARTTLS failed: ${response.join(" ")}`);
  }

  await authenticateSmtp(socket, readLine, profile.smtpUser, profile.smtpPass);
  return { socket, readLine };
}

app.post("/api/email/test-imap", async (req, res) => {
  const {
    imapHost,
    imapPort,
    imapSecurity = "ssl",
    imapRejectUnauthorized = true,
    imapUser,
    imapPass,
  } = req.body as {
    imapHost?: string;
    imapPort?: string;
    imapSecurity?: MailSecurity;
    imapRejectUnauthorized?: boolean;
    imapUser?: string;
    imapPass?: string;
  };

  let socket: MailSocket | undefined;
  try {
    const port = assertMailConfig(imapHost || "", imapPort, imapUser, imapPass);
    const security = normalizeMailSecurity(imapSecurity, port);
    socket = await connectMailSocket({
      host: imapHost!,
      port,
      secure: security === "ssl",
      rejectUnauthorized: imapRejectUnauthorized !== false,
    });
    let readLine = createLineReader(socket);
    const greeting = await readLine();
    if (!/^\* OK/i.test(greeting)) throw new Error(`Unexpected IMAP greeting: ${greeting}`);

    if (security === "starttls") {
      writeLine(socket, "a001 STARTTLS");
      const startTlsLine = await readLine();
      if (!/^a001 OK/i.test(startTlsLine)) throw new Error(`IMAP STARTTLS failed: ${startTlsLine}`);
      socket = await upgradeToTls(socket, imapHost!, imapRejectUnauthorized !== false);
      readLine = createLineReader(socket);
    }

    writeLine(socket, `a002 LOGIN ${escapeImapString(imapUser!)} ${escapeImapString(imapPass!)}`);
    let loginLine = await readLine();
    while (!/^a002 /i.test(loginLine)) loginLine = await readLine();
    if (!/^a002 OK/i.test(loginLine)) throw new Error(`IMAP login failed: ${loginLine}`);
    writeLine(socket, "a003 LOGOUT");
    res.json({ success: true, message: `Connected to ${imapHost}:${port} and authenticated with IMAP.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "IMAP connection test failed." });
  } finally {
    socket?.destroy();
  }
});

function parseEmailAddress(value = "") {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || decodeMimeHeader(value)).trim();
}

function decodeHeaderBuffer(buffer: Buffer, charset: string) {
  const normalized = charset.toLowerCase().replace(/_/g, "-");
  if (normalized === "utf-8" || normalized === "utf8") return buffer.toString("utf8");
  if (normalized === "us-ascii" || normalized === "ascii") return buffer.toString("ascii");
  if (normalized === "iso-8859-1" || normalized === "latin1") return buffer.toString("latin1");
  try {
    return new TextDecoder(normalized).decode(buffer);
  } catch {
    return buffer.toString("utf8");
  }
}

function decodeQuotedPrintableWord(value: string) {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "=" && /^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
      bytes.push(parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(value[index] === "_" ? 32 : value.charCodeAt(index));
  }
  return Buffer.from(bytes);
}

function decodeQuotedPrintableText(value: string) {
  const normalized = value.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === "=" && /^[0-9a-f]{2}$/i.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(parseInt(normalized.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(normalized.charCodeAt(index));
  }
  return Buffer.from(bytes);
}

function decodeMimeHeader(value = "") {
  return value
    .replace(/(\?=)\s+(=\?)/g, "$1$2")
    .replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_, charset: string, encoding: string, encoded: string) => {
      try {
        const buffer = encoding.toLowerCase() === "b"
          ? Buffer.from(encoded, "base64")
          : decodeQuotedPrintableWord(encoded);
        return decodeHeaderBuffer(buffer, charset);
      } catch {
        return _;
      }
    });
}

function parseHeaderBlock(lines: string[]) {
  const headers: Record<string, string> = {};
  let current = "";
  const headerStartIndex = lines.findIndex((line) => /BODY\[(?:HEADER|RFC822\.HEADER)/i.test(line));
  const headerLines = headerStartIndex >= 0 ? lines.slice(headerStartIndex + 1) : lines;
  for (const line of headerLines) {
    if (/BODY\[(?:TEXT|1(?:\.TEXT)?)\]/i.test(line) || line === ")") break;
    if (!line.trim() || line === ")" || line.startsWith("* ") || /^[a-z]\d+\s/i.test(line)) continue;
    if (/^\s/.test(line) && current) {
      headers[current] = `${headers[current]} ${line.trim()}`;
      continue;
    }
    const separator = line.indexOf(":");
    if (separator > 0) {
      current = line.slice(0, separator).toLowerCase();
      headers[current] = line.slice(separator + 1).trim();
    }
  }
  for (const [key, value] of Object.entries(headers)) {
    headers[key] = decodeMimeHeader(value);
  }
  return headers;
}

function extractFetchedBodyLines(lines: string[]) {
  const startIndex = lines.findIndex((line) => /BODY\[(?:TEXT|1(?:\.TEXT)?)\]/i.test(line));
  if (startIndex === -1) return [];
  const bodyLines: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (line === ")" || /^[a-z]\d+\s/i.test(line)) break;
    bodyLines.push(line);
  }
  return bodyLines;
}

function parseMimeHeaderText(text: string) {
  const headers: Record<string, string> = {};
  let current = "";
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) break;
    if (/^\s/.test(line) && current) {
      headers[current] = `${headers[current]} ${line.trim()}`;
      continue;
    }
    const separator = line.indexOf(":");
    if (separator > 0) {
      current = line.slice(0, separator).toLowerCase();
      headers[current] = line.slice(separator + 1).trim();
    }
  }
  for (const [key, value] of Object.entries(headers)) {
    headers[key] = decodeMimeHeader(value);
  }
  return headers;
}

function splitMimePart(rawPart: string) {
  const separatorMatch = rawPart.match(/\r?\n\r?\n/);
  if (!separatorMatch || separatorMatch.index === undefined) return { headers: {}, body: rawPart.trim() };
  const headerText = rawPart.slice(0, separatorMatch.index);
  const body = rawPart.slice(separatorMatch.index + separatorMatch[0].length);
  return { headers: parseMimeHeaderText(headerText), body: body.trim() };
}

function decodeBodyText(rawBody: string, contentType = "", transferEncoding = "") {
  const charset = contentType.match(/charset="?([^";\s]+)"?/i)?.[1] || "utf-8";
  let text = rawBody.trim();
  try {
    if (transferEncoding.toLowerCase().includes("base64")) {
      text = decodeHeaderBuffer(Buffer.from(text.replace(/\s+/g, ""), "base64"), charset);
    } else if (transferEncoding.toLowerCase().includes("quoted-printable")) {
      text = decodeHeaderBuffer(decodeQuotedPrintableText(text), charset);
    } else {
      text = decodeHeaderBuffer(Buffer.from(text, "utf8"), charset);
    }
  } catch {
    text = rawBody.trim();
  }
  return text;
}

function cleanEmailPreview(text: string) {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

function decodeEmailBody(headers: Record<string, string>, lines: string[]) {
  const rawBody = lines.join("\n").trim();
  if (!rawBody) return { text: "", html: "" };
  const contentType = headers["content-type"] || "";
  const boundary =
    contentType.match(/boundary="?([^";]+)"?/i)?.[1] ||
    rawBody.match(/^--([^\r\n-][^\r\n]*)/m)?.[1]?.trim();

  if (boundary) {
    const parts = rawBody
      .split(`--${boundary}`)
      .map((part) => part.trim())
      .filter((part) => part && part !== "--");
    const parsedParts = parts.map(splitMimePart);
    const htmlPart = parsedParts.find((part) => /text\/html/i.test(part.headers["content-type"] || ""));
    const plainPart = parsedParts.find((part) => /text\/plain/i.test(part.headers["content-type"] || ""));
    const preferredPart =
      htmlPart ||
      plainPart ||
      parsedParts.find((part) => part.body.trim());
    if (preferredPart) {
      const decodedBody = decodeBodyText(
        preferredPart.body,
        preferredPart.headers["content-type"] || "",
        preferredPart.headers["content-transfer-encoding"] || "",
      );
      const text = cleanEmailPreview(decodedBody);
      if (text) {
        return {
          text,
          html: htmlPart && preferredPart === htmlPart ? decodedBody : "",
        };
      }
    }
  }

  const decodedBody = decodeBodyText(
    rawBody,
    contentType,
    headers["content-transfer-encoding"] || "",
  );
  return {
    text: cleanEmailPreview(decodedBody),
    html: /text\/html/i.test(contentType) ? decodedBody : "",
  };
}

function parseFetchedHeaderBlocks(lines: string[]) {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (/^\* \d+ FETCH/i.test(line)) {
      if (current.length > 0) blocks.push(current);
      current = [line];
      continue;
    }
    if (current.length > 0) current.push(line);
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

async function openImapSession(profile: any) {
  const port = assertMailConfig(profile.imapHost || "", profile.imapPort, profile.imapUser, profile.imapPass);
  const security = normalizeMailSecurity(profile.imapSecurity, port);
  let socket = await connectMailSocket({
    host: profile.imapHost,
    port,
    secure: security === "ssl",
    rejectUnauthorized: profile.imapRejectUnauthorized !== false,
  });
  let readLine = createLineReader(socket);
  const greeting = await readLine("IMAP greeting");
  if (!/^\* OK/i.test(greeting)) throw new Error(`Unexpected IMAP greeting from ${profile.name || profile.imapHost}: ${greeting}`);

  if (security === "starttls") {
    writeLine(socket, "a001 STARTTLS");
    const startTlsLine = await readLine("IMAP STARTTLS response");
    if (!/^a001 OK/i.test(startTlsLine)) throw new Error(`IMAP STARTTLS failed: ${startTlsLine}`);
    socket = await upgradeToTls(socket, profile.imapHost, profile.imapRejectUnauthorized !== false);
    readLine = createLineReader(socket);
  }

  writeLine(socket, `a002 LOGIN ${escapeImapString(profile.imapUser)} ${escapeImapString(profile.imapPass)}`);
  let loginLine = await readLine("IMAP login response");
  while (!/^a002 /i.test(loginLine)) loginLine = await readLine("IMAP login response");
  if (!/^a002 OK/i.test(loginLine)) throw new Error(`IMAP login failed for ${profile.name || profile.imapHost}: ${loginLine}`);
  return { socket, readLine };
}

app.post("/api/email/sync-imap", async (req, res) => {
  const { mappings = [], receiveProfiles = [], limit = 25 } = req.body as {
    mappings?: Array<{ id: string; name: string; receiveProfileId: string }>;
    receiveProfiles?: any[];
    limit?: number;
  };
  const emails: any[] = [];
  const errors: string[] = [];
  const maxPerAccount = Math.max(1, Math.min(Number(limit || 25), 100));

  for (const mapping of mappings) {
    const profile = receiveProfiles.find((item) => item.id === mapping.receiveProfileId);
    if (!profile?.imapHost || !profile?.imapUser) continue;
    let socket: MailSocket | undefined;
    try {
      const session = await openImapSession(profile);
      socket = session.socket;
      const readLine = session.readLine;

      writeLine(socket, "a003 SELECT INBOX");
      const selectLines: string[] = [];
      let line = await readLine("INBOX selection response");
      while (!/^a003 /i.test(line)) {
        selectLines.push(line);
        line = await readLine("INBOX selection response");
      }
      if (!/^a003 OK/i.test(line)) throw new Error(`Cannot select INBOX: ${line}`);

      const existsLine = selectLines.find((item) => /^\* \d+ EXISTS/i.test(item));
      const existsCount = Number(existsLine?.match(/^\* (\d+) EXISTS/i)?.[1] || 0);
      if (existsCount === 0) {
        writeLine(socket, "a006 LOGOUT");
        continue;
      }

      const startSeq = Math.max(1, existsCount - maxPerAccount + 1);
      writeLine(socket, `a004 FETCH ${startSeq}:${existsCount} (UID BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.100000>)`);
      const fetchLines: string[] = [];
      line = await readLine("latest email header response");
      while (!/^a004 /i.test(line)) {
        fetchLines.push(line);
        line = await readLine("latest email header response");
      }
      if (!/^a004 OK/i.test(line)) throw new Error(`Cannot fetch latest email headers: ${line}`);

      for (const block of parseFetchedHeaderBlocks(fetchLines)) {
        const headers = parseHeaderBlock(block);
        const bodyContent = decodeEmailBody(headers, extractFetchedBodyLines(block));
        const blockText = block.join("\n");
        const sequence = blockText.match(/^\* (\d+) FETCH/im)?.[1];
        const uid = blockText.match(/UID (\d+)/i)?.[1] || sequence || `${Date.now()}`;
        const sender = parseEmailAddress(headers.from || profile.imapUser);
        const target = parseEmailAddress(headers.to || profile.imapUser);
        const subject = headers.subject || "(No subject)";
        const date = headers.date ? new Date(headers.date) : new Date();
        emails.push({
          id: `email_${profile.id}_${uid}`,
          sender,
          target,
          intent: "Email",
          subject,
          summary: bodyContent.text || subject,
          bodyHtml: bodyContent.html,
          channel: "Email",
          date: Number.isNaN(date.getTime()) ? new Date().toLocaleString() : date.toLocaleString(),
          read: false,
        });
      }
      writeLine(socket, "a006 LOGOUT");
    } catch (err: any) {
      errors.push(`${profile?.name || profile?.imapHost || "IMAP"}: ${err.message}`);
    } finally {
      socket?.destroy();
    }
  }

  if (emails.length === 0 && errors.length > 0) {
    return res.status(400).json({ error: errors.join(" | "), emails: [], syncVersion: IMAP_SYNC_VERSION });
  }
  res.json({ success: true, emails, errors, syncVersion: IMAP_SYNC_VERSION });
});

app.post("/api/email/test-smtp", async (req, res) => {
  const {
    smtpHost,
    smtpPort,
    smtpSecurity = "ssl",
    smtpRejectUnauthorized = true,
    smtpUser,
    smtpPass,
  } = req.body as {
    smtpHost?: string;
    smtpPort?: string;
    smtpSecurity?: MailSecurity;
    smtpRejectUnauthorized?: boolean;
    smtpUser?: string;
    smtpPass?: string;
  };

  let socket: MailSocket | undefined;
  try {
    const port = assertMailConfig(smtpHost || "", smtpPort, smtpUser, smtpPass);
    const session = await openSmtpSession({
      smtpHost: smtpHost!,
      smtpPort: String(port),
      smtpSecurity,
      smtpRejectUnauthorized,
      smtpUser: smtpUser!,
      smtpPass: smtpPass!,
    });
    socket = session.socket;
    writeLine(socket, "QUIT");
    res.json({ success: true, message: `Connected to ${smtpHost}:${port} and authenticated with SMTP.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "SMTP connection test failed." });
  } finally {
    socket?.destroy();
  }
});

app.post("/api/email/send-smtp", async (req, res) => {
  const {
    profile,
    to,
    subject,
    text,
    html,
  } = req.body as {
    profile?: {
      smtpHost?: string;
      smtpPort?: string;
      smtpSecurity?: MailSecurity;
      smtpRejectUnauthorized?: boolean;
      smtpUser?: string;
      smtpPass?: string;
      fromAddress?: string;
    };
    to?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
  };

  let socket: MailSocket | undefined;
  try {
    if (!profile) throw new Error("SMTP profile is required.");
    const recipients = normalizeEmailRecipients(to);
    if (recipients.length === 0) throw new Error("At least one recipient is required.");
    if (!subject?.trim()) throw new Error("Subject is required.");

    const fromAddress = (profile.fromAddress || profile.smtpUser || "").trim();
    const envelopeFrom = extractEmailAddress(fromAddress);
    if (!fromAddress) throw new Error("From address is required.");

    const session = await openSmtpSession({
      smtpHost: profile.smtpHost || "",
      smtpPort: profile.smtpPort || "",
      smtpSecurity: profile.smtpSecurity,
      smtpRejectUnauthorized: profile.smtpRejectUnauthorized,
      smtpUser: profile.smtpUser || "",
      smtpPass: profile.smtpPass || "",
    });
    socket = session.socket;
    const readLine = session.readLine;

    writeLine(socket, `MAIL FROM:<${envelopeFrom}>`);
    let response = await readSmtpResponse(readLine);
    if (!/^250/.test(response[0])) throw new Error(`SMTP MAIL FROM failed: ${response.join(" ")}`);

    for (const recipient of recipients) {
      writeLine(socket, `RCPT TO:<${recipient}>`);
      response = await readSmtpResponse(readLine);
      if (!/^(250|251)/.test(response[0])) throw new Error(`SMTP RCPT TO failed for ${recipient}: ${response.join(" ")}`);
    }

    writeLine(socket, "DATA");
    response = await readSmtpResponse(readLine);
    if (!/^354/.test(response[0])) throw new Error(`SMTP DATA failed: ${response.join(" ")}`);

    const messageId = `<${Date.now()}.${Math.random().toString(16).slice(2)}@agentcrm.local>`;
    const hasHtml = Boolean(html?.trim());
    const textBody = text?.trim() || stripHtmlForEmail(html || "");
    const boundary = `agentcrm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const headers = [
      `From: ${formatFromHeader(fromAddress)}`,
      `To: ${recipients.join(", ")}`,
      `Subject: ${encodeMimeHeader(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${messageId}`,
      "MIME-Version: 1.0",
    ];
    const mimeBody = hasHtml
      ? [
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          "",
          `--${boundary}`,
          'Content-Type: text/plain; charset="UTF-8"',
          "Content-Transfer-Encoding: 8bit",
          "",
          textBody,
          "",
          `--${boundary}`,
          'Content-Type: text/html; charset="UTF-8"',
          "Content-Transfer-Encoding: 8bit",
          "",
          html,
          "",
          `--${boundary}--`,
        ]
      : [
          'Content-Type: text/plain; charset="UTF-8"',
          "Content-Transfer-Encoding: 8bit",
          "",
          textBody,
        ];
    socket.write(`${dotStuffSmtpData([...headers, ...mimeBody].join("\r\n"))}\r\n.\r\n`);
    response = await readSmtpResponse(readLine);
    if (!/^250/.test(response[0])) throw new Error(`SMTP message was not accepted: ${response.join(" ")}`);

    writeLine(socket, "QUIT");
    res.json({ success: true, provider: "smtp", recipients, messageId });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "SMTP send failed." });
  } finally {
    socket?.destroy();
  }
});

type LeadPlatformRunConfig = {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  endpointPath?: string;
  method?: "GET" | "POST";
  actorId?: string;
  agentId?: string;
  requestJson?: string;
  authHeaderName?: string;
  authScheme?: string;
};

type LeadPlatformRuntime = {
  query?: string;
  location?: string;
  limit?: number;
  source?: Record<string, unknown>;
};

function joinUrl(baseUrl: string, endpointPath = "") {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const pathPart = String(endpointPath || "").replace(/^\/+/, "");
  return pathPart ? `${base}/${pathPart}` : base;
}

function parseRequestJson(raw: string | undefined) {
  if (!raw?.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request JSON must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function replaceTemplate(value: unknown, vars: Record<string, string | number>): unknown {
  if (typeof value === "string") {
    return Object.entries(vars).reduce(
      (text, [key, val]) => text.replaceAll(`{{${key}}}`, String(val)),
      value,
    );
  }
  if (Array.isArray(value)) return value.map((item) => replaceTemplate(item, vars));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, replaceTemplate(val, vars)]),
    );
  }
  return value;
}

function flattenResults(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenResults);
  if (Array.isArray(value.data)) return flattenResults(value.data);
  if (Array.isArray(value.items)) return flattenResults(value.items);
  if (Array.isArray(value.results)) return flattenResults(value.results);
  if (Array.isArray(value.records)) return flattenResults(value.records);
  if (Array.isArray(value.leads)) return flattenResults(value.leads);
  if (Array.isArray(value.output)) return flattenResults(value.output);
  if (value.data && typeof value.data === "object") return flattenResults(value.data);
  return [value];
}

function firstValue(item: any, keys: string[]) {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current?.[part], item);
    if (Array.isArray(value)) {
      const first = value.find(Boolean);
      if (first) return typeof first === "object" ? JSON.stringify(first) : String(first);
    }
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return "";
}

function normalizeLeadItem(item: any, platformName: string, platformId: string) {
  const name = firstValue(item, [
    "name",
    "title",
    "business_name",
    "company_name",
    "companyName",
    "organization_name",
    "organizationName",
  ]);
  const contact = firstValue(item, [
    "email",
    "email_1",
    "emails",
    "phone",
    "phone_number",
    "phoneNumber",
    "site",
    "website",
    "domain",
    "url",
    "linkedin_url",
  ]);
  if (!name && !contact) return null;
  const idSource = `${platformId}|${name}|${contact}|${firstValue(item, ["address", "full_address", "location"])}`;
  const idHash = Buffer.from(idSource).toString("base64url").slice(0, 24);
  return {
    id: `lead_${platformId}_${idHash}`,
    name: name || contact,
    contact: contact || "No contact returned",
    source: platformName,
    scrapedAt: new Date().toISOString(),
    industry: firstValue(item, ["category", "category_name", "type", "industry", "business_type"]) || undefined,
    location: firstValue(item, ["full_address", "address", "location", "city", "region", "country"]) || undefined,
    description: firstValue(item, ["description", "about", "snippet", "subtitle", "reviews"]) || undefined,
    contacts: [
      firstValue(item, ["email", "email_1", "emails"]) && {
        id: `email_${idHash}`,
        type: "Email",
        value: firstValue(item, ["email", "email_1", "emails"]),
      },
      firstValue(item, ["phone", "phone_number", "phoneNumber"]) && {
        id: `phone_${idHash}`,
        type: "Phone",
        value: firstValue(item, ["phone", "phone_number", "phoneNumber"]),
      },
      firstValue(item, ["site", "website", "domain", "url"]) && {
        id: `web_${idHash}`,
        type: "Website",
        value: firstValue(item, ["site", "website", "domain", "url"]),
      },
    ].filter(Boolean),
    raw: item,
  };
}

function platformDefaults(platformId: string, config: LeadPlatformRunConfig, runtime: LeadPlatformRuntime = {}) {
  const query = [runtime.query || "business leads", runtime.location].filter(Boolean).join(", ");
  const limit = Math.max(1, Math.min(Number(runtime.limit || 10), 100));
  if (platformId === "outscraper") {
    return {
      baseUrl: config.baseUrl || "https://api.outscraper.cloud",
      endpointPath: config.endpointPath || "google-maps-search",
      method: config.method || "GET",
      headers: { "X-API-KEY": config.apiKey || "" },
      queryParams: { query, limit, async: "false" },
      body: undefined,
    };
  }
  if (platformId === "apify") {
    if (!config.actorId?.trim()) throw new Error("Apify requires an Actor ID, such as owner~actor-name.");
    return {
      baseUrl: config.baseUrl || "https://api.apify.com/v2",
      endpointPath: config.endpointPath || `acts/${encodeURIComponent(config.actorId)}/run-sync-get-dataset-items`,
      method: config.method || "POST",
      headers: {},
      queryParams: { token: config.apiKey || "", clean: "true", format: "json" },
      body: replaceTemplate(parseRequestJson(config.requestJson), { query, location: runtime.location || "", limit }),
    };
  }
  if (platformId === "phantombuster") {
    if (!config.agentId?.trim()) throw new Error("PhantomBuster requires an Agent ID.");
    return {
      baseUrl: config.baseUrl || "https://api.phantombuster.com",
      endpointPath: config.endpointPath || `api/v1/agent/${encodeURIComponent(config.agentId)}/launch`,
      method: config.method || "POST",
      headers: { "X-Phantombuster-Key-1": config.apiKey || "" },
      queryParams: { output: "json" },
      body: {
        argument: JSON.stringify(replaceTemplate(parseRequestJson(config.requestJson), { query, location: runtime.location || "", limit })),
      },
    };
  }
  return {
    baseUrl: config.baseUrl || "",
    endpointPath: config.endpointPath || "",
    method: config.method || "POST",
    headers: {
      [config.authHeaderName || "Authorization"]:
        config.authHeaderName && config.authHeaderName.toLowerCase() !== "authorization"
          ? config.apiKey || ""
          : `${config.authScheme || "Bearer"} ${config.apiKey || ""}`.trim(),
    },
    queryParams: {},
    body: replaceTemplate(parseRequestJson(config.requestJson), { query, location: runtime.location || "", limit }),
  };
}

app.post("/api/lead-platforms/run", async (req, res) => {
  const { platformId, platformName, config = {}, runtime = {} } = req.body as {
    platformId?: string;
    platformName?: string;
    config?: LeadPlatformRunConfig;
    runtime?: LeadPlatformRuntime;
  };
  if (!platformId || !platformName) return res.status(400).json({ error: "Platform ID and name are required." });
  if (!config.enabled) return res.status(400).json({ error: `${platformName} is disabled.` });
  if (!config.apiKey?.trim()) return res.status(400).json({ error: `${platformName} API key is required.` });

  try {
    const defaults = platformDefaults(platformId, config, runtime);
    if (!defaults.baseUrl) return res.status(400).json({ error: `${platformName} Base URL is required.` });
    const url = new URL(joinUrl(defaults.baseUrl, defaults.endpointPath));
    Object.entries(defaults.queryParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim()) {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url, {
      method: defaults.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...defaults.headers,
      },
      body: defaults.method === "GET" ? undefined : JSON.stringify(defaults.body || {}),
    });
    const rawText = await response.text();
    const rawData = rawText
      ? (() => {
          try {
            return JSON.parse(rawText);
          } catch {
            return { text: rawText };
          }
        })()
      : {};
    if (!response.ok) {
      const message = rawData?.error?.message || rawData?.message || rawText || `${platformName} returned HTTP ${response.status}.`;
      return res.status(response.status).json({ error: message, status: response.status, raw: rawData });
    }

    const items = flattenResults(rawData);
    const leads = items
      .map((item) => normalizeLeadItem(item, platformName, platformId))
      .filter(Boolean);
    res.json({
      success: true,
      platformId,
      platformName,
      runtime: {
        query: runtime.query || "business leads",
        location: runtime.location || "",
        limit: Math.max(1, Math.min(Number(runtime.limit || 10), 100)),
        source: runtime.source || {},
      },
      requestedUrl: `${url.origin}${url.pathname}`,
      rawCount: items.length,
      leads,
      rawSample: items.slice(0, 3),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Lead platform request failed." });
  }
});

app.get("/api/communication/timeline/:customerId", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    res.json(await getRecordList(`timeline:${req.params.customerId}`));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/memory/:customerId", async (req, res) => {
  if (!requireVectorDatabase(res)) return;
  try {
    const semantic = await withVector(async (client) => {
      const result = await client.query(
        "SELECT content FROM documents ORDER BY id DESC LIMIT 10",
      );
      return result.rows.map((row) => row.content).filter(Boolean);
    });
    res.json({ customerId: req.params.customerId, semantic, behavioral: [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ai/draft-reply", async (req, res) => {
  if (!requireGemini(res)) return;
  const { message, intent, preferredLanguage = "en" } = req.body;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Draft a professional support reply to the following customer message summary: "${message}". The determined intent of the message is: ${intent}. Keep it concise, helpful, and under 3 paragraphs. Do not include placeholders like [Your Name]. PLEASE REPLY IN THIS LANGUAGE: ${preferredLanguage}`,
      config: { temperature: 0.7 },
    });
    res.json({ reply: response.text });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/ai/inbox-insights/:messageId", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const insight = await getRecord("inbox_ai_insights", req.params.messageId);
    res.json({ insight: insight || null });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load inbox AI analysis: ${err.message}` });
  }
});

app.delete("/api/ai/inbox-insights/:messageId", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    await deleteRecord("inbox_ai_insights", req.params.messageId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete inbox AI analysis: ${err.message}` });
  }
});

function inboxSenderPrefId(sender: string) {
  return Buffer.from(String(sender || "").trim().toLowerCase()).toString("base64url").slice(0, 100);
}

app.get("/api/ai/inbox-sender-analysis-pref", async (req, res) => {
  if (!requireDatabase(res)) return;
  const sender = String(req.query.sender || "").trim();
  if (!sender) return res.status(400).json({ error: "sender is required." });
  try {
    const preference = await getRecord("inbox_ai_sender_prefs", inboxSenderPrefId(sender));
    res.json({ preference: preference || null });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load sender analysis preference: ${err.message}` });
  }
});

app.post("/api/ai/inbox-sender-analysis-pref", async (req, res) => {
  if (!requireDatabase(res)) return;
  const sender = String(req.body.sender || "").trim();
  const mode = req.body.mode === "manual" ? "manual" : "auto";
  if (!sender) return res.status(400).json({ error: "sender is required." });
  try {
    const preference = {
      id: inboxSenderPrefId(sender),
      sender,
      mode,
      updatedAt: new Date().toISOString(),
    };
    await upsertRecord("inbox_ai_sender_prefs", preference.id, preference);
    res.json({ preference });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to save sender analysis preference: ${err.message}` });
  }
});

app.post("/api/ai/inbox-insights", async (req, res) => {
  const {
    messageId = "",
    subject = "",
    sender = "",
    channel = "Email",
    message = "",
    systemLanguage = "en",
    modelProfile = {},
    force = false,
  } = req.body;
  if (!requireDatabase(res)) return;
  const insightId = String(messageId || "").trim();
  if (!insightId) {
    return res.status(400).json({ error: "messageId is required for inbox AI analysis." });
  }

  try {
    if (!force) {
      const existing = await getRecord("inbox_ai_insights", insightId);
      if (existing) return res.json(existing);
    }

    const profile = requireModelProfile(modelProfile, res);
    if (!profile) return;

    const prompt = `Analyze this CRM inbox conversation using the actual message content.

Channel: ${channel}
Sender: ${sender}
Subject: ${subject}
Message:
${String(message).slice(0, 6000)}

Return strict JSON only:
{
  "intent": "short intent label",
  "priority": "low|medium|high",
  "risk": "short risk assessment",
  "customerNeed": "what the sender appears to need",
  "recommendedActions": ["action 1", "action 2", "action 3"],
  "replyGuidance": ["point 1", "point 2"]
}
Write all human-facing values in this language: ${systemLanguage}. Do not invent files, prices, policies, or CRM facts that are not present in the message.`;
    const text = await generateWithModelProfile(
      profile,
      "You are an inbox triage and CRM support assistant. Analyze messages and recommend practical next actions based only on the provided content.",
      prompt,
    );
    const data = parseAiJson(text);
    const insight = {
      id: insightId,
      intent: String(data.intent || "General inquiry"),
      priority: ["low", "medium", "high"].includes(String(data.priority)) ? data.priority : "medium",
      risk: String(data.risk || "No clear risk detected."),
      customerNeed: String(data.customerNeed || "Review the message and respond appropriately."),
      recommendedActions: Array.isArray(data.recommendedActions) ? data.recommendedActions.map(String).slice(0, 4) : [],
      replyGuidance: Array.isArray(data.replyGuidance) ? data.replyGuidance.map(String).slice(0, 4) : [],
      model: profile.model,
      provider: profile.provider,
      analyzedAt: new Date().toISOString(),
    };
    await upsertRecord("inbox_ai_insights", insightId, insight);
    res.json(insight);
  } catch (err: any) {
    res.status(500).json({ error: `Inbox AI analysis failed: ${err.message}` });
  }
});

app.post("/api/ai/trigger-agent", async (req, res) => {
  const { agentId, agentRole = "", allowedTools = [], context, operationGuard = {}, systemLanguage = "en", modelProfile = {} } = req.body;
  const profile = requireModelProfile(modelProfile, res);
  if (!profile) return;

  try {
    const guardNote = operationGuard?.repeatable === false
      ? `This workflow is marked non-repeatable for target ${operationGuard.targetType}:${operationGuard.targetId}. Do not repeat completed work for the same target; report the guarded action once.`
      : "If this workflow would mutate CRM data, avoid repeating the same non-repeatable action for the same record.";
    const prompt = `You are executing a CRM agent workflow.
Agent ID: ${agentId}
Context: ${context}
Allowed business tools: ${Array.isArray(allowedTools) && allowedTools.length > 0 ? allowedTools.join(", ") : "none configured"}
Duplicate operation policy: ${guardNote}

Generate a 4-step execution log. Return strict JSON like {"logs":["step 1","step 2"]}. Write logs in this language: ${systemLanguage}.`;
    const text = await generateWithModelProfile(profile, agentRole, prompt);
    const data = parseAiJson(text);
    const logs = Array.isArray(data.logs)
      ? data.logs.map((log: unknown) => String(log)).filter(Boolean)
      : [];
    if (logs.length === 0) {
      return res.status(502).json({
        error: "Agent engine returned no execution logs.",
        model: profile.model,
        provider: profile.provider,
      });
    }
    res.json({
      success: true,
      logs,
      model: profile.model,
      provider: profile.provider,
      modelProfileId: profile.id,
    });
  } catch (err: any) {
    console.error("Agent execution error:", err);
    res.status(500).json({
      error: `Agent execution failed: ${err.message}`,
      model: profile.model,
      provider: profile.provider,
    });
  }
});

app.post("/api/ai/vectorize-doc", async (req, res) => {
  if (!requireGemini(res)) return;
  if (!requireVectorDatabase(res)) return;

  try {
    const { filename, content = "" } = req.body;
    const chunks = String(content || filename || "")
      .match(/[\s\S]{1,1200}/g) || [String(filename || "Untitled document")];

    await withVector(async (client) => {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      await client.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id bigserial PRIMARY KEY,
          title text,
          content text,
          embedding vector(1536),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      for (const chunk of chunks) {
        await client.query(
          "INSERT INTO documents (title, content) VALUES ($1, $2)",
          [filename || "Untitled document", chunk],
        );
      }
    });

    const id = `doc_${Date.now()}`;
    const documentRecord = {
      id,
      title: filename || "Untitled document",
      pieces: chunks.length,
      status: "Active (Vectorized)",
      date: new Date().toISOString(),
      content: String(content).slice(0, 5000),
    };
    await upsertRecord("knowledge_documents", id, documentRecord);

    res.json({ pieces: chunks.length, document: documentRecord });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ai/draft-proposal", async (req, res) => {
  if (!requireGemini(res)) return;
  const { customerName, intent, preferredLanguage = "en" } = req.body;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Draft a professional sales proposal for ${customerName}. Their current intent is: ${intent}. Offer a 5% discount on bulk orders to close the deal. Keep it concise, helpful, and under 3 paragraphs. PLEASE REPLY IN THIS LANGUAGE: ${preferredLanguage}`,
      config: { temperature: 0.7 },
    });
    res.json({ reply: response.text });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
