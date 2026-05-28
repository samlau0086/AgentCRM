import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
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
  httpOptions: { headers: { "User-Agent": "aistudio-build" } },
});

type ModelProvider = "openai" | "anthropic" | "google" | "custom";

type ModelProfile = {
  id?: string;
  name?: string;
  provider?: ModelProvider;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  systemPrompt?: string;
};

function providerApiKey(profile: ModelProfile) {
  if (profile.apiKey) return profile.apiKey;
  if (profile.provider === "openai" || profile.provider === "custom") {
    return process.env.OPENAI_API_KEY || "";
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
  prompt: string,
) {
  const temperature = profile.temperature ?? 0.4;
  const systemPrompt =
    profile.systemPrompt ||
    "You are a CRM automation agent. Execute tasks carefully and report concise operational logs.";

  if (profile.provider === "google") {
    const profileAi = new GoogleGenAI({
      apiKey: profile.apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
    const response = await profileAi.models.generateContent({
      model: profile.model,
      contents: `${systemPrompt}\n\n${prompt}`,
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
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error?.message || `Anthropic request failed with HTTP ${response.status}.`);
    }
    return data.content?.map((part: any) => part.text).filter(Boolean).join("\n") || "";
  }

  const baseUrl = profile.baseUrl || "https://api.openai.com/v1";
  const endpoint = baseUrl.replace(/\/$/, "").endsWith("/chat/completions")
    ? baseUrl.replace(/\/$/, "")
    : `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${profile.apiKey}`,
    },
    body: JSON.stringify({
      model: profile.model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
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

app.post("/api/ai/trigger-agent", async (req, res) => {
  const { agentId, agentRole = "", context, systemLanguage = "en", modelProfile = {} } = req.body;
  const profile = requireModelProfile(modelProfile, res);
  if (!profile) return;

  try {
    const prompt = `You are executing a CRM agent workflow.
Agent ID: ${agentId}
Agent instructions: ${agentRole || "Use the configured profile system prompt."}
Context: ${context}

Generate a 4-step execution log. Return strict JSON like {"logs":["step 1","step 2"]}. Write logs in this language: ${systemLanguage}.`;
    const text = await generateWithModelProfile(profile, prompt);
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
