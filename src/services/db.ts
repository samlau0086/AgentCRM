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
}

export function getPublicLeads(): PublicLead[] {
  try {
    const data = localStorage.getItem("crm_public_leads");
    if (data) return JSON.parse(data);
  } catch (e) {}

  const initial: PublicLead[] = [];
  savePublicLeads(initial);
  return initial;
}

export function savePublicLeads(leads: PublicLead[]) {
  localStorage.setItem("crm_public_leads", JSON.stringify(leads));
}

export function deletePublicLead(id: string) {
  const leads = getPublicLeads();
  savePublicLeads(leads.filter((l) => l.id !== id));
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
}

export function addDocument(doc: Omit<Document, "id">) {
  const docs = getDocuments();
  docs.unshift({ ...doc, id: Math.random().toString(36).substr(2, 9) });
  saveDocuments(docs);
}

export function deleteDocument(id: string) {
  const docs = getDocuments();
  saveDocuments(docs.filter((d) => d.id !== id));
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
        if (!c.logs || c.logs.length <= 3) {
          needsSave = true;
          c.logs = [
            {
              id: "1",
              time: "Today, 10:30 AM",
              event: "AI identified high read-rate on Quotation #1044",
              type: "ai",
            },
            {
              id: "2",
              time: "Yesterday, 2:15 PM",
              event: 'Customer opened email: "Updated Pricing for Bulk"',
              type: "action",
            },
            {
              id: "3",
              time: "May 20, 11:00 AM",
              event: "Sent Quotation #1044 ($42,000)",
              type: "comm",
            },
            {
              id: "h1",
              time: "May 18, 9:00 AM",
              event: "Initial inquiry received via Website Form",
              type: "comm",
            },
            {
              id: "h2",
              time: "May 18, 9:15 AM",
              event: "AI auto-replied with product catalog",
              type: "ai",
            },
            {
              id: "h3",
              time: "May 19, 10:20 AM",
              event: "Customer requested bulk pricing",
              type: "action",
            },
            {
              id: "h4",
              time: "May 19, 11:00 AM",
              event: "Agent generated quotation #1044",
              type: "comm",
            },
          ];
        }
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
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: "Active" | "Idle" | "Disabled";
  tasks: number;
  harness: "Auto" | "Human-in-the-loop";
  modelProfileId?: string;
  integrations?: string[];
}

export interface ModelProfile {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google" | "custom";
  model: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  systemPrompt?: string;
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
      systemPrompt: "You are a CRM automation agent. Execute tasks carefully and report concise operational logs.",
    },
  ];
  saveModelProfiles(initial);
  return initial;
}

export function saveModelProfiles(profiles: ModelProfile[]) {
  localStorage.setItem("crm_model_profiles", JSON.stringify(profiles));
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
    },
    {
      id: "sdr",
      name: "Sales Development Agent",
      role: "Researches prospects, identifies high-intent leads, and prepares outreach.",
      status: "Active",
      tasks: 0,
      harness: "Human-in-the-loop",
      modelProfileId: "default_google",
    },
    {
      id: "support",
      name: "Support Agent",
      role: "Drafts helpful replies and resolves customer questions using CRM context.",
      status: "Active",
      tasks: 0,
      harness: "Human-in-the-loop",
      modelProfileId: "default_google",
    },
    {
      id: "lead_generation",
      name: "Lead Generation Agent",
      role: "Uses configured lead platforms to discover, enrich, and prepare new prospects.",
      status: "Active",
      tasks: 0,
      harness: "Human-in-the-loop",
      modelProfileId: "default_google",
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
  status: "Running" | "Pending" | "Completed" | "Failed";
  inputJson?: any;
  outputJson?: any;
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
      let parsed = JSON.parse(data);
      const existingIds = new Set(parsed.map((agent: Agent) => agent.id));
      const missingBuiltIns = builtInAgents().filter((agent) => !existingIds.has(agent.id));
      if (missingBuiltIns.length > 0) {
        parsed = [...parsed, ...missingBuiltIns];
      }
      const normalized = parsed.map((agent: Agent) => ({
        ...agent,
        modelProfileId: agent.modelProfileId || "default_google",
      }));
      if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
        saveAgents(normalized);
      }
      return normalized;
    }
  } catch (e) {}

  const initial: Agent[] = builtInAgents();
  saveAgents(initial);
  return initial;
}

export function saveAgents(agents: Agent[]) {
  localStorage.setItem("crm_agents", JSON.stringify(agents));
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
}

export function getCurrentUser(): SystemUser {
  try {
    const data = localStorage.getItem("crm_current_user");
    if (data) return JSON.parse(data);
  } catch (e) {}
  const users = getSystemUsers();
  const defaultUser = users[0];
  localStorage.setItem("crm_current_user", JSON.stringify(defaultUser));
  return defaultUser;
}

export function setCurrentUser(user: SystemUser) {
  localStorage.setItem("crm_current_user", JSON.stringify(user));
}

export interface ThreadMessage {
  id: string;
  sender: "user" | "agent";
  content: string;
  time: string;
}

export interface MessagePreview {
  id: string;
  sender: string;
  target: string;
  customerId?: string;
  userId?: string;
  intent: string;
  subject: string;
  summary: string;
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
  notifyDataChanged("crm_inbox");
}

export function deleteInboxMessage(id: string) {
  saveInboxMessages(getInboxMessages().filter((msg) => msg.id !== id));
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

export function addOutboundMessage(message: Omit<MessagePreview, "id" | "read" | "date">) {
  const msgs = getInboxMessages();
  const newMessage: MessagePreview = {
    ...message,
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
