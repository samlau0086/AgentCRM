import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import net from "net";
import tls from "tls";
import { createHash } from "crypto";
import { createServer as createViteServer } from "vite";
import cookieParser from "cookie-parser";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pg from "pg";
import { registerType } from "pgvector/pg";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;
const CRM_DEPLOY_MARKER = "crm-db-sync-v2-record-upsert-polling";
const JWT_SECRET = process.env.JWT_SECRET || "change_me_in_env";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const useSecureCookies = process.env.NODE_ENV === "production";
const hasDatabase = Boolean(process.env.DATABASE_URL || process.env.PG_VECTOR_URL);
const hasVectorDatabase = Boolean(process.env.PG_VECTOR_URL);
const BACKGROUND_INBOX_SYNC_INTERVAL_MS = Math.max(
  15000,
  Number(process.env.INBOX_SYNC_INTERVAL_MS || 60000),
);
const SERVER_AGENT_SCHEDULER_INTERVAL_MS = Math.max(
  15000,
  Number(process.env.AGENT_SCHEDULER_INTERVAL_MS || 60000),
);

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

app.get("/api/deploy-info", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    marker: CRM_DEPLOY_MARKER,
    gitSha: process.env.BUILD_SHA || "unknown",
    buildTime: process.env.BUILD_TIME || "unknown",
    repository: process.env.DEPLOY_REPOSITORY || "unknown",
    nodeEnv: process.env.NODE_ENV || "development",
  });
});

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

const ISO2_COUNTRY_CODES = `
AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI KH CM CA CV KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW
`
  .trim()
  .split(/\s+/);

const countryDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryKey(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const CANONICAL_COUNTRIES: Record<string, string> = {};
for (const code of ISO2_COUNTRY_CODES) {
  const name = countryDisplayNames.of(code);
  if (name) {
    CANONICAL_COUNTRIES[countryKey(name)] = name;
    CANONICAL_COUNTRIES[countryKey(code)] = name;
  }
}

const COUNTRY_ALIASES: Record<string, string> = {
  america: "United States",
  usa: "United States",
  u_s_a: "United States",
  united_states: "United States",
  united_states_of_america: "United States",
  uk: "United Kingdom",
  u_k: "United Kingdom",
  britain: "United Kingdom",
  great_britain: "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  prc: "China",
  mainland_china: "China",
  cn: "China",
  hk: "Hong Kong",
  hong_kong_sar: "Hong Kong",
  mo: "Macau",
  macao: "Macau",
  macau: "Macau",
  korea: "South Korea",
  south_korea: "South Korea",
  republic_of_korea: "South Korea",
  uae: "United Arab Emirates",
  u_a_e: "United Arab Emirates",
  ksa: "Saudi Arabia",
  saudi: "Saudi Arabia",
  vietnam: "Vietnam",
  viet_nam: "Vietnam",
  russia: "Russia",
  russian_federation: "Russia",
  iran: "Iran",
  mexico: "Mexico",
  brasil: "Brazil",
  ci: "Cote d'Ivoire",
  ivory_coast: "Cote d'Ivoire",
  cote_d_ivoire: "Cote d'Ivoire",
  cote_divoire: "Cote d'Ivoire",
  c_te_d_ivoire: "Cote d'Ivoire",
  czechia: "Czechia",
  czech_republic: "Czechia",
  drc: "Congo - Kinshasa",
  dr_congo: "Congo - Kinshasa",
  cd: "Democratic Republic of the Congo",
  democratic_republic_of_the_congo: "Democratic Republic of the Congo",
  congo_kinshasa: "Democratic Republic of the Congo",
  cg: "Republic of the Congo",
  congo_brazzaville: "Republic of the Congo",
  republic_of_the_congo: "Republic of the Congo",
  laos: "Laos",
  moldavia: "Moldova",
  burma: "Myanmar",
  palestine: "Palestinian Territories",
  taiwan: "Taiwan",
  tr: "Turkey",
  turkiye: "Turkey",
  turkey: "Turkey",
};

const LOCATION_COUNTRY_HINTS: Record<string, string> = {
  california: "United States",
  ca: "United States",
  new_york: "United States",
  ny: "United States",
  texas: "United States",
  tx: "United States",
  florida: "United States",
  fl: "United States",
  washington: "United States",
  wa: "United States",
  illinois: "United States",
  il: "United States",
  san_francisco: "United States",
  los_angeles: "United States",
  chicago: "United States",
  houston: "United States",
  miami: "United States",
  london: "United Kingdom",
  manchester: "United Kingdom",
  toronto: "Canada",
  vancouver: "Canada",
  ontario: "Canada",
  quebec: "Canada",
  sydney: "Australia",
  melbourne: "Australia",
  auckland: "New Zealand",
  singapore: "Singapore",
  shanghai: "China",
  beijing: "China",
  shenzhen: "China",
  guangzhou: "China",
  hong_kong: "Hong Kong",
  tokyo: "Japan",
  osaka: "Japan",
  seoul: "South Korea",
  mumbai: "India",
  delhi: "India",
  bangalore: "India",
  paris: "France",
  berlin: "Germany",
  munich: "Germany",
  madrid: "Spain",
  barcelona: "Spain",
  rome: "Italy",
  milan: "Italy",
  dubai: "United Arab Emirates",
  abu_dhabi: "United Arab Emirates",
  mexico_city: "Mexico",
  ciudad_de_mexico: "Mexico",
  cdmx: "Mexico",
  guadalajara: "Mexico",
  monterrey: "Mexico",
  nuevo_leon: "Mexico",
  jalisco: "Mexico",
  puebla: "Mexico",
  queretaro: "Mexico",
  sao_paulo: "Brazil",
  rio_de_janeiro: "Brazil",
  buenos_aires: "Argentina",
  bogota: "Colombia",
  medellin: "Colombia",
  santiago: "Chile",
  lima: "Peru",
};

function normalizeCountryName(value = "") {
  const key = countryKey(value);
  if (!key) return "";
  return COUNTRY_ALIASES[key] || CANONICAL_COUNTRIES[key] || "";
}

function inferCountryFromLocation(value = "") {
  const parts = String(value || "")
    .split(/[,|/;\n\r\t]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of [...parts].reverse()) {
    const normalized = normalizeCountryName(part);
    if (normalized) return normalized;
    const hint = LOCATION_COUNTRY_HINTS[countryKey(part)];
    if (hint) return hint;
  }

  for (const part of parts) {
    const hint = LOCATION_COUNTRY_HINTS[countryKey(part)];
    if (hint) return hint;
  }

  return "";
}

function recordCountry(data: any) {
  const explicitCountry = normalizeCountryName(data?.country || "");
  if (explicitCountry) return explicitCountry;
  const locationText = [
    data?.location,
    data?.address,
    data?.city,
    data?.province,
    data?.state,
    data?.region,
  ]
    .filter(Boolean)
    .join(", ");
  return inferCountryFromLocation(locationText) || "Unknown";
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function normalizeCsvHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function csvToObjects(text: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { headers: rows[0] || [], rows: [] as Record<string, string>[] };
  const headers = rows[0].map(normalizeCsvHeader);
  return {
    headers,
    rows: rows.slice(1).map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])),
    ) as Record<string, string>[],
  };
}

function csvEscape(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function rowsToCsv(rows: Record<string, string>[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row || {}))));
  if (headers.length === 0) return "";
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(String(row?.[header] || ""))).join(",")),
  ].join("\n");
}

function pickCsv(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizeCsvHeader(alias)];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function csvTags(value: string) {
  return value
    .split(/[;,|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function clampScore(value: string, fallback = 50) {
  const parsed = parseInt(value || "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function normalizeRisk(value: string) {
  const text = value.trim().toLowerCase();
  if (text === "high") return "High";
  if (text === "medium") return "Medium";
  return text === "low" ? "Low" : undefined;
}

function normalizeIntent(value: string) {
  const text = value.trim().toLowerCase();
  if (text === "high") return "High";
  if (text === "medium") return "Medium";
  return text === "low" ? "Low" : undefined;
}

function buildLeadContactMethods(row: Record<string, string>) {
  return [
    { type: "Email", value: pickCsv(row, ["email", "email_address", "mail"]) },
    { type: "Phone", value: pickCsv(row, ["phone", "phone_number", "tel"]) },
    { type: "Mobile", value: pickCsv(row, ["mobile", "mobile_phone"]) },
    { type: "WhatsApp", value: pickCsv(row, ["whatsapp", "whatsapp_number"]) },
    { type: "Other", value: pickCsv(row, ["website", "site", "url", "linkedin"]) },
  ]
    .filter((contact) => contact.value)
    .map((contact, index) => ({
      id: `contact_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
      type: contact.type,
      value: contact.value,
    }));
}

function rowToCustomer(row: Record<string, string>, rowNumber: number) {
  const name = pickCsv(row, ["company", "company_name", "name", "customer", "customer_name", "organization"]);
  const contact = pickCsv(row, ["contact", "contact_name", "person", "name", "email", "phone", "mobile"]);
  if (!name && !contact) return null;
  const country = normalizeCountryName(pickCsv(row, ["country"])) ||
    inferCountryFromLocation(pickCsv(row, ["location", "address", "city", "province", "state", "region"]));
  return {
    id: `cus_csv_${Date.now()}_${rowNumber}_${Math.random().toString(36).slice(2, 9)}`,
    name: name || contact,
    contact: contact || name,
    contacts: buildLeadContactMethods(row),
    address: pickCsv(row, ["address", "street"]),
    city: pickCsv(row, ["city"]),
    province: pickCsv(row, ["province", "state", "region"]),
    country,
    preferredLanguage: pickCsv(row, ["preferred_language", "language", "lang"]) || "en",
    description: pickCsv(row, ["description", "notes", "note", "summary"]),
    industry: pickCsv(row, ["industry", "category"]),
    stage: pickCsv(row, ["stage", "pipeline_stage"]) || "New Lead",
    score: clampScore(pickCsv(row, ["score", "priority_score", "ai_score"])),
    risk: normalizeRisk(pickCsv(row, ["risk"])) || "Low",
    intent: normalizeIntent(pickCsv(row, ["intent"])) || "Low",
    tags: csvTags(pickCsv(row, ["tags", "tag"])),
    logs: [
      {
        id: `log_${Date.now()}_${rowNumber}`,
        time: new Date().toISOString(),
        event: "Imported from CSV",
        type: "action",
      },
    ],
    comments: [],
  };
}

function rowToPublicLead(row: Record<string, string>, rowNumber: number) {
  const name = pickCsv(row, ["company", "company_name", "name", "lead", "business_name", "organization"]);
  const contact = pickCsv(row, ["contact", "email", "phone", "mobile", "website", "site", "url"]);
  if (!name && !contact) return null;
  const country = normalizeCountryName(pickCsv(row, ["country"])) ||
    inferCountryFromLocation(pickCsv(row, ["location", "address", "city", "province", "state", "region"]));
  const scoreValue = pickCsv(row, ["score", "priority_score", "ai_score"]);
  return {
    id: `lead_csv_${Date.now()}_${rowNumber}_${Math.random().toString(36).slice(2, 9)}`,
    name: name || contact,
    contact: contact || "No contact provided",
    source: pickCsv(row, ["source", "platform"]) || "CSV Import",
    scrapedAt: new Date().toISOString(),
    contacts: buildLeadContactMethods(row),
    industry: pickCsv(row, ["industry", "category"]),
    location: pickCsv(row, ["location", "address", "city", "country"]),
    country,
    description: pickCsv(row, ["description", "notes", "note", "summary"]),
    score: scoreValue ? clampScore(scoreValue) : undefined,
    intent: normalizeIntent(pickCsv(row, ["intent"])),
    risk: normalizeRisk(pickCsv(row, ["risk"])),
    tags: csvTags(pickCsv(row, ["tags", "tag"])),
  };
}

type ImportJobStatus = "queued" | "running" | "completed" | "completed_with_errors" | "failed";

type ImportJobRecord = {
  id: string;
  type: "public_leads_csv" | "customers_csv";
  fileName: string;
  status: ImportJobStatus;
  totalRows: number;
  processedRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  retryAttempts: number;
  batchSize: number;
  currentBatch: number;
  totalBatches: number;
  message: string;
  errors: Array<{ rowNumber: number; reason: string; row: Record<string, string> }>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

const activeImportJobs = new Set<string>();

async function saveImportJob(job: ImportJobRecord) {
  await upsertRecord("import_jobs", job.id, job);
}

async function getImportJob(id: string) {
  return getRecord("import_jobs", id) as Promise<ImportJobRecord | undefined>;
}

async function updateImportJob(id: string, updates: Partial<ImportJobRecord>) {
  const current = await getImportJob(id);
  if (!current) return;
  await saveImportJob({ ...current, ...updates, updatedAt: new Date().toISOString() });
}

async function processCsvImportJob(
  jobId: string,
  csvText: string,
  config: {
    entity: "public_leads" | "customers";
    rowToRecord: (row: Record<string, string>, rowNumber: number) => any | null;
    duplicateKey: (record: any) => string;
  },
) {
  if (activeImportJobs.has(jobId)) return;
  activeImportJobs.add(jobId);
  try {
    const parsed = csvToObjects(csvText);
    const totalRows = parsed.rows.length;
    const batchSize = 100;
    const totalBatches = Math.max(1, Math.ceil(totalRows / batchSize));
    await updateImportJob(jobId, {
      status: "running",
      totalRows,
      batchSize,
      totalBatches,
      message: `Importing ${totalRows} row(s)...`,
    });

    const existing = await getRecordList(config.entity);
    const seenKeys = new Set(
      existing.map((item: any) => config.duplicateKey(item)),
    );
    let importedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;
    let retryAttempts = 0;
    const errors: ImportJobRecord["errors"] = [];

    for (let start = 0; start < totalRows; start += batchSize) {
      const batchRows = parsed.rows.slice(start, start + batchSize);
      const currentBatch = Math.floor(start / batchSize) + 1;
      await updateImportJob(jobId, {
        currentBatch,
        processedRows: start,
        importedRows,
        skippedRows,
        failedRows,
        retryAttempts,
        message: `Processing batch ${currentBatch} of ${totalBatches}...`,
      });

      let batchSaved = false;
      let lastBatchError = "";
      for (let attempt = 1; attempt <= 3 && !batchSaved; attempt += 1) {
        try {
          await withDb(async (client) => {
            for (let index = 0; index < batchRows.length; index += 1) {
              const row = batchRows[index];
              const rowNumber = start + index + 2;
              try {
                const record = config.rowToRecord(row, rowNumber);
                if (!record) {
                  skippedRows += 1;
                  continue;
                }
                const key = config.duplicateKey(record);
                if (seenKeys.has(key)) {
                  skippedRows += 1;
                  continue;
                }
                await client.query(
                  `
                  INSERT INTO crm_records (entity, id, data, updated_at)
                  VALUES ($1, $2, $3::jsonb, NOW())
                  ON CONFLICT (entity, id)
                  DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
                  `,
                  [config.entity, record.id, JSON.stringify(record)],
                );
                seenKeys.add(key);
                importedRows += 1;
              } catch (err: any) {
                failedRows += 1;
                errors.push({ rowNumber, reason: err.message || "Failed to import row.", row });
              }
            }
          });
          batchSaved = true;
        } catch (err: any) {
          lastBatchError = err.message || "Batch failed.";
          retryAttempts += 1;
          if (attempt < 3) {
            await updateImportJob(jobId, {
              currentBatch,
              processedRows: start,
              importedRows,
              skippedRows,
              failedRows,
              retryAttempts,
              errors,
              message: `Batch ${currentBatch} failed. Retrying attempt ${attempt + 1} of 3...`,
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      if (!batchSaved) {
        batchRows.forEach((row, index) => {
          failedRows += 1;
          errors.push({
            rowNumber: start + index + 2,
            reason: lastBatchError || "Batch failed after retries.",
            row,
          });
        });
      }

      await updateImportJob(jobId, {
        currentBatch,
        processedRows: Math.min(start + batchRows.length, totalRows),
        importedRows,
        skippedRows,
        failedRows,
        retryAttempts,
        errors,
        message: batchSaved
          ? `Imported batch ${currentBatch} of ${totalBatches}.`
          : `Skipped batch ${currentBatch} after 3 failed attempts.`,
      });
    }

    await updateImportJob(jobId, {
      status: failedRows > 0 ? "completed_with_errors" : "completed",
      processedRows: totalRows,
      importedRows,
      skippedRows,
      failedRows,
      retryAttempts,
      errors,
      message: `Imported ${importedRows} lead(s). ${skippedRows} duplicate/empty row(s) skipped. ${failedRows} row(s) failed.`,
      completedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    await updateImportJob(jobId, {
      status: "failed",
      message: err.message || "Import failed.",
      completedAt: new Date().toISOString(),
    });
  } finally {
    activeImportJobs.delete(jobId);
  }
}

function publicLeadDuplicateKey(item: any) {
  return `${item.source || ""}|${item.name || ""}|${item.contact || ""}`.toLowerCase();
}

function customerDuplicateKey(item: any) {
  return `${item.name || ""}|${item.contact || ""}`.toLowerCase();
}

async function processPublicLeadCsvImport(jobId: string, csvText: string) {
  return processCsvImportJob(jobId, csvText, {
    entity: "public_leads",
    rowToRecord: rowToPublicLead,
    duplicateKey: publicLeadDuplicateKey,
  });
}

async function processCustomerCsvImport(jobId: string, csvText: string) {
  return processCsvImportJob(jobId, csvText, {
    entity: "customers",
    rowToRecord: rowToCustomer,
    duplicateKey: customerDuplicateKey,
  });
}

async function getRecordPage(
  entity: string,
  page: number,
  pageSize: number,
  search = "",
  country = "",
  filters: Record<string, string> = {},
) {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safePageSize = Math.max(1, Math.min(Math.floor(Number(pageSize) || 50), 200));
  const offset = (safePage - 1) * safePageSize;
  const query = String(search || "").trim().toLowerCase();
  const normalizedCountryQuery = normalizeCountryName(country) || inferCountryFromLocation(country);

  return withDb(async (client) => {
    const params: unknown[] = [entity];
    let where = "WHERE entity = $1";
    if (query) {
      params.push(`%${query}%`);
      where += ` AND LOWER(data::text) LIKE $${params.length}`;
    }
    if (filters.channel && filters.channel !== "all") {
      params.push(filters.channel);
      where += ` AND data->>'channel' = $${params.length}`;
    }
    if (filters.mailbox === "sent") {
      where += ` AND ((data->>'direction') = 'outbound' OR (data->>'intent') = 'Outbound')`;
    } else if (filters.mailbox === "inbox") {
      where += ` AND COALESCE(data->>'direction', '') <> 'outbound' AND COALESCE(data->>'intent', '') <> 'Outbound'`;
    }

    if (normalizedCountryQuery) {
      const dataResult = await client.query(
        `SELECT data FROM crm_records ${where} ORDER BY updated_at DESC`,
        params,
      );
      const filteredRecords = dataResult.rows
        .map((row) => row.data)
        .filter((record) => recordCountry(record) === normalizedCountryQuery);
      const total = filteredRecords.length;
      return {
        records: filteredRecords.slice(offset, offset + safePageSize),
        total,
        page: safePage,
        pageSize: safePageSize,
        totalPages: Math.max(1, Math.ceil(total / safePageSize)),
      };
    }

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM crm_records ${where}`,
      params,
    );
    const total = Number(countResult.rows[0]?.count || 0);

    params.push(safePageSize, offset);
    const dataResult = await client.query(
      `
      SELECT data
      FROM crm_records
      ${where}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
      `,
      params,
    );

    return {
      records: dataResult.rows.map((row) => row.data),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };
  });
}

async function getRecordCountryStats(entity: string) {
  return withDb(async (client) => {
    const result = await client.query(
      "SELECT data FROM crm_records WHERE entity = $1",
      [entity],
    );
    const counts = new Map<string, number>();
    result.rows.forEach((row) => {
      const country = recordCountry(row.data || {});
      counts.set(country, (counts.get(country) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
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

async function deleteRecords(entity: string, ids: string[]) {
  const safeIds = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (safeIds.length === 0) return 0;
  return withDb(async (client) => {
    const result = await client.query(
      "DELETE FROM crm_records WHERE entity = $1 AND id = ANY($2::text[])",
      [entity, safeIds],
    );
    return result.rowCount || 0;
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

app.post("/api/imports/public-leads/csv", async (req, res) => {
  if (!requireDatabase(res)) return;
  const csvText = String(req.body?.csvText || "");
  const fileName = String(req.body?.fileName || "public-pool.csv");
  if (!csvText.trim()) {
    res.status(400).json({ error: "csvText is required." });
    return;
  }

  try {
    const parsed = csvToObjects(csvText);
    if (parsed.rows.length === 0) {
      res.status(400).json({ error: "No importable rows found." });
      return;
    }
    const job: ImportJobRecord = {
      id: `import_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: "public_leads_csv",
      fileName,
      status: "queued",
      totalRows: parsed.rows.length,
      processedRows: 0,
      importedRows: 0,
      skippedRows: 0,
      failedRows: 0,
      retryAttempts: 0,
      batchSize: 100,
      currentBatch: 0,
      totalBatches: Math.max(1, Math.ceil(parsed.rows.length / 100)),
      message: "Import queued.",
      errors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveImportJob(job);
    setTimeout(() => {
      processPublicLeadCsvImport(job.id, csvText).catch((err) => {
        console.error("Public Pool CSV import failed:", err);
      });
    }, 0);
    res.status(202).json(job);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/imports/customers/csv", async (req, res) => {
  if (!requireDatabase(res)) return;
  const csvText = String(req.body?.csvText || "");
  const fileName = String(req.body?.fileName || "my-customers.csv");
  if (!csvText.trim()) {
    res.status(400).json({ error: "csvText is required." });
    return;
  }

  try {
    const parsed = csvToObjects(csvText);
    if (parsed.rows.length === 0) {
      res.status(400).json({ error: "No importable rows found." });
      return;
    }
    const job: ImportJobRecord = {
      id: `import_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: "customers_csv",
      fileName,
      status: "queued",
      totalRows: parsed.rows.length,
      processedRows: 0,
      importedRows: 0,
      skippedRows: 0,
      failedRows: 0,
      retryAttempts: 0,
      batchSize: 100,
      currentBatch: 0,
      totalBatches: Math.max(1, Math.ceil(parsed.rows.length / 100)),
      message: "Customer import queued.",
      errors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveImportJob(job);
    setTimeout(() => {
      processCustomerCsvImport(job.id, csvText).catch((err) => {
        console.error("Customer CSV import failed:", err);
      });
    }, 0);
    res.status(202).json(job);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/imports", async (req, res) => {
  if (!requireDatabase(res)) return;
  const type = String(req.query.type || "");
  const status = String(req.query.status || "");
  try {
    const jobs = (await getRecordList("import_jobs") as ImportJobRecord[])
      .filter((job) => !type || job.type === type)
      .filter((job) => !status || job.status === status)
      .sort((a, b) => Date.parse(b.createdAt || b.updatedAt || "") - Date.parse(a.createdAt || a.updatedAt || ""))
      .slice(0, 50);
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/imports/prune", async (req, res) => {
  if (!requireDatabase(res)) return;
  const olderThanDays = Math.max(1, Number(req.body?.olderThanDays || 30));
  const statuses = Array.isArray(req.body?.statuses)
    ? req.body.statuses.map(String)
    : ["completed", "completed_with_errors", "failed"];
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  try {
    const jobs = await getRecordList("import_jobs") as ImportJobRecord[];
    const ids = jobs
      .filter((job) => statuses.includes(job.status))
      .filter((job) => Date.parse(job.completedAt || job.updatedAt || job.createdAt || "") < cutoff)
      .map((job) => job.id);
    const deleted = ids.length > 0 ? await deleteRecords("import_jobs", ids) : 0;
    res.json({ success: true, deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/imports/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const job = await getImportJob(req.params.id);
    job ? res.json(job) : res.status(404).json({ error: "Import job not found." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/imports/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    await deleteRecord("import_jobs", req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/imports/:id/retry-failed", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const sourceJob = await getImportJob(req.params.id);
    if (!sourceJob) {
      res.status(404).json({ error: "Import job not found." });
      return;
    }
    const failedRows = (sourceJob.errors || []).map((error) => error.row).filter(Boolean);
    if (failedRows.length === 0) {
      res.status(400).json({ error: "This import job has no failed rows to retry." });
      return;
    }
    const csvText = rowsToCsv(failedRows);
    if (!csvText) {
      res.status(400).json({ error: "Failed rows do not contain retryable data." });
      return;
    }
    const job: ImportJobRecord = {
      id: `import_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: sourceJob.type,
      fileName: `${sourceJob.fileName || sourceJob.id}-retry-failed.csv`,
      status: "queued",
      totalRows: failedRows.length,
      processedRows: 0,
      importedRows: 0,
      skippedRows: 0,
      failedRows: 0,
      retryAttempts: 0,
      batchSize: 100,
      currentBatch: 0,
      totalBatches: Math.max(1, Math.ceil(failedRows.length / 100)),
      message: `Retry queued from ${sourceJob.id}.`,
      errors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveImportJob(job);
    setTimeout(() => {
      const processRetry = sourceJob.type === "customers_csv"
        ? processCustomerCsvImport
        : processPublicLeadCsvImport;
      processRetry(job.id, csvText).catch((err) => {
        console.error("Failed-row retry import failed:", err);
      });
    }, 0);
    res.status(202).json(job);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/imports/:id/failed-csv", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const job = await getImportJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Import job not found." });
      return;
    }
    const headers = Array.from(
      new Set(job.errors.flatMap((error) => Object.keys(error.row || {}))),
    );
    const rows = [
      ["row_number", "reason", ...headers],
      ...job.errors.map((error) => [
        String(error.rowNumber),
        error.reason,
        ...headers.map((header) => String(error.row?.[header] || "")),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((value) => csvEscape(value))
          .join(","),
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${job.id}-failed-rows.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

type ServerAgent = {
  id: string;
  name: string;
  role?: string;
  status?: "Active" | "Idle" | "Disabled";
  harness?: "Auto" | "Human-in-the-loop";
  tools?: string[];
  integrations?: string[];
  workflowIds?: string[];
  schedule?: {
    mode?: "interval" | "monthly";
    intervalEvery?: number;
    intervalUnit?: "seconds" | "minutes" | "hours" | "days";
    monthlyDay?: number;
    maxRuns?: number;
    executedRuns?: number;
    lastRunAt?: string;
  };
};

type ServerWorkflow = {
  id: string;
  name: string;
  operationType: string;
  targetType: "lead" | "customer" | "platform";
  requiredTools: string[];
  repeatable: boolean;
};

const serverAgentWorkflows: ServerWorkflow[] = [
  { id: "lead_scoring", name: "AI Lead Analysis", operationType: "lead_ai_analysis", targetType: "lead", requiredTools: ["customers", "knowledge"], repeatable: false },
  { id: "lead_enrichment", name: "Lead Generation Platforms", operationType: "lead_platform_collection", targetType: "platform", requiredTools: ["lead_platforms"], repeatable: true },
  { id: "customer_scoring", name: "Customer Scoring", operationType: "customer_scoring", targetType: "customer", requiredTools: ["customers"], repeatable: false },
  { id: "quote_draft", name: "Quote Draft", operationType: "quote_generation", targetType: "customer", requiredTools: ["customers", "quotes"], repeatable: false },
];

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}

function intervalToMs(schedule: ServerAgent["schedule"]) {
  const every = Math.max(1, schedule?.intervalEvery || 1);
  const unit = schedule?.intervalUnit || "days";
  if (unit === "seconds") return every * 1000;
  if (unit === "minutes") return every * 60 * 1000;
  if (unit === "hours") return every * 60 * 60 * 1000;
  return every * 24 * 60 * 60 * 1000;
}

function sameLocalDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function isServerAgentDue(agent: ServerAgent, now: Date) {
  const schedule = agent.schedule;
  if (!schedule || agent.status !== "Active") return false;
  if ((schedule.maxRuns || 0) > 0 && (schedule.executedRuns || 0) >= (schedule.maxRuns || 0)) return false;
  if (schedule.mode === "monthly") {
    const day = Math.min(Math.max(1, schedule.monthlyDay || 1), daysInMonth(now));
    if (now.getDate() !== day) return false;
    return !(schedule.lastRunAt && sameLocalDate(new Date(schedule.lastRunAt), now));
  }
  if (!schedule.lastRunAt) return true;
  const lastRunAt = new Date(schedule.lastRunAt).getTime();
  if (Number.isNaN(lastRunAt)) return true;
  return now.getTime() - lastRunAt >= intervalToMs(schedule);
}

function serverAgentWorkflowsFor(agent: ServerAgent) {
  const allowed = new Set(agent.workflowIds || []);
  return serverAgentWorkflows.filter((workflow) =>
    allowed.has(workflow.id) &&
    workflow.requiredTools.every((tool) => (agent.tools || []).includes(tool)),
  );
}

function operationKey(workflow: ServerWorkflow, target: any) {
  return `${workflow.operationType}:${target.type}:${String(target.id).toLowerCase()}`;
}

async function serverDuplicateRunExists(key?: string) {
  if (!key) return false;
  const runs = await getRecordList("agent_runs");
  return runs.some((run: any) =>
    run.operationKey === key &&
    run.repeatable === false &&
    ["Running", "Pending", "Completed"].includes(run.status),
  );
}

async function serverWorkflowTargets(workflow: ServerWorkflow, agent?: ServerAgent) {
  if (workflow.targetType === "lead") {
    return (await getRecordList("public_leads")).map((lead: any) => ({
      type: "lead",
      id: lead.id,
      label: lead.name,
      record: lead,
    }));
  }
  if (workflow.targetType === "customer") {
    return (await getRecordList("customers")).map((customer: any) => ({
      type: "customer",
      id: customer.id,
      label: customer.name,
      record: customer,
    }));
  }
  if (workflow.targetType === "platform") {
    return (await getServerEnabledLeadPlatforms(agent)).map((platform) => ({
      type: "platform",
      id: platform.id,
      label: platform.name,
      record: platform,
    }));
  }
  return [];
}

async function updateServerAgentSchedule(agent: ServerAgent, now: Date) {
  await upsertRecord("agents", agent.id, {
    ...agent,
    schedule: {
      ...agent.schedule,
      mode: agent.schedule?.mode || "interval",
      lastRunAt: now.toISOString(),
      executedRuns: (agent.schedule?.executedRuns || 0) + 1,
    },
  });
}

async function addServerAgentRun(run: any) {
  const record = {
    ...run,
    id: randomId("run"),
    createdAt: new Date().toISOString(),
  };
  await upsertRecord("agent_runs", record.id, record);
  return record;
}

async function addServerAgentStep(step: any) {
  const record = {
    ...step,
    id: randomId("step"),
    createdAt: new Date().toISOString(),
  };
  await upsertRecord("agent_steps", record.id, record);
  return record;
}

async function addServerApproval(approval: any) {
  const record = {
    ...approval,
    id: randomId("approval"),
    createdAt: new Date().toISOString(),
  };
  await upsertRecord("agent_approvals", record.id, record);
  return record;
}

function stableServerScore(parts: Array<string | undefined>) {
  const text = parts.filter(Boolean).join("|").toLowerCase();
  const total = Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return Math.max(35, Math.min(95, 35 + (total % 61)));
}

function scoreToIntent(score: number) {
  if (score >= 75) return "High";
  if (score >= 55) return "Medium";
  return "Low";
}

function scoreToRisk(score: number) {
  if (score >= 75) return "Low";
  if (score >= 55) return "Medium";
  return "High";
}

async function executeServerWorkflow(agent: ServerAgent, workflow: ServerWorkflow, target: any) {
  if (workflow.id === "lead_scoring") {
    const lead = target.record;
    const score = stableServerScore([lead.name, lead.contact, lead.industry, lead.location, lead.source]);
    const updatedLead = {
      ...lead,
      score,
      intent: scoreToIntent(score),
      risk: scoreToRisk(score),
      aiAnalysis: `${lead.name} was analyzed by the server-side scheduler using source quality, contact completeness, industry fit, and location signals.`,
      recommendedAction: score >= 75 ? "Prioritize human outreach." : score >= 55 ? "Enrich and schedule follow-up." : "Keep in nurture.",
      scoredAt: new Date().toISOString(),
    };
    await upsertRecord("public_leads", lead.id, updatedLead);
    return {
      steps: [
        { toolName: "lead.read", outputJson: lead, status: "Success" },
        { toolName: "ai.lead_analysis", outputJson: { score, intent: updatedLead.intent, risk: updatedLead.risk }, status: "Success" },
        { toolName: "lead.update", outputJson: updatedLead, status: "Success" },
      ],
      outputJson: { leadId: lead.id, score, intent: updatedLead.intent, risk: updatedLead.risk },
    };
  }

  if (workflow.id === "lead_enrichment") {
    const platform = target.record || (await getServerEnabledLeadPlatforms(agent)).find((item) => item.id === target.id);
    if (!platform) {
      throw new Error("This Lead Generation Platform is not enabled for the agent. Configure it in Settings > Integrations first.");
    }
    const runtime = await deriveServerLeadPlatformRuntime(agent);
    const result = await runLeadPlatformRequest(platform.id, platform.name, platform.config, runtime);
    const importedCount = await mergeServerPublicLeads(result.leads);
    return {
      steps: [
        { toolName: "lead_generation_platforms.load", outputJson: sanitizeLeadPlatform(platform), status: "Success" },
        {
          toolName: "lead_generation_platforms.request",
          inputJson: { platform: platform.name, baseUrl: platform.baseUrl, runtime: result.runtime },
          outputJson: { requestedUrl: result.requestedUrl, rawCount: result.rawCount, sample: result.rawSample },
          status: "Success",
        },
        {
          toolName: "public_leads.import",
          inputJson: { platform: platform.name },
          outputJson: { returnedLeads: result.leads.length, importedCount },
          status: "Success",
        },
      ],
      outputJson: {
        platform: platform.name,
        baseUrl: platform.baseUrl,
        returnedLeads: result.leads.length,
        importedCount,
        mockDataCreated: false,
      },
    };
  }

  if (workflow.id === "customer_scoring") {
    const customer = target.record;
    const score = stableServerScore([customer.name, customer.contact, customer.industry, customer.stage, customer.notes]);
    const updatedCustomer = {
      ...customer,
      score,
      intent: scoreToIntent(score),
      risk: scoreToRisk(score),
      logs: [
        { id: randomId("log"), time: new Date().toISOString(), event: `Server scheduler refreshed customer score to ${score}.`, type: "ai" },
        ...(customer.logs || []),
      ],
    };
    await upsertRecord("customers", customer.id, updatedCustomer);
    return {
      steps: [
        { toolName: "customer.read", outputJson: customer, status: "Success" },
        { toolName: "customer.score", outputJson: { score, intent: updatedCustomer.intent, risk: updatedCustomer.risk }, status: "Success" },
        { toolName: "customer.update", outputJson: updatedCustomer, status: "Success" },
      ],
      outputJson: { customerId: customer.id, score, intent: updatedCustomer.intent, risk: updatedCustomer.risk },
    };
  }

  if (workflow.id === "quote_draft") {
    const customer = target.record;
    const product = (await getRecordList("products")).find((item: any) => item.status === "Active");
    if (!product) throw new Error("No active product is available for quote drafting.");
    const unitPrice = product.pricingTiers?.[0]?.unitPrice ?? product.price ?? 0;
    const total = unitPrice;
    const quote = {
      id: randomId("quote"),
      customerId: customer.id,
      date: new Date().toISOString().slice(0, 10),
      validUntil: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      items: [{ productId: product.id, name: product.name, quantity: 1, unitPrice, discount: 0, total }],
      subtotal: total,
      totalDiscount: 0,
      total,
      status: "Draft",
      notes: `Drafted by server-side scheduler for ${agent.name}.`,
    };
    await upsertRecord("quotes", quote.id, quote);
    return {
      steps: [
        { toolName: "customer.read", outputJson: customer, status: "Success" },
        { toolName: "product.select", outputJson: product, status: "Success" },
        { toolName: "quote.create", outputJson: quote, status: "Success" },
      ],
      outputJson: { customerId: customer.id, productId: product.id, quoteId: quote.id, total },
    };
  }

  throw new Error(`Server-side workflow ${workflow.id} is not available yet.`);
}

async function writeServerSchedulerFailure(agent: ServerAgent, message: string, now: Date) {
  const run = await addServerAgentRun({
    agentId: agent.id,
    taskType: `Scheduled: ${agent.name}`,
    status: "Failed",
    currentStep: "Skipped",
    targetType: "global",
    repeatable: true,
    inputJson: { scheduled: true, schedule: agent.schedule, serverSide: true },
    outputJson: { reason: message },
    errorMessage: message,
  });
  await addServerAgentStep({
    runId: run.id,
    stepType: "Thought",
    toolName: "server.scheduler.skip",
    inputJson: { agentId: agent.id, schedule: agent.schedule },
    outputJson: { message },
    status: "Failed",
  });
  await updateServerAgentSchedule(agent, now);
}

async function runServerAgentIfDue(agent: ServerAgent, now: Date) {
  if (!isServerAgentDue(agent, now)) return false;
  const workflows = serverAgentWorkflowsFor(agent);
  if (workflows.length === 0) {
    await writeServerSchedulerFailure(agent, "No enabled server-side workflow is available for this agent.", now);
    return true;
  }

  for (const workflow of workflows) {
    const targets = await serverWorkflowTargets(workflow, agent);
    for (const target of targets) {
      const key = workflow.repeatable ? undefined : operationKey(workflow, target);
      if (await serverDuplicateRunExists(key)) continue;
      const run = await addServerAgentRun({
        agentId: agent.id,
        workflowId: workflow.id,
        taskType: `Scheduled: ${workflow.name}: ${target.label}`,
        status: agent.harness === "Human-in-the-loop" ? "Pending" : "Running",
        currentStep: agent.harness === "Human-in-the-loop" ? "Awaiting Approval" : "Executing",
        operationKey: key,
        operationType: workflow.operationType,
        targetType: target.type,
        targetId: target.id,
        repeatable: workflow.repeatable,
        inputJson: { scheduled: true, serverSide: true, workflowId: workflow.id, target, schedule: agent.schedule },
      });
      await addServerAgentStep({
        runId: run.id,
        stepType: "Thought",
        toolName: "server.scheduler.trigger",
        inputJson: { agentId: agent.id, workflowId: workflow.id, target },
        outputJson: { role: agent.role, harness: agent.harness },
        status: "Success",
      });
      if (agent.harness === "Human-in-the-loop") {
        await addServerApproval({
          runId: run.id,
          actionType: "execute_workflow",
          proposedPayload: { agentId: agent.id, workflowId: workflow.id, target, scheduled: true, serverSide: true },
          status: "Pending",
        });
        await updateServerAgentSchedule(agent, now);
        return true;
      }
      try {
        const result = await executeServerWorkflow(agent, workflow, target);
        for (const step of result.steps) {
          await addServerAgentStep({ runId: run.id, stepType: "Tool", ...step });
        }
        await upsertRecord("agent_runs", run.id, {
          ...run,
          status: "Completed",
          currentStep: "Completed",
          outputJson: result.outputJson,
          toolResults: result.steps,
        });
      } catch (err: any) {
        await addServerAgentStep({
          runId: run.id,
          stepType: "Tool",
          toolName: workflow.id,
          outputJson: { error: err.message },
          status: "Failed",
        });
        await upsertRecord("agent_runs", run.id, {
          ...run,
          status: "Failed",
          currentStep: "Failed",
          errorMessage: err.message,
        });
      }
      await updateServerAgentSchedule(agent, now);
      return true;
    }
  }
  await writeServerSchedulerFailure(agent, "No eligible target is available for server-side scheduled execution.", now);
  return true;
}

let serverAgentSchedulerRunning = false;
const serverAgentSchedulerState = {
  lastStartedAt: "",
  lastFinishedAt: "",
  lastReason: "",
  lastRan: 0,
  lastError: "",
};

async function tickServerAgentScheduler(reason = "timer") {
  if (!hasDatabase || serverAgentSchedulerRunning) return { ran: 0 };
  serverAgentSchedulerRunning = true;
  let ran = 0;
  serverAgentSchedulerState.lastStartedAt = new Date().toISOString();
  serverAgentSchedulerState.lastReason = reason;
  serverAgentSchedulerState.lastError = "";
  try {
    const now = new Date();
    const agents = await getRecordList("agents") as ServerAgent[];
    for (const agent of agents) {
      if (await runServerAgentIfDue(agent, now)) ran += 1;
    }
    if (ran > 0) console.log(`[server-agent-scheduler] ${reason}: processed ${ran} agent(s).`);
    serverAgentSchedulerState.lastRan = ran;
    return { ran };
  } catch (err: any) {
    serverAgentSchedulerState.lastError = err.message || "Server agent scheduler failed.";
    throw err;
  } finally {
    serverAgentSchedulerState.lastFinishedAt = new Date().toISOString();
    serverAgentSchedulerRunning = false;
  }
}

function startServerAgentScheduler() {
  if (!hasDatabase) return;
  setTimeout(() => tickServerAgentScheduler("startup").catch(console.error), 8000);
  setInterval(() => tickServerAgentScheduler("timer").catch(console.error), SERVER_AGENT_SCHEDULER_INTERVAL_MS);
  console.log(`Server-side agent scheduler enabled every ${SERVER_AGENT_SCHEDULER_INTERVAL_MS}ms.`);
}

app.post("/api/agent/scheduler/tick", async (_req, res) => {
  if (!requireDatabase(res)) return;
  try {
    res.json({ success: true, ...(await tickServerAgentScheduler("manual-api")) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function crudRoutes(entity: string, route: string) {
  app.get(route, async (_req, res) => {
    if (!requireDatabase(res)) return;
    try {
      const req = _req as express.Request;
      if (req.query.page || req.query.pageSize || req.query.search) {
        res.json(await getRecordPage(
          entity,
          Number(req.query.page || 1),
          Number(req.query.pageSize || 50),
          String(req.query.search || ""),
          String(req.query.country || ""),
          {
            channel: String(req.query.channel || ""),
            mailbox: String(req.query.mailbox || ""),
          },
        ));
        return;
      }
      res.json(await getRecordList(entity));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get(`${route}/stats/countries`, async (_req, res) => {
    if (!requireDatabase(res)) return;
    try {
      res.json(await getRecordCountryStats(entity));
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

  app.post(`${route}/bulk-delete`, async (req, res) => {
    if (!requireDatabase(res)) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array." });
      return;
    }
    try {
      const deleted = await deleteRecords(entity, ids);
      res.json({ success: true, deleted });
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
crudRoutes("public_leads", "/api/crm/public-leads");
crudRoutes("products", "/api/crm/products");
crudRoutes("quotes", "/api/crm/quotes");
crudRoutes("inbox_messages", "/api/communication/inbox");
crudRoutes("agent_pending_actions", "/api/agent/actions/pending");
crudRoutes("model_profiles", "/api/model-profiles");
crudRoutes("agents", "/api/agents");
crudRoutes("agent_runs", "/api/agent/runs");
crudRoutes("agent_steps", "/api/agent/steps");
crudRoutes("agent_approvals", "/api/agent/approvals");
crudRoutes("knowledge_documents", "/api/knowledge");
crudRoutes("app_users", "/api/app/users");
crudRoutes("app_settings", "/api/app/settings");
crudRoutes("media_items", "/api/media");
crudRoutes("email_receive_profiles", "/api/email/receive-profiles");
crudRoutes("email_send_profiles", "/api/email/send-profiles");
crudRoutes("email_signatures", "/api/email/signatures");
crudRoutes("email_mappings", "/api/email/mappings");

function cleanWooText(value = "") {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWooPrice(product: any) {
  const raw = product.sale_price || product.price || product.regular_price || "0";
  const parsed = Number(String(raw).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

app.post("/api/integrations/woocommerce/products", async (req, res) => {
  const {
    siteUrl = "",
    consumerKey = "",
    consumerSecret = "",
    perPage = 50,
    page = 1,
    pages = 3,
    status = "any",
  } = req.body || {};
  const baseUrl = String(siteUrl || "").trim().replace(/\/+$/, "");
  const key = String(consumerKey || "").trim();
  const secret = String(consumerSecret || "").trim();
  if (!baseUrl || !key || !secret) {
    res.status(400).json({ error: "WordPress site URL, Consumer Key, and Consumer Secret are required." });
    return;
  }

  try {
    const imported: any[] = [];
    const safePerPage = Math.max(1, Math.min(Number(perPage) || 50, 100));
    const safeStartPage = Math.max(1, Number(page) || 1);
    const safePages = Math.max(1, Math.min(Number(pages) || 3, 10));
    let fetchedPages = 0;
    let lastRequestedPage = safeStartPage - 1;
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");

    for (let pageIndex = 0; pageIndex < safePages; pageIndex += 1) {
      const currentPage = safeStartPage + pageIndex;
      lastRequestedPage = currentPage;
      const params = new URLSearchParams({
        per_page: String(safePerPage),
        page: String(currentPage),
        orderby: "date",
        order: "desc",
      });
      if (status && status !== "any") params.set("status", String(status));
      const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?${params.toString()}`, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.message || data?.error || `WooCommerce returned HTTP ${response.status}.`;
        throw new Error(String(message));
      }
      if (!Array.isArray(data) || data.length === 0) break;
      imported.push(...data);
      fetchedPages += 1;
      if (data.length < safePerPage) break;
    }

    const products = imported.map((product) => {
      const price = parseWooPrice(product);
      const sku = String(product.sku || `woo-${product.id}`);
      return {
        name: String(product.name || sku),
        description: cleanWooText(product.short_description || product.description || ""),
        sku,
        price,
        pricingTiers: [{ minQty: 1, unitPrice: price }],
        currency: String(product.currency || req.body.currency || "USD"),
        status: product.status === "publish" || product.status === "private" ? "Active" : "Inactive",
        image: product.images?.[0]?.src || "",
        source: "woocommerce",
        sourceId: String(product.id),
        sourceSlug: String(product.slug || ""),
        sourceUrl: product.permalink || `${baseUrl}/?p=${product.id}`,
      };
    });

    res.json({
      products,
      count: products.length,
      page: safeStartPage,
      pages: safePages,
      fetchedPages,
      nextPage: products.length > 0 ? lastRequestedPage + 1 : safeStartPage,
    });
  } catch (err: any) {
    res.status(500).json({ error: `WooCommerce import failed: ${err.message}` });
  }
});

const inboxEventClients = new Set<express.Response>();

function broadcastInboxEvent(payload: unknown) {
  const data = JSON.stringify(payload);
  inboxEventClients.forEach((client) => {
    client.write(`event: inbox.updated\n`);
    client.write(`data: ${data}\n\n`);
  });
}

function webhookMessageClientId(message: any) {
  return String(message?.client_id || message?.clientId || "");
}

function webhookMessageChatId(message: any) {
  return String(
    message?.chatId ||
      message?.chat_id ||
      message?.chatid ||
      message?.raw_chat_id ||
      message?.sender ||
      message?.recipient ||
      "unknown",
  );
}

function webhookMessageConversationKey(message: any) {
  return String(
    message?.contact_phone ||
      message?.conversation_key ||
      message?.conversation_id ||
      message?.mob ||
      message?.mobile ||
      webhookMessageChatId(message),
  );
}

function webhookMessageBody(message: any) {
  return String(message?.body || message?.payload?.caption || "");
}

function webhookMessageAttachments(message: any) {
  const media = message?.payload?.media;
  if (!media?.url) return [];
  const mimeType = String(media.mimeType || media.type || "application/octet-stream");
  return [
    {
      id: String(media.id || media.whatsappMessageId || message.id || media.url),
      name: String(media.originalName || media.name || (mimeType.startsWith("image/") ? "WhatsApp image" : "WhatsApp media")),
      url: String(media.url),
      type: mimeType,
      mimeType,
      size: Number(media.size || 0),
    },
  ];
}

async function getWaHubUserIdsForClient(clientId: string) {
  if (!clientId) return [];
  return withDb(async (client) => {
    const result = await client.query(
      "SELECT id, data FROM crm_records WHERE entity = 'app_settings' AND id LIKE 'wa_hub_actors:%'",
    );
    return result.rows
      .filter((row) => {
        const actors = row.data?.value;
        return Array.isArray(actors) && actors.some((actor) => String(actor?.clientId || "") === clientId);
      })
      .map((row) => String(row.id).replace(/^wa_hub_actors:/, ""))
      .filter(Boolean);
  });
}

async function upsertWhatsAppWebhookInboxMessage(message: any, userId: string, sentAt?: string) {
  const clientId = webhookMessageClientId(message);
  const conversationKey = webhookMessageConversationKey(message);
  const previewId = `wa_chat_${clientId}:${conversationKey}`;
  const createdAt = String(message?.created_at || message?.createdAt || message?.timestamp || sentAt || new Date().toISOString());
  const timestamp = Date.parse(createdAt) || Date.now();
  const attachments = webhookMessageAttachments(message);
  const body = webhookMessageBody(message);
  const summary = body || attachments[0]?.name || (message?.message_type === "media" ? "WhatsApp media" : "");
  const existing = await getRecord("inbox_messages", previewId);
  const threadId = `t_${String(message?.id || createHash("sha1").update(`${clientId}:${conversationKey}:${createdAt}:${body}`).digest("hex"))}`;
  const existingThread = Array.isArray(existing?.thread) ? existing.thread : [];
  const thread = existingThread.some((item: any) => item?.id === threadId)
    ? existingThread
    : [
        ...existingThread,
        {
          id: threadId,
          sender: message?.direction === "outbound" ? "agent" : "user",
          content: body,
          attachments,
          time: new Date(timestamp).toLocaleTimeString(),
        },
      ];

  const mappedMob =
    message?.contact_phone ||
    message?.mob ||
    message?.mobile ||
    (message?.direction === "outbound" ? message?.recipient : message?.sender) ||
    conversationKey;

  const next = {
    ...(existing || {}),
    id: previewId,
    chatId: conversationKey,
    waClientId: clientId,
    userId,
    mob: mappedMob,
    sender: mappedMob || message?.sender || conversationKey,
    target: mappedMob || message?.recipient || conversationKey,
    intent: "WhatsApp",
    subject: "WhatsApp conversation",
    summary,
    channel: "WhatsApp",
    date: new Date(timestamp).toLocaleString(),
    direction: message?.direction === "outbound" ? "outbound" : "inbound",
    read: existing?.read ?? message?.direction === "outbound",
    thread,
  };

  await upsertRecord("inbox_messages", previewId, next);
  return next;
}

app.post("/api/webhooks/whatsapp-hub", async (req, res) => {
  if (!requireDatabase(res)) return;
  const expectedSecret = process.env.WA_HUB_WEBHOOK_SECRET || "";
  const receivedSecret = String(req.header("x-hub-signature") || "");
  if (expectedSecret && receivedSecret !== expectedSecret) {
    res.status(401).json({ error: "Invalid WhatsApp Hub webhook signature." });
    return;
  }

  try {
    const event = String(req.body?.event || "");
    if (event !== "message.created") {
      res.json({ success: true, ignored: true });
      return;
    }

    const message = req.body?.data || {};
    const clientId = webhookMessageClientId(message);
    const allowedUserIds = await getWaHubUserIdsForClient(clientId);
    if (allowedUserIds.length === 0) {
      res.json({ success: true, ignored: true, reason: "client_not_configured" });
      return;
    }

    const records = await Promise.all(
      allowedUserIds.map((userId) => upsertWhatsAppWebhookInboxMessage(message, userId, req.body?.sentAt)),
    );
    broadcastInboxEvent({ source: "whatsapp-hub", event, clientId, records: records.length });
    res.json({ success: true, records: records.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/communication/inbox-events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: connected\n`);
  res.write(`data: {"success":true}\n\n`);
  inboxEventClients.add(res);

  const keepAlive = setInterval(() => {
    res.write(`: keep-alive\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    inboxEventClients.delete(res);
    res.end();
  });
});

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

async function syncImapEmails({
  mappings = [],
  receiveProfiles = [],
  limit = 25,
}: {
    mappings?: Array<{ id: string; name: string; receiveProfileId: string }>;
    receiveProfiles?: any[];
    limit?: number;
  }) {
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

  return { emails, errors, syncVersion: IMAP_SYNC_VERSION };
}

app.post("/api/email/sync-imap", async (req, res) => {
  const { mappings = [], receiveProfiles = [], limit = 25 } = req.body as {
    mappings?: Array<{ id: string; name: string; receiveProfileId: string }>;
    receiveProfiles?: any[];
    limit?: number;
  };
  const { emails, errors, syncVersion } = await syncImapEmails({ mappings, receiveProfiles, limit });

  if (emails.length === 0 && errors.length > 0) {
    return res.status(400).json({ error: errors.join(" | "), emails: [], syncVersion });
  }
  res.json({ success: true, emails, errors, syncVersion });
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

type ServerLeadPlatform = {
  id: string;
  name: string;
  baseUrl?: string;
  config: LeadPlatformRunConfig;
};

const leadPlatformNames: Record<string, string> = {
  outscraper: "Outscraper",
  apify: "Apify",
  phantombuster: "PhantomBuster",
  scrap_io: "Scrap.io",
  hasdata: "HasData",
  decodo: "Decodo",
  clay_com: "Clay.com",
};

function parseAppSettingValue(record: any) {
  const value = record?.value;
  if (typeof value !== "string") return value || {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function loadServerLeadPlatformConfigs() {
  const record = await getRecord("app_settings", "lead_platform_configs");
  const value = parseAppSettingValue(record);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, LeadPlatformRunConfig>
    : {};
}

function sanitizeLeadPlatform(platform: ServerLeadPlatform) {
  return {
    ...platform,
    config: {
      ...platform.config,
      apiKey: platform.config.apiKey ? "********" : "",
    },
  };
}

async function getServerEnabledLeadPlatforms(agent?: ServerAgent): Promise<ServerLeadPlatform[]> {
  const configs = await loadServerLeadPlatformConfigs();
  const allowed = new Set(agent?.integrations || []);
  return Object.entries(configs)
    .filter(([, config]) => config?.enabled)
    .map(([id, config]) => ({
      id,
      name: leadPlatformNames[id] || id,
      baseUrl: config.baseUrl,
      config,
    }))
    .filter((platform) =>
      allowed.size === 0 ||
      allowed.has(platform.name) ||
      allowed.has(platform.id) ||
      allowed.has(platform.id.replace(/_/g, "-")),
    );
}

async function deriveServerLeadPlatformRuntime(agent: ServerAgent): Promise<LeadPlatformRuntime> {
  const [products, customers, publicLeads] = await Promise.all([
    getRecordList("products"),
    getRecordList("customers"),
    getRecordList("public_leads"),
  ]);
  const activeProducts = products.filter((product: any) => product.status === "Active");
  const productTerms = activeProducts
    .slice(0, 3)
    .flatMap((product: any) => [product.name, product.description])
    .filter(Boolean)
    .join(" ");
  const industryTerms = [
    ...customers.map((customer: any) => customer.industry),
    ...publicLeads.map((lead: any) => lead.industry),
  ].filter(Boolean);
  const locationTerms = [
    ...customers.map((customer: any) => customer.country || customer.city),
    ...publicLeads.map((lead: any) => lead.location),
  ].filter(Boolean);
  const industry = String(industryTerms[0] || "businesses");
  const location = String(locationTerms[0] || "");
  const query = [productTerms || agent.role || "business leads", industry]
    .filter(Boolean)
    .join(" ")
    .slice(0, 220);
  return {
    query,
    location,
    limit: 10,
    source: {
      products: activeProducts.slice(0, 3).map((product: any) => product.name),
      industry,
      location,
    },
  };
}

async function runLeadPlatformRequest(
  platformId: string,
  platformName: string,
  config: LeadPlatformRunConfig = {},
  runtime: LeadPlatformRuntime = {},
) {
  const configError = (message: string) => {
    const err = new Error(message) as Error & { status?: number };
    err.status = 400;
    return err;
  };
  if (!platformId || !platformName) throw configError("Platform ID and name are required.");
  if (!config.enabled) throw configError(`${platformName} is disabled.`);
  if (!config.apiKey?.trim()) throw configError(`${platformName} API key is required.`);

  const defaults = platformDefaults(platformId, config, runtime);
  if (!defaults.baseUrl) throw configError(`${platformName} Base URL is required.`);
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
    const err = new Error(message) as Error & { status?: number; raw?: unknown };
    err.status = response.status;
    err.raw = rawData;
    throw err;
  }

  const items = flattenResults(rawData);
  const leads = items
    .map((item) => normalizeLeadItem(item, platformName, platformId))
    .filter(Boolean);
  return {
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
  };
}

async function mergeServerPublicLeads(newLeads: any[]) {
  const existing = await getRecordList("public_leads");
  const existingKeys = new Set(existing.map((lead: any) =>
    [lead.source, lead.name, lead.contact].join("|").toLowerCase(),
  ));
  let importedCount = 0;
  for (const lead of newLeads) {
    const key = [lead.source, lead.name, lead.contact].join("|").toLowerCase();
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    const id = lead.id || randomId("lead");
    await upsertRecord("public_leads", id, { ...lead, id });
    importedCount += 1;
  }
  return importedCount;
}

app.post("/api/lead-platforms/run", async (req, res) => {
  const { platformId, platformName, config = {}, runtime = {} } = req.body as {
    platformId?: string;
    platformName?: string;
    config?: LeadPlatformRunConfig;
    runtime?: LeadPlatformRuntime;
  };
  try {
    res.json(await runLeadPlatformRequest(platformId || "", platformName || "", config, runtime));
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Lead platform request failed.", status: err.status, raw: err.raw });
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

app.get("/api/ai/customer-insights/:customerId", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const insight = await getRecord("customer_ai_insights", req.params.customerId);
    res.json({ insight: insight || null });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load customer AI insight: ${err.message}` });
  }
});

app.post("/api/ai/customer-insights", async (req, res) => {
  if (!requireDatabase(res)) return;
  const {
    customerId = "",
    customer = {},
    timeline = [],
    memory = {},
    systemLanguage = "en",
    modelProfile = {},
    force = false,
  } = req.body;
  const insightId = String(customerId || customer?.id || "").trim();
  if (!insightId) return res.status(400).json({ error: "customerId is required." });

  try {
    if (!force) {
      const existing = await getRecord("customer_ai_insights", insightId);
      if (existing) return res.json(existing);
    }
    const profile = requireModelProfile(modelProfile, res);
    if (!profile) return;

    const prompt = `Analyze this CRM customer using only the provided real CRM data.

Customer:
${JSON.stringify(customer, null, 2).slice(0, 5000)}

Recent timeline/messages:
${JSON.stringify(timeline, null, 2).slice(0, 5000)}

Memory:
${JSON.stringify(memory, null, 2).slice(0, 3000)}

Return strict JSON only:
{
  "summary": "concise customer summary grounded in data",
  "nextAction": "recommended next best action",
  "proposalAngle": "short proposal or outreach angle",
  "risk": "short risk assessment",
  "semanticTags": ["tag 1", "tag 2", "tag 3"],
  "confidence": "low|medium|high"
}
Write all human-facing values in this language: ${systemLanguage}. Do not invent opened emails, prices, budgets, discounts, or policies unless present in the supplied data.`;
    const text = await generateWithModelProfile(
      profile,
      "You are a CRM customer intelligence assistant. Ground every recommendation in the provided customer, timeline, and memory data.",
      prompt,
    );
    const data = parseAiJson(text);
    const insight = {
      id: insightId,
      customerId: insightId,
      summary: String(data.summary || "No customer insight available yet."),
      nextAction: String(data.nextAction || "Review customer context and choose the next outreach step."),
      proposalAngle: String(data.proposalAngle || ""),
      risk: String(data.risk || "No clear risk detected."),
      semanticTags: Array.isArray(data.semanticTags) ? data.semanticTags.map(String).slice(0, 6) : [],
      confidence: ["low", "medium", "high"].includes(String(data.confidence)) ? data.confidence : "medium",
      model: profile.model,
      provider: profile.provider,
      analyzedAt: new Date().toISOString(),
    };
    await upsertRecord("customer_ai_insights", insightId, insight);
    res.json(insight);
  } catch (err: any) {
    res.status(500).json({ error: `Customer AI insight failed: ${err.message}` });
  }
});

app.post("/api/ai/draft-reply", async (req, res) => {
  const {
    message,
    intent,
    preferredLanguage = "en",
    systemLanguage = preferredLanguage,
    channel = "Email",
    subject = "",
    thread = [],
    modelProfile = {},
  } = req.body;

  try {
    let selectedProfile = modelProfile as ModelProfile;
    if (!selectedProfile || Object.keys(selectedProfile).length === 0) {
      const profiles = hasDatabase ? await getRecordList("crm_model_profiles") : [];
      selectedProfile = (profiles[0] || {}) as ModelProfile;
    }
    const profile = requireModelProfile(selectedProfile, res);
    if (!profile) return;

    const threadText = Array.isArray(thread)
      ? thread
          .map((item: any) => `${item.sender || "sender"}: ${item.content || ""}`)
          .join("\n")
          .slice(0, 6000)
      : "";
    const prompt = `Draft a CRM reply.

Channel: ${channel}
Subject: ${subject}
Intent: ${intent}
Message summary: ${message}
Conversation:
${threadText}

Return only the reply body. Keep it concise, helpful, and under 3 paragraphs. Do not include placeholders like [Your Name]. Write in this language: ${systemLanguage || preferredLanguage}.`;
    const reply = await generateWithModelProfile(
      profile,
      "You are a CRM inbox assistant drafting practical customer replies. Do not invent facts, prices, files, or policies.",
      prompt,
    );
    res.json({ reply: String(reply || "").trim(), model: profile.model, provider: profile.provider });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function messageTranslationId(messageId: string, threadId: string, targetLanguage: string) {
  return Buffer.from(`${messageId}|${threadId}|${targetLanguage}`.toLowerCase()).toString("base64url").slice(0, 120);
}

function textHash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

app.get("/api/ai/message-translation", async (req, res) => {
  if (!requireDatabase(res)) return;
  const messageId = String(req.query.messageId || "").trim();
  const threadId = String(req.query.threadId || "").trim();
  const targetLanguage = String(req.query.targetLanguage || "").trim();
  const text = String(req.query.text || "");
  if (!messageId || !threadId || !targetLanguage) {
    return res.status(400).json({ error: "messageId, threadId, and targetLanguage are required." });
  }

  try {
    const id = messageTranslationId(messageId, threadId, targetLanguage);
    const translation = await getRecord("message_translations", id);
    if (!translation) return res.json({ translation: null });
    if (text && translation.sourceTextHash && translation.sourceTextHash !== textHash(text)) {
      return res.json({ translation: null });
    }
    res.json({ translation });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load message translation: ${err.message}` });
  }
});

app.post("/api/ai/translate-message", async (req, res) => {
  const {
    messageId = "",
    threadId = "",
    text = "",
    targetLanguage = "en",
    modelProfile = {},
  } = req.body;
  const sourceText = String(text || "").trim();
  if (!sourceText) {
    return res.status(400).json({ error: "text is required." });
  }

  try {
    const normalizedMessageId = String(messageId || "").trim();
    const normalizedThreadId = String(threadId || "").trim();
    const normalizedTargetLanguage = String(targetLanguage || "").trim();
    const cacheId = normalizedMessageId && normalizedThreadId
      ? messageTranslationId(normalizedMessageId, normalizedThreadId, normalizedTargetLanguage)
      : "";
    const sourceTextHash = textHash(sourceText);
    if (cacheId && hasDatabase) {
      const existing = await getRecord("message_translations", cacheId);
      if (existing?.sourceTextHash === sourceTextHash) {
        return res.json(existing);
      }
    }

    let selectedProfile = modelProfile as ModelProfile;
    if (!selectedProfile || Object.keys(selectedProfile).length === 0) {
      const profiles = hasDatabase ? await getRecordList("crm_model_profiles") : [];
      selectedProfile = (profiles[0] || {}) as ModelProfile;
    }
    const profile = requireModelProfile(selectedProfile, res);
    if (!profile) return;

    const prompt = `Detect the source language and translate this WhatsApp customer message into the target system language only if needed.

Target system language: ${targetLanguage}
Message:
${sourceText.slice(0, 4000)}

Return strict JSON only:
{
  "sourceLanguage": "detected language name",
  "targetLanguage": "target language name",
  "shouldTranslate": true,
  "translatedText": "translation in target language, or empty string when no translation is needed"
}
If the message is already in the target system language, set shouldTranslate to false and translatedText to an empty string. Preserve meaning. Do not add commentary.`;
    const raw = await generateWithModelProfile(
      profile,
      "You are a precise CRM message translator. Return valid JSON only.",
      prompt,
    );
    const data = parseAiJson(raw);
    const translation = {
      id: cacheId || `message_translation_${Date.now()}`,
      messageId: normalizedMessageId,
      threadId: normalizedThreadId,
      targetLanguageKey: normalizedTargetLanguage,
      sourceTextHash,
      sourceLanguage: String(data.sourceLanguage || "unknown"),
      targetLanguage: String(data.targetLanguage || targetLanguage),
      shouldTranslate: Boolean(data.shouldTranslate && data.translatedText),
      translatedText: String(data.translatedText || "").trim(),
      model: profile.model,
      provider: profile.provider,
      translatedAt: new Date().toISOString(),
    };
    if (cacheId && hasDatabase) {
      await upsertRecord("message_translations", cacheId, translation);
    }
    res.json(translation);
  } catch (err: any) {
    res.status(500).json({ error: `Message translation failed: ${err.message}` });
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
  const {
    customer = {},
    insight = {},
    timeline = [],
    preferredLanguage = "en",
    modelProfile = {},
  } = req.body;
  const profile = requireModelProfile(modelProfile, res);
  if (!profile) return;

  try {
    const prompt = `Draft a professional sales proposal email from the CRM data below.

Customer:
${JSON.stringify(customer, null, 2).slice(0, 5000)}

AI insight:
${JSON.stringify(insight, null, 2).slice(0, 3000)}

Recent timeline:
${JSON.stringify(timeline, null, 2).slice(0, 4000)}

Requirements:
- Keep it concise and practical.
- Do not invent discounts, prices, delivery terms, or guarantees.
- If the data is incomplete, ask a clear follow-up question.
- Do not include placeholders like [Your Name].
- Reply in this language: ${preferredLanguage}.`;
    const text = await generateWithModelProfile(
      profile,
      "You are a CRM sales assistant drafting grounded customer outreach.",
      prompt,
    );
    res.json({ reply: text, model: profile.model, provider: profile.provider });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function getAppSettingValue<T = unknown>(id: string): Promise<T | undefined> {
  const record = await getRecord("app_settings", id);
  return record?.value as T | undefined;
}

async function upsertEmailInboxMessage(email: any) {
  const existing = await getRecord("inbox_messages", email.id);
  const thread = Array.isArray(existing?.thread) && existing.thread.length > 0
    ? existing.thread.map((item: any, index: number) =>
        index === 0
          ? {
              ...item,
              content: email.summary,
              htmlContent: email.bodyHtml,
              time: email.date,
            }
          : item,
      )
    : [
        {
          id: `t_${email.id}`,
          sender: "user",
          content: email.summary,
          htmlContent: email.bodyHtml,
          time: email.date,
        },
      ];

  const next = {
    ...(existing || {}),
    ...email,
    direction: "inbound",
    read: existing?.read ?? false,
    thread,
  };
  await upsertRecord("inbox_messages", email.id, next);
  return next;
}

async function syncEmailsToInbox() {
  const [mappings, receiveProfiles] = await Promise.all([
    getRecordList("email_mappings"),
    getRecordList("email_receive_profiles"),
  ]);
  if (!Array.isArray(mappings) || !Array.isArray(receiveProfiles) || mappings.length === 0 || receiveProfiles.length === 0) {
    return { imported: 0, errors: [] as string[] };
  }

  const { emails, errors } = await syncImapEmails({ mappings: mappings as any[], receiveProfiles, limit: 25 });
  let imported = 0;
  for (const email of emails) {
    const existing = await getRecord("inbox_messages", email.id);
    await upsertEmailInboxMessage(email);
    if (!existing) imported += 1;
  }
  return { imported, errors };
}

function appSettingRowsToWaHubActors(rows: any[], fallbackUserId: string) {
  return rows.flatMap((record) => {
    const id = String(record?.id || "");
    if (id !== "wa_hub_actors" && !id.startsWith("wa_hub_actors:")) return [];
    const userId = id.startsWith("wa_hub_actors:") ? id.replace(/^wa_hub_actors:/, "") : fallbackUserId;
    const actors = record?.value;
    if (!Array.isArray(actors)) return [];
    return actors
      .filter((actor) => actor?.clientId)
      .map((actor) => ({
        userId,
        clientId: String(actor.clientId),
      }));
  });
}

async function fetchWaHubMessagesForClient(hubUrl: string, token: string, clientId: string, limit = 50) {
  const params = new URLSearchParams({ clientId, limit: String(limit) });
  const response = await fetch(`${hubUrl.replace(/\/+$/, "")}/api/messages?${params.toString()}`, {
    headers: {
      "x-hub-token": token,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`WhatsApp Hub ${clientId} sync failed with HTTP ${response.status}.`);
  }
  const data = await response.json().catch(() => ({}));
  return Array.isArray(data.messages) ? data.messages : [];
}

async function syncWhatsAppHubToInbox() {
  const [hubUrlSetting, hubTokenSetting, currentUserSetting, appSettings] = await Promise.all([
    getAppSettingValue<string>("wa_hub_url"),
    getAppSettingValue<string>("wa_hub_token"),
    getAppSettingValue<any>("crm_current_user"),
    getRecordList("app_settings"),
  ]);
  const hubUrl = String(process.env.WA_HUB_URL || hubUrlSetting || "").replace(/\/+$/, "");
  const token = String(process.env.WA_HUB_TOKEN || hubTokenSetting || "");
  if (!hubUrl || !token) return { imported: 0, errors: [] as string[] };

  const fallbackUserId = String(currentUserSetting?.id || "global");
  const actors = appSettingRowsToWaHubActors(appSettings, fallbackUserId);
  if (actors.length === 0) return { imported: 0, errors: [] as string[] };

  let imported = 0;
  const errors: string[] = [];
  const actorsByKey = new Map<string, { userId: string; clientId: string }>();
  for (const actor of actors) actorsByKey.set(`${actor.userId}\u0000${actor.clientId}`, actor);

  for (const { userId, clientId } of actorsByKey.values()) {
    try {
      const messages = await fetchWaHubMessagesForClient(hubUrl, token, clientId, 50);
      const sorted = messages.sort((a: any, b: any) =>
        (Date.parse(a.created_at || a.createdAt || "") || 0) - (Date.parse(b.created_at || b.createdAt || "") || 0),
      );
      for (const message of sorted) {
        const previewId = `wa_chat_${webhookMessageClientId(message)}:${webhookMessageConversationKey(message)}`;
        const existing = await getRecord("inbox_messages", previewId);
        const existingThreadLength = Array.isArray(existing?.thread) ? existing.thread.length : 0;
        const next = await upsertWhatsAppWebhookInboxMessage(message, userId, message?.created_at || message?.createdAt);
        const nextThreadLength = Array.isArray(next?.thread) ? next.thread.length : 0;
        if (!existing || nextThreadLength > existingThreadLength) imported += 1;
      }
    } catch (err: any) {
      errors.push(`${clientId}: ${err.message}`);
    }
  }
  return { imported, errors };
}

let backgroundInboxSyncRunning = false;
const backgroundInboxSyncState = {
  lastStartedAt: "",
  lastFinishedAt: "",
  lastReason: "",
  lastEmailImported: 0,
  lastWhatsAppImported: 0,
  lastErrors: [] as string[],
};

async function runBackgroundInboxSync(reason = "timer") {
  if (!hasDatabase || backgroundInboxSyncRunning) return;
  backgroundInboxSyncRunning = true;
  backgroundInboxSyncState.lastStartedAt = new Date().toISOString();
  backgroundInboxSyncState.lastReason = reason;
  backgroundInboxSyncState.lastErrors = [];
  try {
    const [emailResult, whatsAppResult] = await Promise.allSettled([
      syncEmailsToInbox(),
      syncWhatsAppHubToInbox(),
    ]);
    const emailImported = emailResult.status === "fulfilled" ? emailResult.value.imported : 0;
    const whatsAppImported = whatsAppResult.status === "fulfilled" ? whatsAppResult.value.imported : 0;
    const errors = [
      ...(emailResult.status === "fulfilled" ? emailResult.value.errors : [emailResult.reason?.message || "Email sync failed"]),
      ...(whatsAppResult.status === "fulfilled" ? whatsAppResult.value.errors : [whatsAppResult.reason?.message || "WhatsApp sync failed"]),
    ].filter(Boolean);
    backgroundInboxSyncState.lastEmailImported = emailImported;
    backgroundInboxSyncState.lastWhatsAppImported = whatsAppImported;
    backgroundInboxSyncState.lastErrors = errors;
    if (emailImported > 0 || whatsAppImported > 0) {
      broadcastInboxEvent({
        source: "background-inbox-sync",
        reason,
        emailImported,
        whatsAppImported,
        errors,
      });
    }
    if (errors.length > 0) {
      console.warn(`[background-inbox-sync] ${errors.join(" | ")}`);
    }
  } catch (err: any) {
    backgroundInboxSyncState.lastErrors = [err.message || "Background inbox sync failed."];
    console.error("[background-inbox-sync] failed:", err);
  } finally {
    backgroundInboxSyncState.lastFinishedAt = new Date().toISOString();
    backgroundInboxSyncRunning = false;
  }
}

function startBackgroundInboxSync() {
  if (!hasDatabase) return;
  setTimeout(() => runBackgroundInboxSync("startup"), 5000);
  setInterval(() => runBackgroundInboxSync("timer"), BACKGROUND_INBOX_SYNC_INTERVAL_MS);
  console.log(`Background inbox sync enabled every ${BACKGROUND_INBOX_SYNC_INTERVAL_MS}ms.`);
}

app.post("/api/communication/inbox/background-sync", async (_req, res) => {
  if (!requireDatabase(res)) return;
  await runBackgroundInboxSync("manual-api");
  res.json({ success: true });
});

function latestRecord(records: any[], dateField = "createdAt") {
  return [...records].sort((a, b) =>
    (Date.parse(b?.[dateField] || b?.completedAt || b?.updatedAt || "") || 0) -
    (Date.parse(a?.[dateField] || a?.completedAt || a?.updatedAt || "") || 0),
  )[0];
}

function countByStatus(records: any[]) {
  return records.reduce((acc: Record<string, number>, record) => {
    const status = String(record?.status || "unknown");
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

async function buildOperationsHealth() {
  const [
    inboxMessages,
    receiveProfiles,
    sendProfiles,
    emailMappings,
    appSettings,
    agentRuns,
    importJobs,
    leadPlatformConfigs,
  ] = await Promise.all([
    getRecordList("inbox_messages"),
    getRecordList("email_receive_profiles"),
    getRecordList("email_send_profiles"),
    getRecordList("email_mappings"),
    getRecordList("app_settings"),
    getRecordList("agent_runs"),
    getRecordList("import_jobs"),
    loadServerLeadPlatformConfigs(),
  ]);

  const emailMessages = inboxMessages.filter((message: any) => message.channel !== "WhatsApp");
  const whatsAppMessages = inboxMessages.filter((message: any) => message.channel === "WhatsApp");
  const waActors = appSettingRowsToWaHubActors(appSettings, "global");
  const platformConfigEntries = Object.entries(leadPlatformConfigs) as Array<[string, LeadPlatformRunConfig]>;
  const enabledPlatforms = platformConfigEntries.filter(([, config]) => config?.enabled);
  const leadPlatformRuns = agentRuns.filter((run: any) => run.operationType === "lead_platform_collection");
  const failedLeadPlatformRuns = leadPlatformRuns.filter((run: any) => run.status === "Failed");
  const failedAgentRuns = agentRuns.filter((run: any) => run.status === "Failed");
  const failedImports = importJobs.filter((job: any) => job.status === "failed" || job.status === "completed_with_errors");
  const runningImports = importJobs.filter((job: any) => job.status === "queued" || job.status === "running");

  return {
    generatedAt: new Date().toISOString(),
    database: { connected: hasDatabase },
    inboxSync: {
      running: backgroundInboxSyncRunning,
      intervalMs: BACKGROUND_INBOX_SYNC_INTERVAL_MS,
      ...backgroundInboxSyncState,
    },
    email: {
      receiveProfiles: receiveProfiles.length,
      sendProfiles: sendProfiles.length,
      mappings: emailMappings.length,
      inboxMessages: emailMessages.length,
      latestMessageAt: latestRecord(emailMessages, "date")?.date || "",
      lastImported: backgroundInboxSyncState.lastEmailImported,
      errors: backgroundInboxSyncState.lastErrors.filter((error) => String(error).toLowerCase().includes("email") || String(error).toLowerCase().includes("imap")),
    },
    whatsApp: {
      actors: waActors.length,
      uniqueClients: new Set(waActors.map((actor) => actor.clientId)).size,
      inboxMessages: whatsAppMessages.length,
      latestMessageAt: latestRecord(whatsAppMessages, "date")?.date || "",
      lastImported: backgroundInboxSyncState.lastWhatsAppImported,
      errors: backgroundInboxSyncState.lastErrors.filter((error) => String(error).toLowerCase().includes("whatsapp") || String(error).toLowerCase().includes("hub")),
    },
    agents: {
      schedulerRunning: serverAgentSchedulerRunning,
      schedulerIntervalMs: SERVER_AGENT_SCHEDULER_INTERVAL_MS,
      scheduler: serverAgentSchedulerState,
      totalRuns: agentRuns.length,
      statusCounts: countByStatus(agentRuns),
      failedRuns: failedAgentRuns.slice(0, 10),
      latestRun: latestRecord(agentRuns),
    },
    imports: {
      totalJobs: importJobs.length,
      statusCounts: countByStatus(importJobs),
      runningJobs: runningImports.slice(0, 10),
      failedJobs: failedImports.slice(0, 10),
      latestJob: latestRecord(importJobs),
    },
    leadPlatforms: {
      configured: Object.keys(leadPlatformConfigs).length,
      enabled: enabledPlatforms.length,
      totalRuns: leadPlatformRuns.length,
      failedRuns: failedLeadPlatformRuns.slice(0, 10),
      latestRun: latestRecord(leadPlatformRuns),
    },
  };
}

app.get("/api/operations/health", async (_req, res) => {
  if (!requireDatabase(res)) return;
  try {
    res.json(await buildOperationsHealth());
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load operations health." });
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
    app.use(
      express.static(distPath, {
        setHeaders(res, filePath) {
          if (filePath.endsWith("index.html")) {
            res.setHeader("Cache-Control", "no-store");
          }
        },
      }),
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startBackgroundInboxSync();
    startServerAgentScheduler();
  });
}

startServer();
