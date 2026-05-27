import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

import pg from "pg";
import { registerType } from "pgvector/pg";

const VectorPool = new pg.Pool({
  connectionString: process.env.PG_VECTOR_URL || undefined,
});

VectorPool.on("connect", async (client) => {
  try {
    await registerType(client);
  } catch (err) {
    console.error("Failed to register pgvector type:", err);
  }
});

// Settings Config API
app.get("/api/config/vector", async (req, res) => {
  if (!process.env.PG_VECTOR_URL) {
    return res.json({
      configured: false,
      status: "Not Configured",
      details: "PG_VECTOR_URL is not set in environment secrets.",
    });
  }

  try {
    const client = await VectorPool.connect();

    // Check if pgvector extension is installed
    const result = await client.query(`
      SELECT extname 
      FROM pg_extension 
      WHERE extname = 'vector';
    `);

    client.release();

    if (result.rows.length > 0) {
      return res.json({
        configured: true,
        status: "Operational",
        details: "Connected to Postgres with pgvector.",
      });
    } else {
      return res.json({
        configured: true,
        status: "Warning",
        details: "Connected to Postgres, but pgvector extension is missing.",
      });
    }
  } catch (err: any) {
    return res.json({
      configured: true,
      status: "Error",
      details: err.message,
    });
  }
});

app.post("/api/vector/init", async (req, res) => {
  if (!process.env.PG_VECTOR_URL) {
    return res.status(400).json({ error: "PG_VECTOR_URL not configured" });
  }
  try {
    const client = await VectorPool.connect();
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id bigserial PRIMARY KEY,
        content text,
        embedding vector(1536)
      );
    `);
    client.release();
    res.json({ success: true, message: "Vector database initialized." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================

// CRM Core API
app.get("/api/crm/customers", (req, res) => {
  res.json([
    {
      id: "cus_1",
      name: "Acme Corp",
      contact: "John Doe",
      stage: "Negotiation",
      score: 95,
    },
    {
      id: "cus_2",
      name: "Global Tech",
      contact: "Jane Smith",
      stage: "Qualified",
      score: 82,
    },
    {
      id: "cus_3",
      name: "Oceanic Airlines",
      contact: "Jack Shephard",
      stage: "New Lead",
      score: 45,
    },
  ]);
});

app.get("/api/crm/customers/:id", (req, res) => {
  res.json({
    id: req.params.id,
    name: "Acme Corp",
    contact: "John Doe",
    email: "john@acme.com",
    phone: "+1 555-0199",
    stage: "Negotiation",
    leadScore: 95,
    riskScore: 10,
    intent: "High",
    summary:
      "Customer is highly interested in bulk order but negotiating on MOQ.",
    nextAction:
      "Follow up on the revised MOQ pricing proposal sent 2 days ago.",
  });
});

// Communication Hub API
app.get("/api/communication/inbox", (req, res) => {
  res.json([
    {
      id: "msg_1",
      sender: "buyer1@example.com",
      intent: "Inquiry",
      subject: "Bulk Pricing",
      summary: "Asking for 10k units volume discount",
      receivedAt: new Date().toISOString(),
    },
    {
      id: "msg_2",
      sender: "lead1@whatsapp.com",
      intent: "Support",
      subject: "MOQ clarification",
      summary: "Checking if they can order below MOQ for first time",
      receivedAt: new Date().toISOString(),
    },
  ]);
});

app.get("/api/communication/timeline/:customerId", (req, res) => {
  res.json([
    {
      id: "ev_1",
      type: "email",
      date: "2026-05-20T10:00:00Z",
      content: "Sent introductory email",
    },
    {
      id: "ev_2",
      type: "reply",
      date: "2026-05-21T14:30:00Z",
      content: "Customer replied asking for catalog",
    },
    {
      id: "ev_3",
      type: "system",
      date: "2026-05-22T09:00:00Z",
      content: "AI Agent updated Intent Score to High",
    },
    {
      id: "ev_4",
      type: "email",
      date: "2026-05-23T11:00:00Z",
      content: "Sent quotation #1044",
    },
  ]);
});

// Agent Orchestration API
app.get("/api/agent/actions/pending", (req, res) => {
  res.json([
    {
      id: "act_1",
      customerId: "cus_1",
      type: "Draft Email",
      suggestion: "Suggest 5% discount for 10k MOQ",
      priority: "High",
      risk: "Low",
    },
    {
      id: "act_2",
      customerId: "cus_2",
      type: "Create Task",
      suggestion: "Schedule 15min call for product demo",
      priority: "Medium",
      risk: "Low",
    },
  ]);
});

// Memory System API
app.get("/api/memory/:customerId", async (req, res) => {
  if (process.env.PG_VECTOR_URL) {
    try {
      const client = await VectorPool.connect();
      const result = await client.query("SELECT * FROM documents LIMIT 5");
      client.release();

      const dynamicSemantic =
        result.rows.length > 0
          ? result.rows.map((r) => r.content || "Indexed memory block")
          : [
              "cares deeply about shipping times",
              "prefers WhatsApp for quick updates",
            ];

      return res.json({
        profile: { industry: "Manufacturing", size: "100-500", budget: "$50k" },
        semantic: dynamicSemantic,
        behavioral: [
          "usually replies in morning PST",
          "opened last 3 emails",
          "DB Connected",
        ],
      });
    } catch (err) {
      console.warn("Vector DB fetch failed falling back to mock data", err);
    }
  }

  res.json({
    profile: { industry: "Manufacturing", size: "100-500", budget: "$50k" },
    semantic: [
      "cares deeply about shipping times",
      "prefers WhatsApp for quick updates",
    ],
    behavioral: ["usually replies in morning PST", "opened last 3 emails"],
  });
});

// Knowledge Base API
app.get("/api/knowledge", (req, res) => {
  res.json([
    {
      id: "doc_1",
      title: "Product Catalog 2026",
      type: "PDF",
      status: "Indexed",
    },
    {
      id: "doc_2",
      title: "Pricing & MOQ Rules",
      type: "Ruleset",
      status: "Indexed",
    },
    { id: "doc_3", title: "Shipping Policy", type: "FAQ", status: "Indexed" },
  ]);
});

// ==========================================
// AI Agent Endpoints (Gemini)
// ==========================================
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "dummy_key_if_none",
  httpOptions: { headers: { "User-Agent": "aistudio-build" } },
});

app.post("/api/ai/draft-reply", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      reply:
        "[Mock AI Reply] Please configure GEMINI_API_KEY in settings to use real AI generation. Based on your inquiry, we can offer a 15% discount on bulk orders.",
    });
  }

  try {
    const { message, intent, preferredLanguage = "en" } = req.body;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Draft a professional support reply to the following customer message summary: "${message}". The determined intent of the message is: ${intent}. Keep it concise, helpful, and under 3 paragraphs. Do not include placeholders like [Your Name]. PLEASE REPLY IN THIS LANGUAGE (very important): ${preferredLanguage}`,
      config: { temperature: 0.7 },
    });
    res.json({ reply: response.text });
  } catch (error: any) {
    console.error("AI Draft Reply Error:", error);
    res
      .status(500)
      .json({
        error: error.message,
        reply: "Failed to generate reply using AI.",
      });
  }
});

app.post("/api/ai/trigger-agent", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      success: true,
      logs: [
        "[Simulated] Connected to CRM",
        "[Simulated] Evaluated risk: Low",
        "[Simulated] Triggered automated email response.",
        "Action completed. API key missing for real processing.",
      ],
    });
  }

  try {
    const { agentId, context, systemLanguage = "en" } = req.body;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an autonomous agent system executing a workflow for agent ID ${agentId}. Based on this context: "${context}", generate a 4-step execution log of your actions. Format as a simple array of strings in JSON, like {"logs": ["step 1...", "step 2..."]}. VERY IMPORTANT: The logs MUST be written in this language: ${systemLanguage}.`,
      config: { responseMimeType: "application/json" },
    });
    const data = JSON.parse(
      response.text || '{"logs": ["Failed to parse logs"]}',
    );
    res.json({ success: true, logs: data.logs });
  } catch (error: any) {
    console.error("Agent Trigger Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ai/vectorize-doc", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.json({ pieces: Math.floor(Math.random() * 50) + 10 });
  }

  try {
    const { filename, content } = req.body;
    // In a real app we would chunk the content and call embedding, then store in PG Vector.
    // For now we simulate reading the length and giving a chunk count.
    const textContext = content ? content.slice(0, 1000) : filename;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `We are vectorizing a document named "${textContext}". Estimate how many semantic chunks (pieces) this would break down into (return just a number between 10 and 200).`,
    });
    const count = parseInt(response.text?.trim() || "25", 10);
    res.json({ pieces: isNaN(count) ? 25 : count });
  } catch (error) {
    res.json({ pieces: 25 });
  }
});

app.post("/api/ai/draft-proposal", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      reply:
        "[Mock Proposal] We are pleased to offer a 5% discount on bulk orders.",
    });
  }

  try {
    const { customerName, intent, preferredLanguage = "en" } = req.body;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Draft a professional sales proposal for ${customerName}. Their current intent is: ${intent}. Offer a 5% discount on bulk orders to close the deal. Keep it concise, helpful, and under 3 paragraphs. PLEASE REPLY IN THIS LANGUAGE (very important): ${preferredLanguage}`,
      config: { temperature: 0.7 },
    });
    res.json({ reply: response.text });
  } catch (error: any) {
    console.error("AI Draft Proposal Error:", error);
    res
      .status(500)
      .json({
        error: error.message,
        reply: "Failed to generate proposal using AI.",
      });
  }
});

// ==========================================
// VITE MIDDLEWARE SETUP
// ==========================================
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
