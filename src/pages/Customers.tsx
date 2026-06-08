import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  Filter,
  MoreHorizontal,
  ShieldAlert,
  Zap,
  Edit2,
  Trash2,
  X,
  Plus,
  Upload,
  Download,
  List,
  Map as MapIcon,
  MapPin,
} from "lucide-react";
import { cn } from "../Layout";
import { useLanguage } from "../i18n";
import ConfirmModal from "../components/ConfirmModal";
import { notify } from "../services/notifications";
import { useServerCollectionSync } from "../hooks/useServerCollectionSync";
import {
  getCustomers,
  saveCustomers,
  deleteCustomer,
  addCustomer,
  updateCustomer,
  Customer,
  loadCustomersFromServer,
  getPublicLeads,
  loadPublicLeadsFromServer,
  PublicLead,
  savePublicLeads,
  deletePublicLeads,
  claimLead,
  getCurrentUser,
} from "../services/db";

const CONTACT_TYPES = [
  "Mobile",
  "Phone",
  "Email",
  "WhatsApp",
  "Messenger",
  "WeChat",
  "Other",
];

type CsvImportTarget = "my-customers" | "public-pool";
type CustomerViewMode = "list" | "map";

type CsvImportPreview = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
};

type CountryStat = {
  country: string;
  count: number;
  x: number;
  y: number;
};

const COUNTRY_ALIASES: Record<string, string> = {
  us: "United States",
  usa: "United States",
  u_s_a: "United States",
  "u.s.a.": "United States",
  "u.s.": "United States",
  america: "United States",
  united_states: "United States",
  uk: "United Kingdom",
  u_k: "United Kingdom",
  "u.k.": "United Kingdom",
  britain: "United Kingdom",
  great_britain: "United Kingdom",
  prc: "China",
  cn: "China",
  china: "China",
  mainland_china: "China",
  hk: "Hong Kong",
  hong_kong: "Hong Kong",
  singapore: "Singapore",
  sg: "Singapore",
  germany: "Germany",
  de: "Germany",
  france: "France",
  fr: "France",
  italy: "Italy",
  it: "Italy",
  spain: "Spain",
  es: "Spain",
  canada: "Canada",
  ca_country: "Canada",
  australia: "Australia",
  au: "Australia",
  japan: "Japan",
  jp: "Japan",
  korea: "South Korea",
  south_korea: "South Korea",
  kr: "South Korea",
  india: "India",
  in: "India",
  brazil: "Brazil",
  br: "Brazil",
  mexico: "Mexico",
  mx: "Mexico",
  uae: "United Arab Emirates",
  united_arab_emirates: "United Arab Emirates",
};

const LOCATION_HINTS: Record<string, string> = {
  ca: "United States",
  ny: "United States",
  tx: "United States",
  fl: "United States",
  wa: "United States",
  il: "United States",
  ma: "United States",
  san_francisco: "United States",
  new_york: "United States",
  los_angeles: "United States",
  seattle: "United States",
  chicago: "United States",
  london: "United Kingdom",
  manchester: "United Kingdom",
  toronto: "Canada",
  vancouver: "Canada",
  sydney: "Australia",
  melbourne: "Australia",
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
  dubai: "United Arab Emirates",
};

const COUNTRY_COORDS: Record<string, { lat: number; lon: number }> = {
  "United States": { lat: 39.8, lon: -98.6 },
  Canada: { lat: 56.1, lon: -106.3 },
  Mexico: { lat: 23.6, lon: -102.6 },
  Brazil: { lat: -14.2, lon: -51.9 },
  "United Kingdom": { lat: 55.4, lon: -3.4 },
  France: { lat: 46.2, lon: 2.2 },
  Germany: { lat: 51.2, lon: 10.5 },
  Italy: { lat: 41.9, lon: 12.6 },
  Spain: { lat: 40.5, lon: -3.7 },
  China: { lat: 35.9, lon: 104.2 },
  "Hong Kong": { lat: 22.3, lon: 114.2 },
  Singapore: { lat: 1.35, lon: 103.8 },
  Japan: { lat: 36.2, lon: 138.3 },
  "South Korea": { lat: 36.5, lon: 127.8 },
  India: { lat: 20.6, lon: 78.9 },
  Indonesia: { lat: -2.5, lon: 118.0 },
  Malaysia: { lat: 4.2, lon: 102.0 },
  Netherlands: { lat: 52.1, lon: 5.3 },
  Portugal: { lat: 39.4, lon: -8.2 },
  Russia: { lat: 61.5, lon: 105.3 },
  "Saudi Arabia": { lat: 23.9, lon: 45.1 },
  Thailand: { lat: 15.9, lon: 101.0 },
  Turkey: { lat: 39.0, lon: 35.2 },
  Vietnam: { lat: 14.1, lon: 108.3 },
  Australia: { lat: -25.3, lon: 133.8 },
  "United Arab Emirates": { lat: 24.0, lon: 54.0 },
  Unknown: { lat: -58, lon: 0 },
};

const WORLD_MAP_SVG_URL = "https://upload.wikimedia.org/wikipedia/commons/5/51/BlankMap-Equirectangular.svg";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
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
  if (rows.length < 2) return { headers: rows[0] || [], rows: [] };
  const headers = rows[0].map(normalizeCsvHeader);
  const dataRows = rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])),
  );
  return { headers, rows: dataRows };
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

function normalizeRisk(value: string): Customer["risk"] {
  const text = value.trim().toLowerCase();
  if (text === "high") return "High";
  if (text === "medium") return "Medium";
  return "Low";
}

function buildContactMethods(row: Record<string, string>) {
  return [
    { type: "Email", value: pickCsv(row, ["email", "email_address", "mail"]) },
    { type: "Phone", value: pickCsv(row, ["phone", "phone_number", "tel"]) },
    { type: "Mobile", value: pickCsv(row, ["mobile", "mobile_phone"]) },
    { type: "WhatsApp", value: pickCsv(row, ["whatsapp", "whatsapp_number"]) },
    { type: "Other", value: pickCsv(row, ["website", "site", "url", "linkedin"]) },
  ]
    .filter((contact) => contact.value)
    .map((contact) => ({
      id: Math.random().toString(36).substring(7),
      type: contact.type,
      value: contact.value,
    }));
}

function rowToCustomer(row: Record<string, string>): Customer | null {
  const name = pickCsv(row, ["company", "company_name", "name", "customer", "customer_name", "organization"]);
  const contact = pickCsv(row, ["contact", "contact_name", "person", "name", "email", "phone", "mobile"]);
  if (!name && !contact) return null;
  const contacts = buildContactMethods(row);
  return {
    id: `cus_${Math.random().toString(36).substr(2, 9)}`,
    name: name || contact,
    contact: contact || contacts[0]?.value || name,
    contacts,
    address: pickCsv(row, ["address", "street"]),
    city: pickCsv(row, ["city"]),
    province: pickCsv(row, ["province", "state", "region"]),
    country: pickCsv(row, ["country"]) || inferCountryFromLocation(pickCsv(row, ["location", "address", "city"])),
    preferredLanguage: pickCsv(row, ["preferred_language", "language", "lang"]) || "en",
    description: pickCsv(row, ["description", "notes", "note", "summary"]),
    industry: pickCsv(row, ["industry", "category"]),
    stage: pickCsv(row, ["stage", "pipeline_stage"]) || "New Lead",
    score: clampScore(pickCsv(row, ["score", "priority_score", "ai_score"])),
    risk: normalizeRisk(pickCsv(row, ["risk"])),
    intent: pickCsv(row, ["intent"]) || "Low",
    tags: csvTags(pickCsv(row, ["tags", "tag"])),
    logs: [
      {
        id: Math.random().toString(36).substring(7),
        time: new Date().toISOString(),
        event: "Imported from CSV",
        type: "action",
      },
    ],
    comments: [],
  };
}

function rowToPublicLead(row: Record<string, string>): PublicLead | null {
  const name = pickCsv(row, ["company", "company_name", "name", "lead", "business_name", "organization"]);
  const contact = pickCsv(row, ["contact", "email", "phone", "mobile", "website", "site", "url"]);
  if (!name && !contact) return null;
  return {
    id: `lead_csv_${Math.random().toString(36).substr(2, 9)}`,
    name: name || contact,
    contact: contact || "No contact provided",
    source: pickCsv(row, ["source", "platform"]) || "CSV Import",
    scrapedAt: new Date().toISOString(),
    contacts: buildContactMethods(row),
    industry: pickCsv(row, ["industry", "category"]),
    location: pickCsv(row, ["location", "address", "city", "country"]),
    description: pickCsv(row, ["description", "notes", "note", "summary"]),
    score: pickCsv(row, ["score", "priority_score", "ai_score"]) ? clampScore(pickCsv(row, ["score", "priority_score", "ai_score"])) : undefined,
    intent: (pickCsv(row, ["intent"]) as PublicLead["intent"]) || undefined,
    risk: (pickCsv(row, ["risk"]) as PublicLead["risk"]) || undefined,
  };
}

function csvEscape(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function countryKey(value = "") {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeCountry(value = "") {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const key = countryKey(trimmed);
  return COUNTRY_ALIASES[key] || COUNTRY_ALIASES[`${key}_country`] || trimmed.replace(/\s+/g, " ");
}

function inferCountryFromLocation(location = "") {
  const parts = location
    .split(/[,|/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of [...parts].reverse()) {
    const normalized = normalizeCountry(part);
    const key = countryKey(part);
    if (COUNTRY_COORDS[normalized] || COUNTRY_ALIASES[key]) return normalized;
    if (LOCATION_HINTS[key]) return LOCATION_HINTS[key];
  }
  for (const part of parts) {
    const hint = LOCATION_HINTS[countryKey(part)];
    if (hint) return hint;
  }
  return "";
}

function getCustomerCountry(customer: Customer) {
  return normalizeCountry(customer.country || inferCountryFromLocation([customer.city, customer.province, customer.address].filter(Boolean).join(", "))) || "Unknown";
}

function getPublicLeadCountry(lead: PublicLead) {
  return inferCountryFromLocation(lead.location || "") || "Unknown";
}

function projectCountryPoint(country: string) {
  const coord = COUNTRY_COORDS[country] || COUNTRY_COORDS.Unknown;
  return {
    x: ((coord.lon + 180) / 360) * 100,
    y: ((90 - coord.lat) / 180) * 100,
  };
}

function getCountryStats<T>(items: T[], getCountry: (item: T) => string) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const country = getCountry(item);
    counts.set(country, (counts.get(country) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([country, count]) => ({
      country,
      count,
      ...projectCountryPoint(country),
    }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}

function matchesCountryFilter(country: string, filter: string) {
  if (!filter) return true;
  return countryKey(country) === countryKey(filter);
}

function CustomerFormView({
  customer,
  onSave,
  onClose,
}: {
  key?: React.Key;
  customer: Customer | null;
  onSave: (c: Customer) => void;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<Customer["contacts"]>(
    customer?.contacts?.length
      ? customer.contacts
      : [
          {
            id: Math.random().toString(36).substring(7),
            type: "Mobile",
            value: "",
          },
        ],
  );

  const [tags, setTags] = useState<string[]>(customer?.tags || []);

  const handleAddContact = () => {
    setContacts([
      ...contacts,
      {
        id: Math.random().toString(36).substring(7),
        type: "Mobile",
        value: "",
      },
    ]);
  };

  const handleUpdateContact = (
    id: string,
    field: keyof Customer["contacts"][0],
    value: string,
  ) => {
    setContacts(
      contacts.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  const handleDeleteContact = (id: string) => {
    setContacts(contacts.filter((c) => c.id !== id));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);

    onSave({
      id: customer
        ? customer.id
        : `cus_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name as string,
      contact: data.contact as string,
      contacts: contacts.filter((c) => c.value.trim() !== ""),
      address: data.address as string,
      city: data.city as string,
      province: data.province as string,
      description: data.description as string,
      country: data.country as string,
      preferredLanguage: data.preferredLanguage as string,
      stage: data.stage as string,
      score: parseInt(data.score as string, 10),
      risk: data.risk as Customer["risk"],
      intent: data.intent as string,
      tags: tags,
      logs: customer?.logs || [],
      comments: customer?.comments || [],
    } as any);
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
      <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-white/5 shrink-0 bg-slate-50 dark:bg-black/20">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          {customer ? "Edit Customer" : "Add New Customer"}
        </h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-6 overflow-y-auto flex-1 bg-white dark:bg-transparent"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Company Name
            </label>
            <input
              required
              name="name"
              defaultValue={customer?.name}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Contact Name
            </label>
            <input
              required
              name="contact"
              defaultValue={customer?.contact}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="border border-slate-200 dark:border-white/10 rounded-xl p-5 bg-slate-50/50 dark:bg-black/10 space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Contact Methods
            </label>
            <button
              type="button"
              onClick={handleAddContact}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Method
            </button>
          </div>

          <div className="space-y-3">
            {contacts.map((contact, index) => (
              <div key={contact.id} className="flex items-center gap-3">
                <select
                  value={contact.type}
                  onChange={(e) =>
                    handleUpdateContact(contact.id, "type", e.target.value)
                  }
                  className="w-1/3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
                >
                  {CONTACT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <input
                  value={contact.value}
                  onChange={(e) =>
                    handleUpdateContact(contact.id, "value", e.target.value)
                  }
                  placeholder={`Enter ${contact.type}`}
                  className="flex-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleDeleteContact(contact.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {contacts.length === 0 && (
              <p className="text-xs text-slate-400 italic">
                No contact methods specified.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Address
            </label>
            <input
              name="address"
              defaultValue={customer?.address}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  City
                </label>
                <input
                  name="city"
                  defaultValue={customer?.city}
                  className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  State / Province
                </label>
                <input
                  name="province"
                  defaultValue={customer?.province}
                  className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Description
            </label>
            <textarea
              name="description"
              defaultValue={customer?.description}
              rows={3}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none resize-y"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Country
            </label>
            <input
              list="country-list"
              name="country"
              defaultValue={customer?.country}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            />
            <datalist id="country-list">
              <option value="United States" />
              <option value="Canada" />
              <option value="United Kingdom" />
              <option value="Australia" />
              <option value="Germany" />
              <option value="France" />
              <option value="Japan" />
              <option value="China" />
              <option value="India" />
              <option value="Brazil" />
              <option value="Mexico" />
              <option value="South Africa" />
              <option value="Spain" />
              <option value="Italy" />
              <option value="Netherlands" />
              <option value="New Zealand" />
              <option value="Singapore" />
              <option value="United Arab Emirates" />
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Preferred Language
            </label>
            <select
              name="preferredLanguage"
              defaultValue={customer?.preferredLanguage || ""}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            >
              <option value="">Default (System Language)</option>
              <option value="en">English (en)</option>
              <option value="zh">Chinese (zh)</option>
              <option value="es">Spanish (es)</option>
              <option value="fr">French (fr)</option>
              <option value="de">German (de)</option>
              <option value="ja">Japanese (ja)</option>
              <option value="ko">Korean (ko)</option>
              <option value="ru">Russian (ru)</option>
              <option value="ar">Arabic (ar)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Stage
            </label>
            <select
              name="stage"
              defaultValue={customer?.stage || "New Lead"}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            >
              <option value="New Lead">New Lead</option>
              <option value="Negotiation">Negotiation</option>
              <option value="Qualified">Qualified</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Score (0-100)
            </label>
            <input
              required
              name="score"
              type="number"
              min="0"
              max="100"
              defaultValue={customer?.score || 50}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Intent
            </label>
            <select
              name="intent"
              defaultValue={customer?.intent || "Low"}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Risk
            </label>
            <select
              name="risk"
              defaultValue={customer?.risk || "Low"}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium flex items-center gap-1 border border-blue-200 dark:border-blue-800"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                    className="hover:text-amber-500 ml-1"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <input
              placeholder="Add a tag and press Enter..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = e.currentTarget.value.trim();
                  if (val && !tags.includes(val)) {
                    setTags([...tags, val]);
                    e.currentTarget.value = "";
                  }
                }
              }}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm"
          >
            Save Customer
          </button>
        </div>
      </form>
    </div>
  );
}

function CountryMapView({
  stats,
  activeCountry,
  onCountryClick,
  emptyText,
}: {
  stats: CountryStat[];
  activeCountry: string;
  onCountryClick: (country: string) => void;
  emptyText: string;
}) {
  const maxCount = Math.max(1, ...stats.map((stat) => stat.count));

  if (stats.length === 0) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
        <MapIcon className="mb-3 h-9 w-9 text-slate-300 dark:text-slate-600" />
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-[520px] grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative min-h-[420px] overflow-hidden bg-slate-100 dark:bg-black/30">
        <div className="absolute inset-6 flex items-center justify-center">
          <div className="relative aspect-[2/1] w-full max-h-full overflow-hidden rounded-[24px] border border-slate-200 bg-sky-50 shadow-inner dark:border-white/10 dark:bg-slate-950">
            <img
              src={WORLD_MAP_SVG_URL}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="absolute inset-0 h-full w-full object-fill opacity-95 dark:opacity-75"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-white/10 dark:from-slate-950/20 dark:via-slate-950/5 dark:to-slate-950/40" />
            <a
              href="https://commons.wikimedia.org/wiki/File:BlankMap-Equirectangular.svg"
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-2 right-2 rounded bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm hover:text-blue-600 dark:bg-slate-900/90 dark:text-slate-300"
            >
              Wikimedia Commons
            </a>
            {stats.map((stat, index) => {
              const isActive = matchesCountryFilter(stat.country, activeCountry);
              const size = 18 + Math.round((stat.count / maxCount) * 22);
              const hasKnownPoint = Boolean(COUNTRY_COORDS[stat.country]);
              const left = hasKnownPoint ? stat.x : 8 + (index % 4) * 5;
              const top = hasKnownPoint ? stat.y : 91;
              return (
                <button
                  key={stat.country}
                  type="button"
                  onClick={() => onCountryClick(stat.country)}
                  className={cn(
                    "group absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-semibold shadow-lg transition-all hover:scale-110",
                    isActive
                      ? "border-blue-200 bg-blue-600 text-white ring-4 ring-blue-500/20"
                      : "border-white bg-emerald-500 text-white hover:bg-blue-600 dark:border-slate-900",
                  )}
                  style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }}
                  title={`${stat.country}: ${stat.count}`}
                  aria-label={`${stat.country}: ${stat.count}`}
                >
                  {stat.count}
                  <span className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-xl group-hover:block">
                    {stat.country}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-black/20 lg:border-l lg:border-t-0">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
          <MapPin className="h-4 w-4 text-blue-500" />
          Countries
        </div>
        <div className="space-y-2">
          {stats.map((stat) => (
            <button
              key={stat.country}
              type="button"
              onClick={() => onCountryClick(stat.country)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                matchesCountryFilter(stat.country, activeCountry)
                  ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10",
              )}
            >
              <span className="truncate">{stat.country}</span>
              <span className="rounded bg-white px-2 py-0.5 text-xs font-mono text-slate-500 shadow-sm dark:bg-black/30 dark:text-slate-400">
                {stat.count}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Customers() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = getCurrentUser();
  const canBulkDeletePublicPool = ["admin", "superadmin"].includes(currentUser.role);

  const [activeTab, setActiveTab] = useState<"my-customers" | "public-pool">(
    "my-customers",
  );
  const [customers, setCustomers] = useState<Customer[]>(getCustomers());
  const [publicLeads, setPublicLeads] = useState<PublicLead[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<CustomerViewMode>("list");
  const [countryFilter, setCountryFilter] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [importTarget, setImportTarget] = useState<CsvImportTarget>("my-customers");
  const [importPreview, setImportPreview] = useState<CsvImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(
    null,
  );
  const [selectedPublicLeadIds, setSelectedPublicLeadIds] = useState<string[]>([]);
  const [isBulkDeletePublicLeadsOpen, setIsBulkDeletePublicLeadsOpen] = useState(false);

  useServerCollectionSync([
    {
      keys: ["crm_customers"],
      loadFromServer: loadCustomersFromServer,
      readFromCache: getCustomers,
      setData: setCustomers,
    },
    {
      keys: ["crm_public_leads"],
      loadFromServer: loadPublicLeadsFromServer,
      readFromCache: getPublicLeads,
      setData: setPublicLeads,
    },
  ]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      const c = getCustomers().find((c) => c.id === editId);
      if (c) {
        setEditingCustomer(c);
        setIsModalOpen(true);
      }
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const leadIds = new Set(publicLeads.map((lead) => lead.id));
    setSelectedPublicLeadIds((current) => current.filter((id) => leadIds.has(id)));
  }, [publicLeads]);

  const handleAdd = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const openImport = (target: CsvImportTarget) => {
    setImportTarget(target);
    setImportPreview(null);
    setImportError("");
    setIsImportOpen(true);
  };

  const handleCsvFile = async (file?: File) => {
    setImportError("");
    setImportPreview(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError("Please select a CSV file.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = csvToObjects(text);
      if (parsed.rows.length === 0) {
        setImportError("No importable rows found. Make sure the first row contains column headers.");
        return;
      }
      setImportPreview({ fileName: file.name, headers: parsed.headers, rows: parsed.rows });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to parse CSV file.");
    }
  };

  const confirmCsvImport = async () => {
    if (!importPreview) return;

    if (importTarget === "my-customers") {
      const imported = importPreview.rows.map(rowToCustomer).filter(Boolean) as Customer[];
      const existing = getCustomers();
      const existingKeys = new Set(existing.map((item) => `${item.name}|${item.contact}`.toLowerCase()));
      const unique = imported.filter((item) => {
        const key = `${item.name}|${item.contact}`.toLowerCase();
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      await saveCustomers([...unique, ...existing]);
      setCustomers(await loadCustomersFromServer());
      notify(`Imported ${unique.length} customer(s). ${imported.length - unique.length} duplicate row(s) skipped.`, "success", "CSV import complete");
    } else {
      const imported = importPreview.rows.map(rowToPublicLead).filter(Boolean) as PublicLead[];
      const existing = getPublicLeads();
      const existingKeys = new Set(existing.map((item) => `${item.source}|${item.name}|${item.contact}`.toLowerCase()));
      const unique = imported.filter((item) => {
        const key = `${item.source}|${item.name}|${item.contact}`.toLowerCase();
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      await savePublicLeads([...unique, ...existing]);
      setPublicLeads(await loadPublicLeadsFromServer());
      notify(`Imported ${unique.length} public lead(s). ${imported.length - unique.length} duplicate row(s) skipped.`, "success", "CSV import complete");
    }

    setIsImportOpen(false);
    setImportPreview(null);
  };

  const downloadSampleCsv = () => {
    const headers = [
      "company",
      "contact",
      "email",
      "phone",
      "website",
      "industry",
      "location",
      "country",
      "tags",
      "score",
      "intent",
      "risk",
      "notes",
      ...(importTarget === "public-pool" ? ["source"] : ["stage", "preferred_language"]),
    ];
    const rows =
      importTarget === "public-pool"
        ? [
            {
              company: "Northstar Dental Group",
              contact: "Mia Chen",
              email: "mia.chen@example.com",
              phone: "+1 415 555 0198",
              website: "https://northstar.example.com",
              industry: "Healthcare",
              location: "San Francisco, CA",
              country: "United States",
              tags: "clinic;high-fit",
              score: 78,
              intent: "Medium",
              risk: "Low",
              notes: "Interested in lightweight CRM automation.",
              source: "CSV Import",
            },
          ]
        : [
            {
              company: "Acme Manufacturing",
              contact: "Jordan Lee",
              email: "jordan.lee@example.com",
              phone: "+1 212 555 0144",
              website: "https://acme.example.com",
              industry: "Manufacturing",
              location: "New York, NY",
              country: "United States",
              tags: "key-account;renewal",
              score: 86,
              intent: "High",
              risk: "Medium",
              notes: "Existing customer, asked about annual volume pricing.",
              stage: "New Lead",
              preferred_language: "en",
            },
          ];
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvEscape((row as Record<string, string | number>)[header] || "")).join(",")),
    ].join("\n");
    downloadTextFile(
      importTarget === "public-pool" ? "public-pool-sample.csv" : "my-customers-sample.csv",
      csv,
    );
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingCustomerId(id);
  };

  const confirmDelete = () => {
    if (deletingCustomerId) {
      deleteCustomer(deletingCustomerId);
      setCustomers(getCustomers());
      setDeletingCustomerId(null);
    }
  };

  const handleSaveCustomer = (newCustomer: Customer) => {
    if (editingCustomer) {
      updateCustomer(editingCustomer.id, newCustomer);
    } else {
      addCustomer(newCustomer as any);
    }
    setCustomers(getCustomers());
    setIsModalOpen(false);
  };

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase();
    const country = getCustomerCountry(c);
    return (
      matchesCountryFilter(country, countryFilter) &&
      (c.name.toLowerCase().includes(q) ||
        c.contact.toLowerCase().includes(q) ||
        country.toLowerCase().includes(q) ||
        (c.tags || []).some((t) => t.toLowerCase().includes(q)))
    );
  });

  const filteredPublicLeads = publicLeads.filter((lead) => {
    const q = searchQuery.toLowerCase();
    const country = getPublicLeadCountry(lead);
    return (
      matchesCountryFilter(country, countryFilter) &&
      (lead.name.toLowerCase().includes(q) ||
        lead.source.toLowerCase().includes(q) ||
        lead.contact.toLowerCase().includes(q) ||
        (lead.location || "").toLowerCase().includes(q) ||
        country.toLowerCase().includes(q))
    );
  });

  const countryStats =
    activeTab === "my-customers"
      ? getCountryStats(customers, getCustomerCountry)
      : getCountryStats(publicLeads, getPublicLeadCountry);

  const visiblePublicLeadIds = filteredPublicLeads.map((lead) => lead.id);
  const selectedVisiblePublicLeadIds = selectedPublicLeadIds.filter((id) => visiblePublicLeadIds.includes(id));
  const isAllVisiblePublicLeadsSelected =
    visiblePublicLeadIds.length > 0 && selectedVisiblePublicLeadIds.length === visiblePublicLeadIds.length;

  const togglePublicLeadSelection = (leadId: string) => {
    setSelectedPublicLeadIds((current) =>
      current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId],
    );
  };

  const toggleAllVisiblePublicLeads = () => {
    setSelectedPublicLeadIds((current) => {
      const visibleIds = new Set(visiblePublicLeadIds);
      if (isAllVisiblePublicLeadsSelected) {
        return current.filter((id) => !visibleIds.has(id));
      }
      return Array.from(new Set([...current, ...visiblePublicLeadIds]));
    });
  };

  const confirmBulkDeletePublicLeads = () => {
    if (!canBulkDeletePublicPool || selectedPublicLeadIds.length === 0) return;
    deletePublicLeads(selectedPublicLeadIds);
    setPublicLeads(getPublicLeads());
    setSelectedPublicLeadIds([]);
    notify("Selected public leads have been deleted.", "success", "Public Pool updated");
  };

  const selectCountryOnMap = (country: string) => {
    setCountryFilter(country);
    setViewMode("list");
  };

  return (
    <div className="p-4 md:p-8 h-full flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-6 md:flex-row md:items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
            {t("cust.title")}
          </h1>
          <p className="text-slate-400 dark:text-slate-500 mt-1 text-sm font-light">
            {t("cust.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-lg flex items-center gap-1 border border-slate-200 dark:border-white/10 shadow-inner">
            <button
              onClick={() => {
                setActiveTab("my-customers");
                setCountryFilter("");
                setSelectedPublicLeadIds([]);
              }}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                activeTab === "my-customers"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
              )}
            >
              My Customers
            </button>
            <button
              onClick={() => {
                setActiveTab("public-pool");
                setCountryFilter("");
              }}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2",
                activeTab === "public-pool"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
              )}
            >
              Public Pool
              {publicLeads.length > 0 && (
                <span className="bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 px-1.5 py-0.5 rounded text-[10px]">
                  {publicLeads.length}
                </span>
              )}
            </button>
          </div>
          {!isModalOpen && activeTab === "public-pool" && canBulkDeletePublicPool && selectedPublicLeadIds.length > 0 && (
            <button
              type="button"
              onClick={() => setIsBulkDeletePublicLeadsOpen(true)}
              className="border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 rounded-lg flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected ({selectedPublicLeadIds.length})
            </button>
          )}
          {!isModalOpen && (
            <button
              onClick={() => openImport(activeTab)}
              className="border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
          )}
          {!isModalOpen && activeTab === "my-customers" && (
            <button
              onClick={handleAdd}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t("cust.add")}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        <div
          className={cn(
            "bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-xl flex flex-col overflow-hidden transition-all duration-300",
            isModalOpen ? "hidden lg:flex lg:w-1/3 shrink-0" : "flex-1",
          )}
        >
          <div className="p-4 border-b border-slate-200 dark:border-white/5 flex gap-4 shrink-0 bg-slate-50 dark:bg-black/20">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={t("cust.search") + " (or search by tags)"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500/50 focus:bg-white dark:bg-white/5 shadow-sm dark:shadow-none outline-none transition-all"
              />
            </div>
            {!isModalOpen && (
              <>
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                      viewMode === "list"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
                    )}
                  >
                    <List className="h-4 w-4" />
                    List
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("map")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                      viewMode === "map"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
                    )}
                  >
                    <MapIcon className="h-4 w-4" />
                    Map
                  </button>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white dark:bg-white/5 shadow-sm dark:shadow-none transition-colors">
                  <Filter className="h-4 w-4" />
                  {t("cust.filters")}
                </button>
              </>
            )}
          </div>
          {countryFilter && !isModalOpen && (
            <div className="flex items-center gap-2 border-b border-slate-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 dark:border-white/10 dark:bg-blue-500/10 dark:text-blue-300">
              <MapPin className="h-4 w-4" />
              <span>
                Country: <strong>{countryFilter}</strong>
              </span>
              <button
                type="button"
                onClick={() => setCountryFilter("")}
                className="ml-auto rounded-md px-2 py-1 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-500/20"
              >
                Clear
              </button>
            </div>
          )}

          <div className="overflow-auto flex-1">
            {viewMode === "map" && !isModalOpen ? (
              <CountryMapView
                stats={countryStats}
                activeCountry={countryFilter}
                onCountryClick={selectCountryOnMap}
                emptyText={activeTab === "my-customers" ? "No customer country data yet." : "No public lead location data yet."}
              />
            ) : activeTab === "my-customers" ? (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white dark:bg-black/40 border-b border-slate-200 dark:border-white/5 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      {t("cust.table.company")}
                    </th>
                    {!isModalOpen && (
                      <>
                        <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                          {t("cust.table.contact")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                          {t("cust.table.stage")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                          {t("cust.table.score")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                          {t("cust.table.intentRisk")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500 text-right">
                          {t("cust.table.actions")}
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredCustomers.map((c) => (
                    <tr
                      key={c.id}
                      className={cn(
                        "hover:bg-white/[0.04] transition-colors cursor-pointer",
                        editingCustomer?.id === c.id && isModalOpen
                          ? "bg-blue-50/50 dark:bg-blue-900/10"
                          : "",
                      )}
                      onClick={() => isModalOpen && handleEdit(c)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {!isModalOpen ? (
                            <Link
                              to={`/customers/${c.id}`}
                              className="font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:text-blue-400 transition-colors"
                            >
                              {c.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-900 dark:text-white">
                              {c.name}
                            </span>
                          )}
                          {!isModalOpen && c.tags && c.tags.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {c.tags.map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          {isModalOpen && (
                            <span className="text-xs text-slate-500">
                              {c.contact}
                            </span>
                          )}
                        </div>
                      </td>
                      {!isModalOpen && (
                        <>
                          <td className="px-6 py-4 text-slate-400 dark:text-slate-500 dark:text-slate-400">
                            {c.contact}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={cn(
                                "px-2 py-1 rounded text-[10px] font-mono",
                                c.stage === "Negotiation"
                                  ? "bg-purple-900/40 text-purple-400 border border-purple-500/20"
                                  : c.stage === "Qualified"
                                    ? "bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                                    : "bg-white/10 text-slate-400 dark:text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10",
                              )}
                            >
                              {c.stage}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-1.5 w-16 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]",
                                    c.score > 80
                                      ? "bg-emerald-500"
                                      : c.score > 50
                                        ? "bg-amber-500"
                                        : "bg-rose-500",
                                  )}
                                  style={{ width: `${c.score}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                                {c.score}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-4">
                              <div className="flex items-center gap-1.5">
                                <Zap
                                  className={cn(
                                    "w-3.5 h-3.5",
                                    c.intent === "High"
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-slate-600",
                                  )}
                                />
                                <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-400">
                                  {c.intent}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <ShieldAlert
                                  className={cn(
                                    "w-3.5 h-3.5",
                                    c.risk === "High"
                                      ? "text-rose-600 dark:text-rose-500"
                                      : "text-slate-600",
                                  )}
                                />
                                <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-400">
                                  {c.risk} risk
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(c);
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(c.id);
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td
                        colSpan={isModalOpen ? 1 : 6}
                        className="px-6 py-12 text-center text-slate-500"
                      >
                        {customers.length === 0
                          ? "No customers yet."
                          : "No customers match the current filters."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white dark:bg-black/40 border-b border-slate-200 dark:border-white/5 sticky top-0 z-10">
                  <tr>
                    {canBulkDeletePublicPool && (
                      <th className="px-6 py-4 w-12">
                        <input
                          type="checkbox"
                          checked={isAllVisiblePublicLeadsSelected}
                          onChange={toggleAllVisiblePublicLeads}
                          aria-label="Select all visible public leads"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                    )}
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Lead Info
                    </th>
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Contact
                    </th>
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Source
                    </th>
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Location
                    </th>
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredPublicLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className="hover:bg-white/[0.04] transition-colors"
                      >
                        {canBulkDeletePublicPool && (
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={selectedPublicLeadIds.includes(lead.id)}
                              onChange={() => togglePublicLeadSelection(lead.id)}
                              aria-label={`Select ${lead.name}`}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {lead.name}
                            </span>
                            {lead.industry && (
                              <span className="text-xs text-slate-500">
                                {lead.industry}
                              </span>
                            )}
                            {typeof lead.score === "number" && (
                              <div className="mt-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-14 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full",
                                        lead.score >= 75
                                          ? "bg-emerald-500"
                                          : lead.score >= 55
                                            ? "bg-amber-500"
                                            : "bg-rose-500",
                                      )}
                                      style={{ width: `${lead.score}%` }}
                                    />
                                  </div>
                                  <span className="font-mono text-[10px] text-slate-500">
                                    {lead.score}
                                  </span>
                                  {lead.intent && (
                                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                      {lead.intent}
                                    </span>
                                  )}
                                </div>
                                {lead.recommendedAction && (
                                  <span className="block text-[10px] text-slate-500 max-w-xs truncate">
                                    {lead.recommendedAction}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-400 dark:text-slate-500">
                          {lead.contact}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded text-[10px] font-mono bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                            {lead.source}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-400 dark:text-slate-500">
                          {lead.location || "-"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              claimLead(lead.id, "user");
                              setPublicLeads(getPublicLeads());
                              setCustomers(getCustomers());
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors shadow-sm"
                          >
                            Claim Lead
                          </button>
                        </td>
                      </tr>
                    ))}
                  {filteredPublicLeads.length === 0 && (
                    <tr>
                      <td
                        colSpan={canBulkDeletePublicPool ? 6 : 5}
                        className="px-6 py-12 text-center text-slate-500"
                      >
                        {publicLeads.length === 0
                          ? "No leads currently available in the public pool. Let your Lead Generation agents gather more!"
                          : "No public leads match the current filters."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {isModalOpen && (
          <CustomerFormView
            key={editingCustomer?.id || "new"}
            customer={editingCustomer}
            onSave={handleSaveCustomer}
            onClose={() => setIsModalOpen(false)}
          />
        )}

        {isImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900 flex flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6 dark:border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Import CSV to {importTarget === "my-customers" ? "My Customers" : "Public Pool"}
                    </h2>
                  </div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    Supported columns include company/name, contact, email, phone, website, industry, address/location, tags, score, intent, risk, and notes.
                  </p>
                  <button
                    type="button"
                    onClick={downloadSampleCsv}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Sample CSV
                  </button>
                </div>
                <button
                  onClick={() => setIsImportOpen(false)}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-5">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40 dark:border-white/10 dark:bg-black/20 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10">
                  <Upload className="mb-3 h-8 w-8 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Choose a CSV file
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    First row must contain column headers.
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => handleCsvFile(event.target.files?.[0])}
                  />
                </label>

                {importError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {importError}
                  </div>
                )}

                {importPreview && (
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                    <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {importPreview.fileName}
                      </span>
                      <span className="text-xs text-slate-500">
                        {importPreview.rows.length} rows detected. Previewing first 5 rows.
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white dark:bg-black/30">
                          <tr>
                            {(importPreview.headers.length ? importPreview.headers : ["name", "contact"]).slice(0, 8).map((header) => (
                              <th key={header} className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-400">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                          {importPreview.rows.slice(0, 5).map((row, index) => (
                            <tr key={index}>
                              {(importPreview.headers.length ? importPreview.headers : Object.keys(row)).slice(0, 8).map((header) => (
                                <td key={header} className="max-w-[180px] truncate px-4 py-3 text-slate-600 dark:text-slate-300">
                                  {row[header] || "-"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-black/20">
                <button
                  onClick={() => setIsImportOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCsvImport}
                  disabled={!importPreview}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Import CSV
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={deletingCustomerId !== null}
          title="Delete Customer"
          message="Are you sure you want to delete this customer? All their associated data will be removed. This action cannot be undone."
          onConfirm={confirmDelete}
          onCancel={() => setDeletingCustomerId(null)}
        />
        <ConfirmModal
          isOpen={isBulkDeletePublicLeadsOpen}
          title="Delete Public Pool Leads"
          message={`Delete ${selectedPublicLeadIds.length} selected public lead(s)? This action cannot be undone.`}
          confirmText="Delete Leads"
          onConfirm={confirmBulkDeletePublicLeads}
          onCancel={() => setIsBulkDeletePublicLeadsOpen(false)}
        />
      </div>
    </div>
  );
}
