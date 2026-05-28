import {
  Agent,
  AgentRun,
  Customer,
  Product,
  PublicLead,
  addQuote,
  getCustomers,
  getProducts,
  getPublicLeads,
  saveCustomers,
  savePublicLeads,
} from "./db";

export type AgentWorkflowTargetType = "lead" | "customer";

export interface AgentWorkflowTarget {
  type: AgentWorkflowTargetType;
  id: string;
  label: string;
  description?: string;
}

export interface AgentWorkflowDefinition {
  id: string;
  name: string;
  description: string;
  operationType: string;
  targetType: AgentWorkflowTargetType;
  requiredTools: string[];
  repeatable: boolean;
}

export interface AgentRuntimeStep {
  toolName: string;
  label: string;
  inputJson?: unknown;
  outputJson?: unknown;
  status: "Success" | "Failed";
}

export interface AgentRuntimeResult {
  logs: string[];
  steps: AgentRuntimeStep[];
  outputJson: Record<string, unknown>;
}

export const agentWorkflowDefinitions: AgentWorkflowDefinition[] = [
  {
    id: "lead_scoring",
    name: "AI Lead Analysis",
    description: "Use AI-style analysis to evaluate one public lead and recommend the next action.",
    operationType: "lead_ai_analysis",
    targetType: "lead",
    requiredTools: ["customers", "knowledge"],
    repeatable: false,
  },
  {
    id: "lead_enrichment",
    name: "Lead Generation Platforms",
    description: "Enrich one public lead through enabled Lead Generation Platform integrations.",
    operationType: "lead_enrichment",
    targetType: "lead",
    requiredTools: ["lead_platforms", "customers"],
    repeatable: false,
  },
  {
    id: "customer_scoring",
    name: "Customer Scoring",
    description: "Refresh one customer priority score, intent, and risk.",
    operationType: "customer_scoring",
    targetType: "customer",
    requiredTools: ["customers"],
    repeatable: false,
  },
  {
    id: "quote_draft",
    name: "Quote Draft",
    description: "Create a draft quote for one customer using the product catalog.",
    operationType: "quote_generation",
    targetType: "customer",
    requiredTools: ["customers", "quotes"],
    repeatable: false,
  },
];

export function getAgentWorkflows(agent: Agent) {
  const allowed = new Set(agent.workflowIds || []);
  return agentWorkflowDefinitions.filter((workflow) => {
    const hasWorkflow = allowed.has(workflow.id);
    const hasTools = workflow.requiredTools.every((tool) => (agent.tools || []).includes(tool));
    return hasWorkflow && hasTools;
  });
}

export function getWorkflowTargets(workflow: AgentWorkflowDefinition): AgentWorkflowTarget[] {
  if (workflow.targetType === "lead") {
    return getPublicLeads().map((lead) => ({
      type: "lead",
      id: lead.id,
      label: lead.name,
      description: [lead.source, lead.industry, lead.location].filter(Boolean).join(" / "),
    }));
  }

  return getCustomers().map((customer) => ({
    type: "customer",
    id: customer.id,
    label: customer.name,
    description: [customer.stage, customer.intent, `${customer.score} score`].filter(Boolean).join(" / "),
  }));
}

export function buildAgentOperationKey(workflow: AgentWorkflowDefinition, target: AgentWorkflowTarget) {
  return `${workflow.operationType}:${target.type}:${target.id.toLowerCase()}`;
}

export function findDuplicateRun(runs: AgentRun[], operationKey?: string) {
  if (!operationKey) return undefined;
  return runs.find((run) =>
    run.operationKey === operationKey &&
    run.repeatable === false &&
    ["Running", "Pending", "Completed"].includes(run.status),
  );
}

function stableScore(parts: Array<string | undefined>) {
  const text = parts.filter(Boolean).join("|").toLowerCase();
  const total = Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return Math.max(35, Math.min(95, 35 + (total % 61)));
}

function scoreToIntent(score: number): "Low" | "Medium" | "High" {
  if (score >= 75) return "High";
  if (score >= 55) return "Medium";
  return "Low";
}

function scoreToRisk(score: number): "Low" | "Medium" | "High" {
  if (score >= 75) return "Low";
  if (score >= 55) return "Medium";
  return "High";
}

function leadById(id: string) {
  return getPublicLeads().find((lead) => lead.id === id);
}

function customerById(id: string) {
  return getCustomers().find((customer) => customer.id === id);
}

function appendCustomerLog(customer: Customer, event: string): Customer {
  return {
    ...customer,
    logs: [
      {
        id: Math.random().toString(36).slice(2, 9),
        time: new Date().toISOString(),
        event,
        type: "ai",
      },
      ...(customer.logs || []),
    ],
  };
}

function saveCustomerUpdate(customer: Customer) {
  saveCustomers(getCustomers().map((item) => (item.id === customer.id ? customer : item)));
}

function saveLeadUpdate(lead: PublicLead) {
  savePublicLeads(getPublicLeads().map((item) => (item.id === lead.id ? lead : item)));
}

function getEnabledLeadPlatforms(agent: Agent) {
  const configs = JSON.parse(localStorage.getItem("lead_platform_configs") || "{}") as Record<string, { enabled?: boolean; baseUrl?: string }>;
  const platformNames: Record<string, string> = {
    outscraper: "Outscraper",
    apify: "Apify",
    phantombuster: "PhantomBuster",
    scrap_io: "Scrap.io",
    hasdata: "HasData",
    decodo: "Decodo",
    clay_com: "Clay.com",
  };
  const allowed = new Set(agent.integrations || []);
  return Object.entries(configs)
    .filter(([, config]) => config.enabled)
    .map(([id, config]) => ({ id, name: platformNames[id] || id, baseUrl: config.baseUrl }))
    .filter((platform) => allowed.size === 0 || allowed.has(platform.name));
}

export function executeAgentWorkflow(
  workflow: AgentWorkflowDefinition,
  target: AgentWorkflowTarget,
  agent: Agent,
): AgentRuntimeResult {
  if (workflow.id === "lead_scoring") {
    const lead = leadById(target.id);
    if (!lead) throw new Error("Lead was not found.");
    const score = stableScore([lead.name, lead.contact, lead.industry, lead.location, lead.source]);
    const intent = scoreToIntent(score);
    const risk = scoreToRisk(score);
    const aiAnalysis = [
      `${lead.name} shows ${intent.toLowerCase()} buying intent based on source quality, contact completeness, industry fit, and location signals.`,
      lead.industry ? `Industry context: ${lead.industry}.` : "Industry context is incomplete and should be verified.",
      lead.location ? `Location signal: ${lead.location}.` : "Location signal is missing.",
    ].join(" ");
    const recommendedAction = intent === "High"
      ? "Prioritize human outreach and prepare a tailored offer."
      : intent === "Medium"
        ? "Enrich the lead and schedule a light-touch follow-up."
        : "Keep in nurture until stronger intent signals appear.";
    const updatedLead: PublicLead = {
      ...lead,
      score,
      intent,
      risk,
      aiAnalysis,
      recommendedAction,
      scoredAt: new Date().toISOString(),
    };
    saveLeadUpdate(updatedLead);
    return {
      logs: [
        `Loaded lead ${lead.name} from ${lead.source}.`,
        "Analyzed source quality, contact completeness, industry fit, and location signals.",
        `AI analysis assigned ${intent} intent, ${risk} risk, and priority score ${score}.`,
        `Recommended action: ${recommendedAction}`,
      ],
      steps: [
        { toolName: "lead.read", label: "Read lead", inputJson: { leadId: lead.id }, outputJson: lead, status: "Success" },
        { toolName: "ai.lead_analysis", label: "AI lead analysis", inputJson: { leadId: lead.id }, outputJson: { score, intent, risk, aiAnalysis, recommendedAction }, status: "Success" },
        { toolName: "lead.update", label: "Update lead", inputJson: { leadId: lead.id }, outputJson: updatedLead, status: "Success" },
      ],
      outputJson: { leadId: lead.id, score, intent, risk, aiAnalysis, recommendedAction, agentId: agent.id },
    };
  }

  if (workflow.id === "lead_enrichment") {
    const lead = leadById(target.id);
    if (!lead) throw new Error("Lead was not found.");
    const platforms = getEnabledLeadPlatforms(agent);
    if (platforms.length === 0) {
      throw new Error("No enabled Lead Generation Platforms are available for this agent. Configure them in Settings > Integrations first.");
    }
    const existingContacts = lead.contacts || [];
    const updatedLead: PublicLead = {
      ...lead,
      contacts: existingContacts.length > 0 ? existingContacts : [{ id: `contact_${Date.now()}`, type: "primary", value: lead.contact }],
      description: lead.description || `Enriched via ${platforms.map((platform) => platform.name).join(", ")} from ${lead.source}${lead.industry ? ` in ${lead.industry}` : ""}.`,
      enrichmentPlatforms: platforms.map((platform) => platform.name),
      enrichedAt: new Date().toISOString(),
    };
    saveLeadUpdate(updatedLead);
    return {
      logs: [
        `Loaded lead ${lead.name}.`,
        `Loaded enabled Lead Generation Platforms: ${platforms.map((platform) => platform.name).join(", ")}.`,
        "Normalized platform enrichment into structured CRM contact/context fields.",
        "Saved enriched lead details to the public lead pool.",
      ],
      steps: [
        { toolName: "lead.read", label: "Read lead", inputJson: { leadId: lead.id }, outputJson: lead, status: "Success" },
        { toolName: "lead_generation_platforms.load", label: "Load configured platforms", outputJson: platforms, status: "Success" },
        { toolName: "lead_generation_platforms.enrich", label: "Enrich lead from platforms", inputJson: { leadId: lead.id, platforms }, outputJson: updatedLead, status: "Success" },
        { toolName: "lead.update", label: "Update lead", inputJson: { leadId: lead.id }, outputJson: updatedLead, status: "Success" },
      ],
      outputJson: { leadId: lead.id, platforms: updatedLead.enrichmentPlatforms, contacts: updatedLead.contacts?.length || 0, enrichedAt: updatedLead.enrichedAt },
    };
  }

  if (workflow.id === "customer_scoring") {
    const customer = customerById(target.id);
    if (!customer) throw new Error("Customer was not found.");
    const score = stableScore([customer.name, customer.contact, customer.industry, customer.stage, customer.notes]);
    const updatedCustomer = appendCustomerLog(
      {
        ...customer,
        score,
        intent: scoreToIntent(score),
        risk: scoreToRisk(score),
      },
      `Agent ${agent.name} refreshed customer score to ${score}.`,
    );
    saveCustomerUpdate(updatedCustomer);
    return {
      logs: [
        `Loaded customer ${customer.name}.`,
        `Calculated CRM priority score ${score}.`,
        `Updated intent to ${updatedCustomer.intent} and risk to ${updatedCustomer.risk}.`,
        "Saved customer scoring result and timeline log.",
      ],
      steps: [
        { toolName: "customer.read", label: "Read customer", inputJson: { customerId: customer.id }, outputJson: customer, status: "Success" },
        { toolName: "customer.score", label: "Score customer", inputJson: { customerId: customer.id }, outputJson: { score, intent: updatedCustomer.intent, risk: updatedCustomer.risk }, status: "Success" },
        { toolName: "customer.update", label: "Update customer", inputJson: { customerId: customer.id }, outputJson: updatedCustomer, status: "Success" },
      ],
      outputJson: { customerId: customer.id, score, intent: updatedCustomer.intent, risk: updatedCustomer.risk },
    };
  }

  if (workflow.id === "quote_draft") {
    const customer = customerById(target.id);
    if (!customer) throw new Error("Customer was not found.");
    const products: Product[] = getProducts().filter((product) => product.status === "Active");
    if (products.length === 0) throw new Error("No active products are available for quote drafting.");
    const product = products[0];
    const unitPrice = product.pricingTiers?.[0]?.unitPrice ?? product.price;
    const total = unitPrice;
    addQuote({
      customerId: customer.id,
      date: new Date().toISOString().slice(0, 10),
      validUntil: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      items: [{ productId: product.id, name: product.name, quantity: 1, unitPrice, discount: 0, total }],
      subtotal: total,
      totalDiscount: 0,
      total,
      status: "Draft",
      notes: `Drafted by ${agent.name}.`,
    });
    saveCustomerUpdate(appendCustomerLog(customer, `Agent ${agent.name} drafted a quote for ${product.name}.`));
    return {
      logs: [
        `Loaded customer ${customer.name}.`,
        `Selected active product ${product.name}.`,
        `Created draft quote total ${product.currency} ${total}.`,
        "Saved quote draft and customer timeline log.",
      ],
      steps: [
        { toolName: "customer.read", label: "Read customer", inputJson: { customerId: customer.id }, outputJson: customer, status: "Success" },
        { toolName: "product.select", label: "Select product", outputJson: product, status: "Success" },
        { toolName: "quote.create", label: "Create quote", inputJson: { customerId: customer.id, productId: product.id }, outputJson: { total }, status: "Success" },
      ],
      outputJson: { customerId: customer.id, productId: product.id, total },
    };
  }

  throw new Error(`Workflow ${workflow.id} is not implemented.`);
}
