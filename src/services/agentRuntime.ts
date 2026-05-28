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
    name: "Lead Scoring",
    description: "Score one public lead and mark its intent/risk profile.",
    operationType: "lead_scoring",
    targetType: "lead",
    requiredTools: ["lead_platforms", "customers"],
    repeatable: false,
  },
  {
    id: "lead_enrichment",
    name: "Lead Enrichment",
    description: "Enrich one public lead with structured CRM context.",
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

export function executeAgentWorkflow(
  workflow: AgentWorkflowDefinition,
  target: AgentWorkflowTarget,
  agent: Agent,
): AgentRuntimeResult {
  if (workflow.id === "lead_scoring") {
    const lead = leadById(target.id);
    if (!lead) throw new Error("Lead was not found.");
    const score = stableScore([lead.name, lead.contact, lead.industry, lead.location, lead.source]);
    const updatedLead: PublicLead = {
      ...lead,
      score,
      intent: scoreToIntent(score),
      risk: scoreToRisk(score),
      scoredAt: new Date().toISOString(),
    };
    saveLeadUpdate(updatedLead);
    return {
      logs: [
        `Loaded lead ${lead.name} from ${lead.source}.`,
        `Calculated priority score ${score} from source, contact, industry, and location signals.`,
        `Updated lead intent to ${updatedLead.intent} and risk to ${updatedLead.risk}.`,
        "Saved scoring result to the public lead pool.",
      ],
      steps: [
        { toolName: "lead.read", label: "Read lead", inputJson: { leadId: lead.id }, outputJson: lead, status: "Success" },
        { toolName: "lead.score", label: "Score lead", inputJson: { leadId: lead.id }, outputJson: { score, intent: updatedLead.intent, risk: updatedLead.risk }, status: "Success" },
        { toolName: "lead.update", label: "Update lead", inputJson: { leadId: lead.id }, outputJson: updatedLead, status: "Success" },
      ],
      outputJson: { leadId: lead.id, score, intent: updatedLead.intent, risk: updatedLead.risk, agentId: agent.id },
    };
  }

  if (workflow.id === "lead_enrichment") {
    const lead = leadById(target.id);
    if (!lead) throw new Error("Lead was not found.");
    const existingContacts = lead.contacts || [];
    const updatedLead: PublicLead = {
      ...lead,
      contacts: existingContacts.length > 0 ? existingContacts : [{ id: `contact_${Date.now()}`, type: "primary", value: lead.contact }],
      description: lead.description || `Enriched lead from ${lead.source}${lead.industry ? ` in ${lead.industry}` : ""}.`,
      enrichedAt: new Date().toISOString(),
    };
    saveLeadUpdate(updatedLead);
    return {
      logs: [
        `Loaded lead ${lead.name}.`,
        "Normalized primary contact into structured contact records.",
        "Added enrichment summary and timestamp.",
        "Saved enriched lead details to the public lead pool.",
      ],
      steps: [
        { toolName: "lead.read", label: "Read lead", inputJson: { leadId: lead.id }, outputJson: lead, status: "Success" },
        { toolName: "lead.enrich", label: "Enrich lead", inputJson: { leadId: lead.id }, outputJson: updatedLead, status: "Success" },
        { toolName: "lead.update", label: "Update lead", inputJson: { leadId: lead.id }, outputJson: updatedLead, status: "Success" },
      ],
      outputJson: { leadId: lead.id, contacts: updatedLead.contacts?.length || 0, enrichedAt: updatedLead.enrichedAt },
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
