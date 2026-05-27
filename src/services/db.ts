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

  const initial: PublicLead[] = [
    {
      id: "lead_1",
      name: "TechFlow Solutions",
      contact: "Alice Chen",
      source: "Outscraper",
      scrapedAt: new Date().toISOString(),
      contacts: [
        { id: "1", type: "Email", value: "alice@techflow.example.com" },
      ],
      location: "San Francisco, CA",
      description: "Tech startup looking for CRM solutions.",
    },
    {
      id: "lead_2",
      name: "Global Retail Group",
      contact: "Bob Martin",
      source: "Apify",
      scrapedAt: new Date().toISOString(),
      contacts: [
        { id: "2", type: "LinkedIn", value: "linkedin.com/in/bob-martin" },
      ],
      industry: "Retail",
      location: "London, UK",
    },
    {
      id: "lead_3",
      name: "Innovate Health",
      contact: "Dr. Sarah Lee",
      source: "PhantomBuster",
      scrapedAt: new Date().toISOString(),
      contacts: [{ id: "3", type: "Mobile", value: "+1-555-0199" }],
    },
  ];
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
    risk: 1,
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
  risk: number;
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

  const initial = [
    {
      id: "1",
      title: "Product Catalog Q3 2026",
      pieces: 145,
      status: "Active (Vectorized)",
      date: "3 days ago",
    },
    {
      id: "2",
      title: "Standard Operating Procedures - Pricing",
      pieces: 42,
      status: "Active (Vectorized)",
      date: "1 week ago",
    },
    {
      id: "3",
      title: "FAQ - Logistics and Shipping",
      pieces: 18,
      status: "Active (Vectorized)",
      date: "2 weeks ago",
    },
  ];
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

  // Initial mock data
  const initial = [
    {
      id: "1",
      name: "Acme Corp",
      contact: "John Doe",
      stage: "Negotiation",
      score: 95,
      risk: 10,
      contacts: [{ id: "1", type: "Email", value: "john@acme.com" }],
      intent: "High",
    },
    {
      id: "2",
      name: "Global Tech",
      contact: "Jane Smith",
      stage: "Qualified",
      score: 78,
      risk: 25,
      contacts: [
        { id: "2", type: "Email", value: "jane@globaltech.com" },
        { id: "w1", type: "WhatsApp", value: "15550000001" },
      ],
      intent: "Medium",
    },
    {
      id: "3",
      name: "Synergy Ltd",
      contact: "Alice Brown",
      stage: "Lead",
      score: 45,
      risk: 5,
      contacts: [{ id: "3", type: "Email", value: "alice@synergy.com" }],
      intent: "Low",
    },
  ].map((c) => ({
    ...c,
    logs: [
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
    ] as CustomerLog[],
  }));
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

  const initial: Product[] = [
    {
      id: "prod_1",
      name: "Enterprise CRM License",
      description: "Annual license for CRM system.",
      sku: "CRM-ENT-1Y",
      price: 12000,
      currency: "USD",
      status: "Active",
    },
    {
      id: "prod_2",
      name: "AI Voice Agent Add-on",
      description: "10,000 minutes of AI voice agent calls per month.",
      sku: "AI-VOICE-10K",
      price: 2500,
      currency: "USD",
      status: "Active",
    },
    {
      id: "prod_3",
      name: "Consulting Session",
      description: "1 hour of technical consultation.",
      sku: "CONSULT-1H",
      price: 250,
      currency: "USD",
      status: "Active",
    },
  ];
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
  integrations?: string[];
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

  const initialRuns: AgentRun[] = [
    {
      id: "run_1",
      customerId: "1",
      agentId: "3",
      taskType: "Follow-up Email",
      status: "Pending",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ];
  saveAgentRuns(initialRuns);
  return initialRuns;
}

export function saveAgentRuns(runs: AgentRun[]) {
  localStorage.setItem("crm_agent_runs", JSON.stringify(runs));
}

export function getAgentSteps(): AgentStep[] {
  try {
    const data = localStorage.getItem("crm_agent_steps");
    if (data) return JSON.parse(data);
  } catch (e) {}

  const initialSteps: AgentStep[] = [
    {
      id: "s_1",
      runId: "run_1",
      stepType: "Tool",
      toolName: "get_customer_profile",
      status: "Success",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "s_2",
      runId: "run_1",
      stepType: "Tool",
      toolName: "draft_email",
      status: "Success",
      createdAt: new Date(Date.now() - 3590000).toISOString(),
    },
  ];
  saveAgentSteps(initialSteps);
  return initialSteps;
}

export function saveAgentSteps(steps: AgentStep[]) {
  localStorage.setItem("crm_agent_steps", JSON.stringify(steps));
}

export function getAgentApprovals(): AgentApproval[] {
  try {
    const data = localStorage.getItem("crm_agent_approvals");
    if (data) return JSON.parse(data);
  } catch (e) {}

  const initialApprovals: AgentApproval[] = [
    {
      id: "app_1",
      runId: "run_1",
      actionType: "send_email",
      proposedPayload: {
        to: "john@acme.com",
        subject: "Follow up on our discussion",
        body: "Hi John,\n\nJust checking in on the volume discounts we discussed. Let me know if you need any adjustments to the quote.",
      },
      status: "Pending",
      createdAt: new Date(Date.now() - 3590000).toISOString(),
    },
  ];
  saveAgentApprovals(initialApprovals);
  return initialApprovals;
}

export function saveAgentApprovals(approvals: AgentApproval[]) {
  localStorage.setItem("crm_agent_approvals", JSON.stringify(approvals));
}

export function getAgents(): Agent[] {
  try {
    const data = localStorage.getItem("crm_agents");
    if (data) {
      let parsed = JSON.parse(data);
      if (!parsed.find((a: any) => a.id === "5")) {
        parsed.push({
          id: "5",
          name: "Lead Generation Agent",
          role: "Navigates and scrapes leads autonomously.",
          status: "Active",
          tasks: 0,
          harness: "Human-in-the-loop",
          integrations: [
            "Outscraper",
            "Apify",
            "PhantomBuster",
            "Scrap.io",
            "HasData",
            "Decodo",
            "Clay.com",
          ],
        });
        saveAgents(parsed);
      }
      return parsed;
    }
  } catch (e) {}

  const initial: Agent[] = [
    {
      id: "1",
      name: "Lead Qualification Agent",
      role: "Qualifies inbound emails and determines lead score.",
      status: "Active",
      tasks: 145,
      harness: "Auto",
    },
    {
      id: "2",
      name: "SDR Agent",
      role: "Automates initial follow-ups and meeting scheduling.",
      status: "Active",
      tasks: 89,
      harness: "Human-in-the-loop",
    },
    {
      id: "3",
      name: "Manager Agent",
      role: "Routes tasks and flags high-risk conversations to humans.",
      status: "Active",
      tasks: 312,
      harness: "Auto",
    },
    {
      id: "4",
      name: "Proposal Agent",
      role: "Drafts quotes based on CRM price rules and inventory.",
      status: "Idle",
      tasks: 12,
      harness: "Human-in-the-loop",
    },
    {
      id: "5",
      name: "Lead Generation Agent",
      role: "Navigates and scrapes leads autonomously.",
      status: "Active",
      tasks: 0,
      harness: "Human-in-the-loop",
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
  saveAgents(initial);
  return initial;
}

export function saveAgents(agents: Agent[]) {
  localStorage.setItem("crm_agents", JSON.stringify(agents));
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
    if (data) return JSON.parse(data);
  } catch (e) {}

  const initial: MessagePreview[] = [
    {
      id: "msg_local_1",
      sender: "john@acme.com",
      target: "agent@example.com",
      intent: "Inquiry",
      subject: "Bulk Pricing Request",
      summary:
        "Customer asking for a 10k units volume discount and lead times.",
      channel: "Email",
      date: "10:30 AM",
      read: false,
      thread: [
        {
          id: "t1",
          sender: "user",
          content:
            "Hello, I am interested in ordering 10,000 units of the premium widgets. What is the best volume discount you can offer for this quantity? Also, let me know the estimated lead time to North America.",
          time: "10:30 AM",
        },
      ],
    },
    {
      id: "msg_local_2",
      sender: "15550000001",
      target: "15551234567",
      intent: "Support",
      subject: "MOQ clarification",
      summary:
        "Checking if they can order below MOQ for their first testing round.",
      channel: "WhatsApp",
      date: "Yesterday",
      read: true,
      thread: [
        {
          id: "t1",
          sender: "user",
          content:
            "Hi, I saw your MOQ is 500 units. Since this is our first time working together, is it possible to order 100 units just for quality testing?",
          time: "Yesterday 2:15 PM",
        },
        {
          id: "t2",
          sender: "agent",
          content:
            "Hi there! We strictly follow the MOQ of 500 units for standard pricing, but for a one-time paid sample order, we could do 100 units at a 20% premium. Would that work for you?",
          time: "Yesterday 2:40 PM",
        },
      ],
    },
  ];
  saveInboxMessages(initial);
  return initial;
}

export function saveInboxMessages(msgs: MessagePreview[]) {
  localStorage.setItem("crm_inbox", JSON.stringify(msgs));
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

export function markMessageRead(messageId: string) {
  const msgs = getInboxMessages();
  const m = msgs.find((x) => x.id === messageId);
  if (m) {
    m.read = true;
    saveInboxMessages(msgs);
  }
}
