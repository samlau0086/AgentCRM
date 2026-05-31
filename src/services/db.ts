export interface Contact {
  id: string;
  type: string;
  value: string;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface UniversalComment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  attachments?: Attachment[];
  replies?: UniversalComment[];
}

function notifyDataChanged(key: string) {
  window.dispatchEvent(new CustomEvent("crm:data-changed", { detail: { key } }));
}

const SERVER_COLLECTIONS: Record<string, string> = {
  crm_public_leads: "/api/crm/public-leads",
  crm_documents: "/api/knowledge",
  crm_customers: "/api/crm/customers",
  crm_products: "/api/crm/products",
  crm_quotes: "/api/crm/quotes",
  crm_model_profiles: "/api/model-profiles",
  crm_agents: "/api/agents",
  crm_agent_runs: "/api/agent/runs",
  crm_agent_steps: "/api/agent/steps",
  crm_agent_approvals: "/api/agent/approvals",
  crm_users: "/api/app/users",
  crm_inbox: "/api/communication/inbox",
};

function persistRecordList(key: string, records: Array<{ id: string }>) {
  const route = SERVER_COLLECTIONS[key];
  if (!route || typeof fetch === "undefined") return;
  Promise.allSettled(
    records.map((record) =>
        fetch(`${route}/${encodeURIComponent(record.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        }),
    ),
  ).catch(console.error);
}

function deleteRecordFromServer(key: string, id: string) {
  const route = SERVER_COLLECTIONS[key];
  if (!route || typeof fetch === "undefined") return;
  fetch(`${route}/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(console.error);
}

async function loadRecordListFromServer<T>(key: string): Promise<T[] | null> {
  const route = SERVER_COLLECTIONS[key];
  if (!route || typeof fetch === "undefined") return null;
  const response = await fetch(route);
  if (!response.ok) return null;
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

function cacheRecordList<T>(key: string, records: T[]) {
  localStorage.setItem(key, JSON.stringify(records));
  notifyDataChanged(key);
}

export async function hydrateCrmDataFromServer() {
  let shouldMigrateLocalCache = false;
  try {
    const migrationResponse = await fetch("/api/app/settings/crm_data_migrated_to_server");
    shouldMigrateLocalCache = migrationResponse.status === 404;
  } catch (e) {
    shouldMigrateLocalCache = false;
  }

  const entries = await Promise.allSettled(
    Object.keys(SERVER_COLLECTIONS).map(async (key) => {
      const records = await loadRecordListFromServer(key);
      if (!records) {
        try {
          const cached = JSON.parse(localStorage.getItem(key) || "[]");
          return [key, Array.isArray(cached) ? cached : []] as const;
        } catch (e) {
          return [key, []] as const;
        }
      }
      if (records.length > 0) {
        cacheRecordList(key, records);
        return [key, records] as const;
      }

      if (shouldMigrateLocalCache) {
        try {
          const cached = JSON.parse(localStorage.getItem(key) || "[]");
          if (Array.isArray(cached) && cached.length > 0) {
            persistRecordList(key, cached.filter((record) => record?.id));
            return [key, cached] as const;
          }
        } catch (e) {}
      }

      cacheRecordList(key, []);
      return [key, []] as const;
    }),
  );

  if (shouldMigrateLocalCache) {
    fetch("/api/app/settings/crm_data_migrated_to_server", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "crm_data_migrated_to_server",
        value: true,
        updatedAt: new Date().toISOString(),
      }),
    }).catch(console.error);
  }

  return Object.fromEntries(
    entries
      .filter((entry): entry is PromiseFulfilledResult<readonly [string, unknown[]]> => entry.status === "fulfilled")
      .map((entry) => entry.value),
  );
}

export async function loadCustomersFromServer() {
  const customers = await loadRecordListFromServer<Customer>("crm_customers");
  if (!customers) return getCustomers();
  if (customers.length === 0) {
    const cached = getCustomers();
    const migrationResponse = await fetch("/api/app/settings/crm_data_migrated_to_server").catch(() => null);
    if (migrationResponse?.status === 404 && cached.length > 0) {
      persistRecordList("crm_customers", cached);
      return cached;
    }
  }
  cacheRecordList("crm_customers", customers);
  return customers;
}

export async function loadPublicLeadsFromServer() {
  const leads = await loadRecordListFromServer<PublicLead>("crm_public_leads");
  if (!leads) return getPublicLeads();
  if (leads.length === 0) {
    const cached = getPublicLeads();
    const migrationResponse = await fetch("/api/app/settings/crm_data_migrated_to_server").catch(() => null);
    if (migrationResponse?.status === 404 && cached.length > 0) {
      persistRecordList("crm_public_leads", cached);
      return cached;
    }
  }
  cacheRecordList("crm_public_leads", leads);
  return leads;
}

export async function loadAgentsFromServer() {
  const agents = await loadRecordListFromServer<Agent>("crm_agents");
  if (!agents) return getAgents();
  cacheRecordList("crm_agents", agents);
  return agents;
}

export interface CustomerLog {
  id: string;
  time: string;
  event: string;
  type: "ai" | "action" | "comm";
}

export interface PublicLead {
  id: string;
  name: string;
  contact: string;
  source: string;
  scrapedAt: string;
  contacts?: Contact[];
  industry?: string;
  location?: string;
  description?: string;
  score?: number;
  risk?: "Low" | "Medium" | "High";
  intent?: "Low" | "Medium" | "High";
  aiAnalysis?: string;
  recommendedAction?: string;
  enrichmentPlatforms?: string[];
  scoredAt?: string;
  enrichedAt?: string;
}

function isDemoPublicLead(lead: PublicLead) {
  const text = [lead.id, lead.name, lead.contact, lead.source, lead.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\b(mock|demo|sample|test|fake|placeholder)\b/.test(text) || text.includes("techflow solutions");
}

export function getPublicLeads(): PublicLead[] {
  try {
    const data = localStorage.getItem("crm_public_leads");
    if (data) {
      const parsed = JSON.parse(data) as PublicLead[];
      const realLeads = parsed.filter((lead) => !isDemoPublicLead(lead));
      if (realLeads.length !== parsed.length) savePublicLeads(realLeads);
      return realLeads;
    }
  } catch (e) {}

  const initial: PublicLead[] = [];
  savePublicLeads(initial);
  return initial;
}

export function savePublicLeads(leads: PublicLead[]) {
  localStorage.setItem("crm_public_leads", JSON.stringify(leads));
  persistRecordList("crm_public_leads", leads);
  notifyDataChanged("crm_public_leads");
}

export function deletePublicLead(id: string) {
  const leads = getPublicLeads();
  savePublicLeads(leads.filter((l) => l.id !== id));
  deleteRecordFromServer("crm_public_leads", id);
}

export function claimLead(leadId: string, userId: string) {
  const leads = getPublicLeads();
  const leadIndex = leads.findIndex((l) => l.id === leadId);
  if (leadIndex === -1) return;

  const lead = leads[leadIndex];
  leads.splice(leadIndex, 1);
  savePublicLeads(leads);

  // Convert lead to customer
  const newCustomer: Customer = {
    id: `cus_${Math.random().toString(36).substr(2, 9)}`,
    name: lead.name,
    contact: lead.contact,
    stage: "New Lead",
    score: 50,
    risk: "Low",
    intent: "Low",
    contacts: lead.contacts || [],
    description: lead.description || `Sourced from ${lead.source}`,
    city: lead.location,
    industry: lead.industry,
    tags: [lead.source],
    logs: [
      {
        id: Math.random().toString(36).substring(7),
        event: "Lead claimed from Public Pool",
        time: new Date().toISOString(),
        type: "action",
      },
    ],
    // ownerId: userId // if we want to store specific owner, but right now current user is just the one logged in
  };

  addCustomer(newCustomer);
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  stage: string;
  score: number;
  risk: "Low" | "Medium" | "High";
  contacts: Contact[];
  intent: string;
  industry?: string;
  address?: string;
  province?: string;
  city?: string;
  description?: string;
  country?: string;
  preferredLanguage?: string;
  notes?: string;
  logs?: CustomerLog[];
  comments?: UniversalComment[];
  tags?: string[];
}

export interface Document {
  id: string;
  title: string;
  pieces: number;
  status: string;
  date: string;
  content?: string;
}

export function getDocuments(): Document[] {
  try {
    const data = localStorage.getItem("crm_documents");
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {}

  const initial: Document[] = [];
  saveDocuments(initial);
  return initial;
}

export function saveDocuments(docs: Document[]) {
  localStorage.setItem("crm_documents", JSON.stringify(docs));
  persistRecordList("crm_documents", docs);
  notifyDataChanged("crm_documents");
}

export function addDocument(doc: Omit<Document, "id">) {
  const docs = getDocuments();
  docs.unshift({ ...doc, id: Math.random().toString(36).substr(2, 9) });
  saveDocuments(docs);
}

export function deleteDocument(id: string) {
  const docs = getDocuments();
  saveDocuments(docs.filter((d) => d.id !== id));
  deleteRecordFromServer("crm_documents", id);
}

export function getCustomers(): Customer[] {
  try {
    const data = localStorage.getItem("crm_customers");
    if (data) {
      let parsed = JSON.parse(data);
      let needsSave = false;
      parsed = parsed.map((c: any) => {
        if (typeof c.risk === "number") {
          needsSave = true;
          c.risk = c.risk >= 70 ? "High" : c.risk >= 30 ? "Medium" : "Low";
        }
        if (!c.preferredLanguage) {
          c.preferredLanguage = "en";
        }
        if (!c.logs) c.logs = [];
        return c;
      });
      if (needsSave) saveCustomers(parsed);
      return parsed;
    }
  } catch (e) {}

  const initial: Customer[] = [];
  saveCustomers(initial);
  return initial;
}

export function saveCustomers(customers: Customer[]) {
  localStorage.setItem("crm_customers", JSON.stringify(customers));
  persistRecordList("crm_customers", customers);
  notifyDataChanged("crm_customers");
}

// ----------------------------------------------------------------------
// PRODUCTS
// ----------------------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  price: number;
  pricingTiers?: { minQty: number; unitPrice: number }[];
  currency: string;
  status: "Active" | "Inactive";
  image?: string;
}

export function getProducts(): Product[] {
  try {
    const data = localStorage.getItem("crm_products");
    if (data) return JSON.parse(data);
  } catch (e) {}

  const initial: Product[] = [];
  saveProducts(initial);
  return initial;
}

export function saveProducts(products: Product[]) {
  localStorage.setItem("crm_products", JSON.stringify(products));
  persistRecordList("crm_products", products);
  notifyDataChanged("crm_products");
}

export function addProduct(product: Omit<Product, "id">) {
  const products = getProducts();
  products.push({
    ...product,
    id: `prod_${Math.random().toString(36).substr(2, 9)}`,
  });
  saveProducts(products);
}

export function updateProduct(id: string, updates: Partial<Product>) {
  const products = getProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index !== -1) {
    products[index] = { ...products[index], ...updates };
    saveProducts(products);
  }
}

export function deleteProduct(id: string) {
  saveProducts(getProducts().filter((p) => p.id !== id));
  deleteRecordFromServer("crm_products", id);
}

// ----------------------------------------------------------------------
// QUOTES
// ----------------------------------------------------------------------

export interface QuoteItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface Quote {
  id: string;
  customerId: string;
  date: string;
  validUntil: string;
  items: QuoteItem[];
  feeLines?: { name: string; amount: number }[];
  paymentTerms?: string;
  subtotal: number;
  totalDiscount: number;
  total: number;
  status: "Draft" | "Sent" | "Approved" | "Rejected";
  notes: string;
}

export function getQuotes(): Quote[] {
  try {
    const data = localStorage.getItem("crm_quotes");
    if (data) return JSON.parse(data);
  } catch (e) {}

  const initial: Quote[] = [];
  saveQuotes(initial);
  return initial;
}

export function saveQuotes(quotes: Quote[]) {
  localStorage.setItem("crm_quotes", JSON.stringify(quotes));
  persistRecordList("crm_quotes", quotes);
  notifyDataChanged("crm_quotes");
}

export function addQuote(quote: Omit<Quote, "id">) {
  const quotes = getQuotes();
  quotes.push({
    ...quote,
    id: `quote_${Math.random().toString(36).substr(2, 9)}`,
  });
  saveQuotes(quotes);
}

export function updateQuote(id: string, updates: Partial<Quote>) {
  const quotes = getQuotes();
  const index = quotes.findIndex((q) => q.id === id);
  if (index !== -1) {
    quotes[index] = { ...quotes[index], ...updates };
    saveQuotes(quotes);
  }
}

export function deleteQuote(id: string) {
  saveQuotes(getQuotes().filter((q) => q.id !== id));
  deleteRecordFromServer("crm_quotes", id);
}

export function getCustomer(id: string): Customer | undefined {
  const customers = getCustomers();
  return customers.find((c) => c.id === id);
}

export function updateCustomer(id: string, updates: Partial<Customer>) {
  const customers = getCustomers();
  const index = customers.findIndex((c) => c.id === id);
  if (index !== -1) {
    customers[index] = { ...customers[index], ...updates };
    saveCustomers(customers);
  }
}

export function addCustomer(customer: Omit<Customer, "id">) {
  const customers = getCustomers();
  const newCustomer = {
    ...customer,
    id: Math.random().toString(36).substr(2, 9),
  };
  customers.push(newCustomer as Customer);
  saveCustomers(customers);
  return newCustomer;
}

export function deleteCustomer(id: string) {
  const customers = getCustomers();
  saveCustomers(customers.filter((c) => c.id !== id));
  deleteRecordFromServer("crm_customers", id);
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: "Active" | "Idle" | "Disabled";
  tasks: number;
  harness: "Auto" | "Human-in-the-loop";
  modelProfileId?: string;
  tools?: string[];
  integrations?: string[];
  workflowIds?: string[];
  schedule?: {
    mode: "interval" | "monthly";
    intervalEvery?: number;
    intervalUnit?: "seconds" | "minutes" | "hours" | "days";
    monthlyDay?: number;
    maxRuns?: number;
    executedRuns?: number;
    lastRunAt?: string;
  };
}

export interface ModelProfile {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google" | "openrouter" | "custom";
  model: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
}

export function getModelProfiles(): ModelProfile[] {
  try {
    const data = localStorage.getItem("crm_model_profiles");
    if (data) return JSON.parse(data);
  } catch (e) {}

  const initial: ModelProfile[] = [
    {
      id: "default_google",
      name: "Default Google Gemini",
      provider: "google",
      model: "gemini-1.5-flash",
      temperature: 0.4,
    },
  ];
  saveModelProfiles(initial);
  return initial;
}

export function saveModelProfiles(profiles: ModelProfile[]) {
  localStorage.setItem("crm_model_profiles", JSON.stringify(profiles));
  persistRecordList("crm_model_profiles", profiles);
  notifyDataChanged("crm_model_profiles");
}

function builtInAgents(): Agent[] {
  return [
    {
      id: "orchestrator",
      name: "Orchestrator Agent",
      role: "Routes CRM work to specialized agents and summarizes outcomes.",
      status: "Active",
      tasks: 0,
      harness: "Auto",
      modelProfileId: "default_google",
      tools: ["customers", "inbox", "quotes", "knowledge", "approvals"],
      workflowIds: ["customer_scoring", "quote_draft"],
      schedule: { mode: "interval", intervalEvery: 1, intervalUnit: "days", maxRuns: 0, executedRuns: 0 },
    },
    {
      id: "sdr",
      name: "Sales Development Agent",
      role: "Researches prospects, identifies high-intent leads, and prepares outreach.",
      status: "Active",
      tasks: 0,
      harness: "Human-in-the-loop",
      modelProfileId: "default_google",
      tools: ["customers", "inbox", "email_send", "quotes", "approvals"],
      workflowIds: ["customer_scoring", "quote_draft"],
      schedule: { mode: "interval", intervalEvery: 1, intervalUnit: "days", maxRuns: 0, executedRuns: 0 },
    },
    {
      id: "support",
      name: "Support Agent",
      role: "Drafts helpful replies and resolves customer questions using CRM context.",
      status: "Active",
      tasks: 0,
      harness: "Human-in-the-loop",
      modelProfileId: "default_google",
      tools: ["customers", "inbox", "email_send", "whatsapp_send", "knowledge", "approvals"],
      workflowIds: ["customer_scoring"],
      schedule: { mode: "interval", intervalEvery: 1, intervalUnit: "days", maxRuns: 0, executedRuns: 0 },
    },
    {
      id: "lead_generation",
      name: "Lead Generation Agent",
      role: "Uses configured lead platforms to discover, enrich, and prepare new prospects.",
      status: "Active",
      tasks: 0,
      harness: "Human-in-the-loop",
      modelProfileId: "default_google",
      tools: ["lead_platforms", "customers", "knowledge", "approvals"],
      workflowIds: ["lead_scoring", "lead_enrichment"],
      schedule: { mode: "interval", intervalEvery: 1, intervalUnit: "days", maxRuns: 0, executedRuns: 0 },
      integrations: [
        "Outscraper",
        "Apify",
        "PhantomBuster",
        "Scrap.io",
        "HasData",
        "Decodo",
        "Clay.com",
      ],
    },
  ];
}

export interface AgentRun {
  id: string;
  customerId?: string;
  agentId: string;
  taskType: string;
  workflowId?: string;
  status: "Running" | "Pending" | "Completed" | "Failed";
  operationKey?: string;
  operationType?: string;
  targetType?: "lead" | "customer" | "message" | "quote" | "platform" | "global";
  targetId?: string;
  repeatable?: boolean;
  inputJson?: any;
  outputJson?: any;
  toolResults?: any[];
  currentStep?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface AgentStep {
  id: string;
  runId: string;
  stepType: string; // 'Action', 'Tool', 'Thought'
  toolName?: string;
  inputJson?: any;
  outputJson?: any;
  status: "Success" | "Failed";
  createdAt: string;
}

export interface AgentApproval {
  id: string;
  runId: string;
  actionType: string;
  proposedPayload: any;
  status: "Pending" | "Approved" | "Rejected";
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

export function getAgentRuns(): AgentRun[] {
  try {
    const data = localStorage.getItem("crm_agent_runs");
    if (data) return JSON.parse(data);
  } catch (e) {}

  const initialRuns: AgentRun[] = [];
  saveAgentRuns(initialRuns);
  return initialRuns;
}

export function saveAgentRuns(runs: AgentRun[]) {
  localStorage.setItem("crm_agent_runs", JSON.stringify(runs));
  persistRecordList("crm_agent_runs", runs);
  notifyDataChanged("crm_agent_runs");
}

export function addAgentRun(run: Omit<AgentRun, "id" | "createdAt">) {
  const runs = getAgentRuns();
  const newRun: AgentRun = {
    ...run,
    id: `run_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  saveAgentRuns([newRun, ...runs]);
  return newRun;
}

export function getAgentSteps(): AgentStep[] {
  try {
    const data = localStorage.getItem("crm_agent_steps");
    if (data) return JSON.parse(data);
  } catch (e) {}

  const initialSteps: AgentStep[] = [];
  saveAgentSteps(initialSteps);
  return initialSteps;
}

export function saveAgentSteps(steps: AgentStep[]) {
  localStorage.setItem("crm_agent_steps", JSON.stringify(steps));
  persistRecordList("crm_agent_steps", steps);
  notifyDataChanged("crm_agent_steps");
}

export function addAgentStep(step: Omit<AgentStep, "id" | "createdAt">) {
  const steps = getAgentSteps();
  const newStep: AgentStep = {
    ...step,
    id: `step_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  saveAgentSteps([...steps, newStep]);
  return newStep;
}

export function getAgentApprovals(): AgentApproval[] {
  try {
    const data = localStorage.getItem("crm_agent_approvals");
    if (data) return JSON.parse(data);
  } catch (e) {}

  const initialApprovals: AgentApproval[] = [];
  saveAgentApprovals(initialApprovals);
  return initialApprovals;
}

export function saveAgentApprovals(approvals: AgentApproval[]) {
  localStorage.setItem("crm_agent_approvals", JSON.stringify(approvals));
  persistRecordList("crm_agent_approvals", approvals);
  notifyDataChanged("crm_agent_approvals");
}

export function addAgentApproval(approval: Omit<AgentApproval, "id" | "createdAt">) {
  const approvals = getAgentApprovals();
  const newApproval: AgentApproval = {
    ...approval,
    id: `app_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  saveAgentApprovals([newApproval, ...approvals]);
  return newApproval;
}

export function getAgents(): Agent[] {
  try {
    const data = localStorage.getItem("crm_agents");
    if (data) {
      let parsed = JSON.parse(data) as Agent[];
      if (!Array.isArray(parsed)) return builtInAgents();
      const legacyLeadAgent = parsed.find((agent) => agent.id === "5");
      if (legacyLeadAgent) {
        parsed = [
          { ...legacyLeadAgent, id: "lead_generation" },
          ...parsed.filter(
            (agent) => agent.id !== "5" && agent.id !== "lead_generation",
          ),
        ];
      }
      const normalized = parsed.map((agent: Agent) => ({
        ...agent,
        modelProfileId: agent.modelProfileId || "default_google",
        tools: agent.tools || builtInAgents().find((item) => item.id === agent.id)?.tools || [],
        workflowIds: agent.workflowIds || builtInAgents().find((item) => item.id === agent.id)?.workflowIds || [],
        schedule: agent.schedule || builtInAgents().find((item) => item.id === agent.id)?.schedule || { mode: "interval", intervalEvery: 1, intervalUnit: "days", maxRuns: 0, executedRuns: 0 },
      }));
      if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
        saveAgents(normalized);
      }
      return normalized;
    }
  } catch (e) {}

  return builtInAgents();
}

export function saveAgents(agents: Agent[]) {
  localStorage.setItem("crm_agents", JSON.stringify(agents));
  persistRecordList("crm_agents", agents);
  notifyDataChanged("crm_agents");
}

export function addAgent(agent: Omit<Agent, "id" | "tasks">) {
  const agents = getAgents();
  agents.push({
    ...agent,
    id: Math.random().toString(36).substr(2, 9),
    tasks: 0,
  });
  saveAgents(agents);
}

export function updateAgent(id: string, agent: Partial<Agent>) {
  const agents = getAgents();
  const index = agents.findIndex((a) => a.id === id);
  if (index !== -1) {
    agents[index] = { ...agents[index], ...agent };
    saveAgents(agents);
  }
}

export function deleteAgent(id: string) {
  const agents = getAgents();
  saveAgents(agents.filter((a) => a.id !== id));
  deleteRecordFromServer("crm_agents", id);
}

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "sales" | "support";
  status: "Active" | "Inactive";
  permissions: string[];
}

export function getSystemUsers(): SystemUser[] {
  try {
    const data = localStorage.getItem("crm_users");
    if (data) return JSON.parse(data);
  } catch (e) {}

  const initial: SystemUser[] = [
    {
      id: "u1",
      name: "Super Admin",
      email: "admin@acmecorp.com",
      role: "superadmin",
      status: "Active",
      permissions: ["all"],
    },
    {
      id: "u2",
      name: "Alice Chen",
      email: "alice@acmecorp.com",
      role: "sales",
      status: "Active",
      permissions: ["view_customers", "edit_customers", "reply_inbox"],
    },
    {
      id: "u3",
      name: "Bob Smith",
      email: "bob@acmecorp.com",
      role: "sales",
      status: "Active",
      permissions: ["view_customers", "reply_inbox"],
    },
    {
      id: "u4",
      name: "Charlie Davis",
      email: "charlie@acmecorp.com",
      role: "support",
      status: "Active",
      permissions: ["view_customers", "reply_inbox"],
    },
  ];
  saveSystemUsers(initial);
  return initial;
}

export function saveSystemUsers(users: SystemUser[]) {
  localStorage.setItem("crm_users", JSON.stringify(users));
  persistRecordList("crm_users", users);
  notifyDataChanged("crm_users");
}

export function getCurrentUser(): SystemUser {
  try {
    const data = localStorage.getItem("crm_current_user");
    if (data) return JSON.parse(data);
  } catch (e) {}
  const users = getSystemUsers();
  const defaultUser = users[0];
  setCurrentUser(defaultUser);
  return defaultUser;
}

export function setCurrentUser(user: SystemUser) {
  localStorage.setItem("crm_current_user", JSON.stringify(user));
  fetch("/api/app/settings/crm_current_user", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "crm_current_user", value: user, updatedAt: new Date().toISOString() }),
  }).catch(console.error);
}

export interface ThreadMessage {
  id: string;
  sender: "user" | "agent";
  content: string;
  htmlContent?: string;
  time: string;
}

export interface MessagePreview {
  id: string;
  sender: string;
  target: string;
  direction?: "inbound" | "outbound";
  customerId?: string;
  userId?: string;
  intent: string;
  subject: string;
  summary: string;
  bodyHtml?: string;
  channel: "Email" | "WhatsApp";
  date: string;
  read: boolean;
  assignee?: string;
  thread: ThreadMessage[];
  comments?: UniversalComment[];
  tags?: string[];
}

export function updateInboxMessage(
  id: string,
  updates: Partial<MessagePreview>,
) {
  const msgs = getInboxMessages();
  const index = msgs.findIndex((m) => m.id === id);
  if (index !== -1) {
    msgs[index] = { ...msgs[index], ...updates };
    saveInboxMessages(msgs);
  }
}

export function getInboxMessages(): MessagePreview[] {
  try {
    const data = localStorage.getItem("crm_inbox");
    if (data) {
      const customers = getCustomers();
      let needsSave = false;
      const parsed = (JSON.parse(data) as MessagePreview[]).map((msg) => {
        if (!msg.customerId) {
          const customer = customers.find((c) =>
            c.contacts?.some(
              (contact) =>
                contact.value.toLowerCase() === msg.sender.toLowerCase() ||
                contact.value.toLowerCase() === msg.target.toLowerCase(),
            ),
          );
          if (customer) {
            needsSave = true;
            return { ...msg, customerId: customer.id, userId: customer.id };
          }
        }
        return msg;
      });
      if (needsSave) saveInboxMessages(parsed);
      return parsed;
    }
  } catch (e) {}

  const initial: MessagePreview[] = [];
  saveInboxMessages(initial);
  return initial;
}

export function saveInboxMessages(msgs: MessagePreview[]) {
  localStorage.setItem("crm_inbox", JSON.stringify(msgs));
  persistRecordList("crm_inbox", msgs);
  notifyDataChanged("crm_inbox");
}

export function deleteInboxMessage(id: string) {
  saveInboxMessages(getInboxMessages().filter((msg) => msg.id !== id));
  fetch(`/api/communication/inbox/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(console.error);
}

export async function loadInboxMessagesFromServer() {
  const response = await fetch("/api/communication/inbox");
  if (!response.ok) return getInboxMessages();
  const remote = await response.json().catch(() => []);
  if (!Array.isArray(remote)) return getInboxMessages();
  const messages = remote.sort((a, b) => {
    const timeA = Date.parse(a.date || "") || 0;
    const timeB = Date.parse(b.date || "") || 0;
    return timeB - timeA;
  });
  localStorage.setItem("crm_inbox", JSON.stringify(messages));
  notifyDataChanged("crm_inbox");
  return messages;
}

export function addDraftToThread(messageId: string, reply: string) {
  const msgs = getInboxMessages();
  const m = msgs.find((x) => x.id === messageId);
  if (m) {
    m.thread.push({
      id: Math.random().toString(),
      sender: "agent",
      content: reply,
      time: new Date().toLocaleTimeString(),
    });
    saveInboxMessages(msgs);
  }
}

export function addOutboundMessage(message: Omit<MessagePreview, "id" | "read" | "date" | "direction">) {
  const msgs = getInboxMessages();
  const newMessage: MessagePreview = {
    ...message,
    direction: "outbound",
    id: `msg_${Math.random().toString(36).substr(2, 9)}`,
    read: true,
    date: new Date().toLocaleString(),
  };
  msgs.unshift(newMessage);
  saveInboxMessages(msgs);
  return newMessage;
}

export function markMessageRead(messageId: string) {
  const msgs = getInboxMessages();
  const m = msgs.find((x) => x.id === messageId);
  if (m) {
    m.read = true;
    saveInboxMessages(msgs);
  }
}
