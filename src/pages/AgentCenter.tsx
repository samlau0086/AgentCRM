import React, { useState, useEffect } from "react";
import {
  Settings,
  Play,
  Database,
  Network,
  Server,
  PlayCircle,
  Clock,
  Plus,
  X,
  Power,
  Save,
  Loader2,
  PlaySquare,
  Bot,
  ShieldCheck,
  Zap,
  CheckCircle2,
  XCircle,
  ListTodo,
  Trash2
} from "lucide-react";
import { useLanguage } from "../i18n";
import { cn } from "../Layout";
import { getAgents, addAgent, updateAgent, deleteAgent, Agent, getAgentRuns, getAgentSteps, getAgentApprovals, AgentRun, AgentStep, AgentApproval, ModelProfile, getModelProfiles, saveAgentApprovals, saveAgentRuns, saveAgentSteps, addAgentRun, addAgentStep, addAgentApproval } from "../services/db";
import { notify } from "../services/notifications";
import ConfirmModal from "../components/ConfirmModal";

export default function AgentCenter() {
  const { t, language } = useLanguage();
  const availableTools = [
    { id: "customers", zh: "客户资料", en: "Customer Records" },
    { id: "inbox", zh: "统一收件箱", en: "Unified Inbox" },
    { id: "email_send", zh: "发送邮件", en: "Send Email" },
    { id: "whatsapp_send", zh: "发送 WhatsApp", en: "Send WhatsApp" },
    { id: "quotes", zh: "产品与报价", en: "Products & Quotes" },
    { id: "knowledge", zh: "知识库检索", en: "Knowledge Search" },
    { id: "lead_platforms", zh: "获客平台", en: "Lead Platforms" },
    { id: "media", zh: "媒体素材库", en: "Media Library" },
    { id: "approvals", zh: "人工审批", en: "Human Approvals" },
  ];
  const leadPlatformOptions = [
    { id: "Outscraper", name: "Outscraper" },
    { id: "Apify", name: "Apify" },
    { id: "PhantomBuster", name: "PhantomBuster" },
    { id: "Scrap.io", name: "Scrap.io" },
    { id: "HasData", name: "HasData" },
    { id: "Decodo", name: "Decodo" },
    { id: "Clay.com", name: "Clay.com" },
  ];
  const copy = language === "zh" ? {
    subtitle: "监控智能体工作负载，并管理自动化执行与人工审批。",
    harnessTab: "执行护栏与审批",
    agentsTab: "智能体列表",
    createAgent: "创建智能体",
    modelProfileRequiredTitle: "需要模型配置",
    modelProfileRequired: "请先在设置里创建模型 Profile，然后再运行智能体。",
    initLog: "正在连接智能体工作流引擎...",
    contextLog: "正在加载 CRM 上下文...",
    testComplete: "测试运行已成功完成。",
    unknownError: "未知的智能体执行错误。",
    approvalTitle: "人工审批",
    requiresApproval: "需要审批",
    agentFallback: "智能体",
    action: "动作",
    to: "收件人",
    subject: "主题",
    reject: "拒绝",
    approveExecute: "批准并执行",
    allClear: "暂无待审批项",
    noApprovals: "当前没有需要人工审批的智能体动作。",
    runsTitle: "智能体运行与追踪日志",
    executionLog: "智能体执行日志",
    processing: "正在处理 AI 任务...",
    configureAgent: "配置智能体",
    agentName: "智能体名称",
    agentNamePlaceholder: "例如：异议处理智能体",
    prompt: "提示词 / 执行指令",
    promptPlaceholder: "描述这个智能体应该做什么...",
    harness: "执行护栏",
    autoExecute: "自动执行（无需审批）",
    humanLoop: "人工确认（需要审批）",
    harnessHelp: "决定该智能体是否可以直接执行动作，或是否必须先提交草稿等待审批。",
    modelProfile: "模型 Profile",
    modelProfileHelp: "先在设置里配置模型 Profile，然后在这里分配给智能体。",
    tools: "可用工具",
    toolsHelp: "只允许该智能体使用已勾选的业务工具。",
    supportedIntegrations: "支持的集成（获客线索采集）",
    integrationsHelp: "选择该智能体允许使用的获客平台。平台 API Key 仍在设置的系统集成里配置。",
    agentStatus: "智能体状态",
    currently: "当前状态：",
    disableAgent: "停用智能体",
    activateAgent: "启用智能体",
    cancel: "取消",
    saveChanges: "保存更改",
    deleteAgent: "删除智能体",
    deleteAgentTitle: "删除智能体",
    deleteAgentMessage: "确定要删除这个智能体吗？相关历史运行记录会保留，但该智能体不会再显示在列表中。",
    deleteConfirm: "删除",
    deleteRun: "删除日志",
    deleteRunTitle: "删除运行日志",
    deleteRunMessage: "确定要删除这条智能体运行日志吗？关联的追踪步骤和审批记录也会一起删除。",
    runDeleted: "运行日志已删除",
    active: "运行中",
    idle: "空闲",
    disabled: "已停用",
    running: "运行中",
    pending: "待处理",
    completed: "已完成",
    failed: "失败",
    success: "成功",
    analyzeContext: "分析上下文",
    executeStep: "执行步骤",
    triggerAgent: "触发智能体",
    reviewAgentTest: "审查智能体测试结果",
    auto: "自动执行",
    human: "人工确认",
    testTitle: "触发 / 测试工作流",
  } : {
    subtitle: "Monitor workloads and manage the intelligence layer.",
    harnessTab: "Harness & Approvals",
    agentsTab: "Agent Fleet",
    createAgent: "Create Agent",
    modelProfileRequiredTitle: "Model profile required",
    modelProfileRequired: "Please create a model profile in Settings before running agents.",
    initLog: "Initializing connection to agent workflow engine...",
    contextLog: "Loading CRM context...",
    testComplete: "Test run completed successfully.",
    unknownError: "Unknown agent execution error.",
    approvalTitle: "Human Approvals",
    requiresApproval: "Requires Approval",
    agentFallback: "Agent",
    action: "Action",
    to: "To",
    subject: "Subject",
    reject: "Reject",
    approveExecute: "Approve & Execute",
    allClear: "All Clear",
    noApprovals: "No pending approvals required.",
    runsTitle: "Agent Runs & Trace Log",
    executionLog: "Agent Execution Log",
    processing: "Processing AI tasks...",
    configureAgent: "Configure Agent",
    agentName: "Agent Name",
    agentNamePlaceholder: "e.g. Objections Handler Agent",
    prompt: "Prompt / Instructions",
    promptPlaceholder: "Describe what this agent does...",
    harness: "Harness / Guardrails",
    autoExecute: "Auto-execute (No approval needed)",
    humanLoop: "Human-in-the-loop (Requires approval)",
    harnessHelp: "Determines whether this agent can immediately send messages or if drafts must be approved.",
    modelProfile: "Model Profile",
    modelProfileHelp: "Configure profiles in Settings, then assign one to each agent here.",
    tools: "Available Tools",
    toolsHelp: "This agent can only use the business tools selected here.",
    supportedIntegrations: "Supported Integrations (Scraping Leads)",
    integrationsHelp: "Choose which lead-generation platforms this agent can use. Platform API keys are still configured in Settings integrations.",
    agentStatus: "Agent Status",
    currently: "Currently: ",
    disableAgent: "Disable Agent",
    activateAgent: "Activate Agent",
    cancel: "Cancel",
    saveChanges: "Save Changes",
    deleteAgent: "Delete Agent",
    deleteAgentTitle: "Delete Agent",
    deleteAgentMessage: "Are you sure you want to delete this agent? Existing run history will remain, but the agent will no longer appear in the list.",
    deleteConfirm: "Delete",
    deleteRun: "Delete Log",
    deleteRunTitle: "Delete Run Log",
    deleteRunMessage: "Delete this agent run log? Related trace steps and approval records will also be removed.",
    runDeleted: "Run log deleted",
    active: "Active",
    idle: "Idle",
    disabled: "Disabled",
    running: "Running",
    pending: "Pending",
    completed: "Completed",
    failed: "Failed",
    success: "Success",
    analyzeContext: "Analyze Context",
    executeStep: "Execute Step",
    triggerAgent: "Trigger Agent",
    reviewAgentTest: "Review Agent Test Result",
    auto: "Auto",
    human: "Human-in-the-loop",
    testTitle: "Trigger/Test workflow",
  };

  const agentText: Record<string, { zhName: string; zhRole: string }> = {
    orchestrator: {
      zhName: "编排调度智能体",
      zhRole: "将 CRM 工作分派给专用智能体，并汇总执行结果。",
    },
    sdr: {
      zhName: "销售开发智能体",
      zhRole: "研究潜在客户，识别高意向线索，并准备外联内容。",
    },
    support: {
      zhName: "客户支持智能体",
      zhRole: "基于 CRM 上下文起草回复，并协助解决客户问题。",
    },
    lead_generation: {
      zhName: "获客线索智能体",
      zhRole: "使用已配置的获客平台发现、丰富并整理新潜在客户。",
    },
  };

  const agentName = (agent?: Agent) =>
    language === "zh" && agent ? agentText[agent.id]?.zhName || agent.name : agent?.name || copy.agentFallback;
  const agentRole = (agent: Agent) =>
    language === "zh" ? agentText[agent.id]?.zhRole || agent.role : agent.role;
  const statusLabel = (status: string) =>
    status === "Active" ? copy.active :
    status === "Idle" ? copy.idle :
    status === "Disabled" ? copy.disabled :
    status === "Running" ? copy.running :
    status === "Pending" ? copy.pending :
    status === "Completed" ? copy.completed :
    status === "Failed" ? copy.failed :
    status === "Success" ? copy.success :
    status;
  const harnessLabel = (harness: string) =>
    harness === "Auto" ? copy.auto : harness === "Human-in-the-loop" ? copy.human : harness;
  const actionLabel = (action: string) =>
    action === "review_agent_test_result" ? copy.reviewAgentTest :
    action === "send_email" ? (language === "zh" ? "发送邮件" : "Send Email") :
    action;
  const toolLabel = (tool?: string) =>
    tool === "analyze_context" ? copy.analyzeContext :
    tool === "execute_step" ? copy.executeStep :
    tool === "trigger_agent" ? copy.triggerAgent :
    tool || "";
  const businessToolLabel = (toolId: string) =>
    availableTools.find((tool) => tool.id === toolId)?.[language === "zh" ? "zh" : "en"] || toolId;
  const runTaskLabel = (taskType: string) =>
    language === "zh" ? taskType.replace(/^Test:\s*/, "测试：") : taskType;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'agents' | 'harness'>('harness');

  useEffect(() => {
    setAgents(getAgents());
    setRuns(getAgentRuns());
    setSteps(getAgentSteps());
    setApprovals(getAgentApprovals());
    setModelProfiles(getModelProfiles());
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [showTestModal, setShowTestModal] = useState(false);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setIsModalOpen(true);
  };

  const handleTestAgent = async (agentId: string, wfName: string) => {
    let runFailed = false;
    let runErrorMessage: string | undefined;
    let runOutput: any;
    const agent = agents.find((a) => a.id === agentId);
    const modelProfile = modelProfiles.find((profile) => profile.id === agent?.modelProfileId) || modelProfiles[0];
    if (!modelProfile) {
      notify(copy.modelProfileRequired, "warning", copy.modelProfileRequiredTitle);
      return;
    }
    const run = addAgentRun({
      agentId,
      taskType: language === "zh" ? `测试：${agentName(agent)}` : `Test: ${wfName}`,
      status: "Running",
      currentStep: "Initializing",
      inputJson: { workflowName: wfName, language, modelProfileId: modelProfile.id, tools: agent?.tools || [] },
    });
    setRuns(getAgentRuns());
    setShowTestModal(true);
    setIsTestRunning(true);
    setTestLogs([
      copy.initLog,
      copy.contextLog,
    ]);
    try {
      const res = await fetch("/api/ai/trigger-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          agentRole: agent?.role,
          allowedTools: agent?.tools || [],
          context: `Workflow Name: ${wfName}. The user requested an execution test using the currently configured CRM and integration data.`,
          systemLanguage: language,
          modelProfile,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Agent workflow request failed with HTTP ${res.status}.`);
      }
      if (Array.isArray(data.logs) && data.logs.length > 0) {
        data.logs.forEach((log: string, index: number) => {
          addAgentStep({
            runId: run.id,
            stepType: index === 0 ? "Thought" : "Tool",
            toolName: index === 0 ? "analyze_context" : "execute_step",
            inputJson: { context: wfName },
            outputJson: { log },
            status: "Success",
          });
        });
        runOutput = { logs: data.logs, model: data.model, provider: data.provider, modelProfileId: modelProfile.id, tools: agent?.tools || [] };
        if (agent?.harness === "Human-in-the-loop") {
          addAgentApproval({
            runId: run.id,
            actionType: "review_agent_test_result",
            proposedPayload: {
              agentId,
              workflowName: wfName,
              logs: data.logs,
            },
            status: "Pending",
          });
        }
        setTestLogs((prev) => [
          ...prev,
          ...data.logs,
          copy.testComplete,
        ]);
      } else {
        throw new Error(data.error || "Agent engine returned no execution logs.");
      }
    } catch (err) {
      runFailed = true;
      const message = err instanceof Error ? err.message : copy.unknownError;
      runErrorMessage = message;
      addAgentStep({
        runId: run.id,
        stepType: "Tool",
        toolName: "trigger_agent",
        outputJson: { error: message },
        status: "Failed",
      });
      setTestLogs((prev) => [...prev, message]);
    } finally {
      const updatedRuns = getAgentRuns().map((item) =>
        item.id === run.id
          ? {
              ...item,
              status: runFailed ? ("Failed" as const) : ("Completed" as const),
              currentStep: runFailed ? "Failed" : "Completed",
              outputJson: runOutput,
              errorMessage: runErrorMessage,
            }
          : item,
      );
      saveAgentRuns(updatedRuns);
      setRuns(updatedRuns);
      setSteps(getAgentSteps());
      setApprovals(getAgentApprovals());
      setIsTestRunning(false);
    }
  };

  const handleAdd = () => {
    setEditingAgent(null);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);
    const modelProfileId = (data.modelProfileId as string) || modelProfiles[0]?.id || "default_google";
    const selectedTools = formData.getAll("tools").map(String);
    const selectedIntegrations = formData.getAll("integrations").map(String);

    if (editingAgent) {
      updateAgent(editingAgent.id, { ...(Object.fromEntries(formData) as any), modelProfileId, tools: selectedTools, integrations: selectedIntegrations });
    } else {
      addAgent({
        name: data.name as string,
        role: data.role as string,
        status: "Idle",
        harness: data.harness as "Auto" | "Human-in-the-loop",
        modelProfileId,
        tools: selectedTools,
        integrations: selectedIntegrations,
      });
    }
    setAgents(getAgents());
    setIsModalOpen(false);
  };

  const toggleStatus = (id: string, currentStatus: string) => {
    let newStatus = "Active";
    if (currentStatus === "Active") newStatus = "Disabled";
    if (currentStatus === "Disabled") newStatus = "Idle";

    updateAgent(id, { status: newStatus as any });
    setAgents(getAgents());
    if (editingAgent && editingAgent.id === id) {
      setEditingAgent({ ...editingAgent, status: newStatus as any });
    }
  };

  const confirmDeleteAgent = () => {
    if (!deletingAgentId) return;
    deleteAgent(deletingAgentId);
    setAgents(getAgents());
    if (editingAgent?.id === deletingAgentId) {
      setEditingAgent(null);
      setIsModalOpen(false);
    }
    setDeletingAgentId(null);
  };

  const confirmDeleteRun = () => {
    if (!deletingRunId) return;
    const updatedRuns = getAgentRuns().filter((run) => run.id !== deletingRunId);
    const updatedSteps = getAgentSteps().filter((step) => step.runId !== deletingRunId);
    const updatedApprovals = getAgentApprovals().filter((approval) => approval.runId !== deletingRunId);

    saveAgentRuns(updatedRuns);
    saveAgentSteps(updatedSteps);
    saveAgentApprovals(updatedApprovals);
    setRuns(updatedRuns);
    setSteps(updatedSteps);
    setApprovals(updatedApprovals);
    setDeletingRunId(null);
    notify(copy.runDeleted, "success");
  };

  const updateApprovalStatus = (id: string, status: "Approved" | "Rejected") => {
    const updatedApprovals = getAgentApprovals().map((approval) =>
      approval.id === id
        ? {
            ...approval,
            status,
            approvedAt: new Date().toISOString(),
            approvedBy: "Current User",
          }
        : approval,
    );
    saveAgentApprovals(updatedApprovals);
    setApprovals(updatedApprovals);
  };

  const pendingApprovals = approvals.filter((approval) => approval.status === "Pending");

  return (
    <div className="p-4 md:p-8 h-full flex flex-col w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
            {t("ac.title")}
          </h1>
          <p className="text-slate-500 mt-1 text-sm font-light">
            {copy.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-lg flex items-center gap-1 border border-slate-200 dark:border-white/10 shadow-inner">
            <button
              onClick={() => setActiveTab('harness')}
              className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2", activeTab === 'harness' ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300")}
            >
              <Network className="w-4 h-4" /> {copy.harnessTab}
            </button>
            <button
              onClick={() => setActiveTab('agents')}
              className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2", activeTab === 'agents' ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300")}
            >
              <Server className="w-4 h-4" /> {copy.agentsTab}
            </button>
          </div>
          <button
            onClick={handleAdd}
            className="bg-blue-600 hover:bg-blue-500 text-white shadow-sm px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-medium transition-colors border border-transparent"
          >
            <Plus className="w-4 h-4" />
            {copy.createAgent}
          </button>
        </div>
      </div>

      {activeTab === 'agents' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Agent Fleet */}
          <div className="bg-white dark:bg-white/5 shadow-sm border border-slate-200 dark:border-white/10 rounded-2xl p-6">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-400" />
              {t("ac.fleet")}
            </h2>
            <div className="space-y-4">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-white/5 hover:border-blue-500/30 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all bg-white dark:bg-white/[0.02] shadow-sm dark:shadow-none group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                      {agentName(agent)}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleStatus(agent.id, agent.status)}
                        className={cn(
                          "flex items-center gap-1.5 text-[10px] font-mono tracking-widest uppercase px-2 py-1 rounded border transition-colors cursor-pointer",
                          agent.status === "Active"
                            ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                            : agent.status === "Idle"
                              ? "text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                              : "text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:bg-slate-200",
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            agent.status === "Active"
                              ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                              : agent.status === "Idle"
                                ? "bg-amber-500"
                                : "bg-slate-400",
                          )}
                        ></span>
                        {statusLabel(agent.status)}
                      </button>
                      <button
                        onClick={() => handleEdit(agent)}
                        className="p-1 text-slate-400 hover:text-blue-600 bg-transparent rounded transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingAgentId(agent.id)}
                        className="p-1 text-slate-400 hover:text-red-500 bg-transparent rounded transition-colors opacity-0 group-hover:opacity-100"
                        title={copy.deleteAgent}
                        aria-label={copy.deleteAgent}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-4 line-clamp-2 min-h-[32px]">
                    {agentRole(agent)}
                  </p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-[10px] font-mono tracking-widest uppercase text-slate-500 bg-slate-100 dark:bg-black/20 px-2 py-1 rounded-md border border-slate-200 dark:border-white/5 flex items-center gap-1" title={copy.harness}>
                      {agent.harness === "Auto" ? (
                        <Zap className="w-3 h-3 text-amber-500" />
                      ) : (
                        <ShieldCheck className="w-3 h-3 text-blue-500" />
                      )}
                      {harnessLabel(agent.harness)}
                    </span>
                    <span className="text-[10px] font-mono tracking-widest uppercase text-slate-500 bg-slate-100 dark:bg-black/20 px-2 py-1 rounded-md border border-slate-200 dark:border-white/5">
                      {t("ac.tasksProcessed")}{" "}
                      <span className="text-slate-700 dark:text-slate-300 font-semibold">
                        {agent.tasks}
                      </span>
                    </span>
                    <button
                      onClick={() => handleTestAgent(agent.id, agent.name)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-colors"
                      title={copy.testTitle}
                    >
                      <PlayCircle className="w-4 h-4" />
                    </button>
                  </div>
                  {agent.integrations && agent.integrations.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                      <div className="flex flex-wrap gap-1.5">
                        {agent.integrations.map(integration => (
                          <span key={integration} className="px-2 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 rounded">
                            {integration}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {agent.tools && agent.tools.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {agent.tools.slice(0, 4).map((tool) => (
                        <span key={tool} className="px-2 py-0.5 text-[10px] bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 rounded">
                          {businessToolLabel(tool)}
                        </span>
                      ))}
                      {agent.tools.length > 4 && (
                        <span className="px-2 py-0.5 text-[10px] text-slate-400">
                          +{agent.tools.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'harness' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-white/5 shadow-sm border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              {copy.approvalTitle}
            </h2>
            <div className="flex-1 overflow-y-auto space-y-4">
              {pendingApprovals.map(approval => {
                const runInfo = runs.find(r => r.id === approval.runId);
                const agentInfo = agents.find(a => a.id === runInfo?.agentId);
                return (
                  <div key={approval.id} className="p-4 border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 rounded text-[10px] uppercase font-bold tracking-wider">
                            {copy.requiresApproval}
                          </span>
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Bot className="w-3 h-3" /> {agentName(agentInfo)}
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-2">
                          {copy.action}: {actionLabel(approval.actionType)}
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 max-w-[80px] text-right break-words">{approval.createdAt}</span>
                    </div>
                    {approval.actionType === 'send_email' && (
                      <div className="bg-white dark:bg-black/20 p-3 rounded-lg border border-slate-100 dark:border-white/5 shadow-sm text-sm mb-4">
                        <div className="mb-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{copy.to}:</span> {approval.proposedPayload.to}<br/>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{copy.subject}:</span> {approval.proposedPayload.subject}
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-serif">
                          {approval.proposedPayload.body}
                        </p>
                      </div>
                    )}
                    <div className="flex justify-end gap-3 mt-4">
                      <button 
                        onClick={() => {
                           updateApprovalStatus(approval.id, "Rejected");
                        }}
                        className="px-4 py-2 text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent transition-colors rounded-lg">
                        <XCircle className="w-4 h-4" /> {copy.reject}
                      </button>
                      <button 
                        onClick={() => {
                           updateApprovalStatus(approval.id, "Approved");
                        }}
                        className="px-5 py-2 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors border border-transparent">
                        <CheckCircle2 className="w-4 h-4" /> {copy.approveExecute}
                      </button>
                    </div>
                  </div>
                );
              })}
              {pendingApprovals.length === 0 && (
                <div className="text-center py-12">
                  <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">{copy.allClear}</h3>
                  <p className="text-sm text-slate-500">{copy.noApprovals}</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-white dark:bg-white/5 shadow-sm border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-slate-400" />
              {copy.runsTitle}
            </h2>
            <div className="flex-1 overflow-y-auto space-y-4">
              {runs.map(run => {
                const agentInfo = agents.find(a => a.id === run.agentId);
                const runSteps = steps.filter(s => s.runId === run.id);
                return (
                  <div key={run.id} className="p-4 border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 rounded-xl">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={cn("flex w-2.5 h-2.5 rounded-full shrink-0", run.status === 'Running' ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" : run.status === 'Pending' ? "bg-amber-500" : run.status === 'Failed' ? "bg-red-500" : "bg-emerald-500")} />
                        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate">{runTaskLabel(run.taskType)}</h3>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-500">{statusLabel(run.status)}</span>
                        <button
                          type="button"
                          onClick={() => setDeletingRunId(run.id)}
                          title={copy.deleteRun}
                          aria-label={copy.deleteRun}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mb-4 flex items-center gap-2">
                      <Bot className="w-3 h-3" /> {agentName(agentInfo)}
                    </div>
                    <div className="space-y-2">
                      {runSteps.map((step, idx) => (
                        <div key={step.id} className="flex gap-3 text-xs">
                          <span className="text-slate-400 font-mono w-4 shrink-0 mt-0.5">{idx + 1}.</span>
                          <div className="flex-1">
                            <span className="text-blue-600 dark:text-blue-400 font-mono bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded mr-2">{toolLabel(step.toolName) || step.stepType}</span>
                            <span className="text-slate-600 dark:text-slate-400">{statusLabel(step.status)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}


      {/* Test Workflow Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-white/10 flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20">
              <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <Bot className="w-4 h-4 text-blue-500" />
                {copy.executionLog}
              </h2>
              <button
                onClick={() => setShowTestModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-900 border-t border-slate-800 text-emerald-400 font-mono text-xs overflow-y-auto min-h-[200px] max-h-[300px] flex flex-col gap-2 relative">
              {testLogs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="opacity-50 select-none">&gt;</span>
                  <span>{log}</span>
                </div>
              ))}
              {isTestRunning && (
                <div className="mt-2 flex items-center gap-2 text-blue-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> {copy.processing}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-white/10 flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                {editingAgent ? copy.configureAgent : copy.createAgent}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {copy.agentName}
                </label>
                <input
                  required
                  name="name"
                  defaultValue={editingAgent?.name}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none transition-colors"
                  placeholder={copy.agentNamePlaceholder}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {copy.prompt}
                </label>
                <textarea
                  required
                  name="role"
                  rows={4}
                  defaultValue={editingAgent?.role}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none transition-colors resize-none"
                  placeholder={copy.promptPlaceholder}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {copy.harness}
                </label>
                <select
                  name="harness"
                  defaultValue={editingAgent?.harness || "Auto"}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none transition-colors"
                >
                  <option value="Auto">
                    {copy.autoExecute}
                  </option>
                  <option value="Human-in-the-loop">
                    {copy.humanLoop}
                  </option>
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  {copy.harnessHelp}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {copy.modelProfile}
                </label>
                <select
                  name="modelProfileId"
                  defaultValue={editingAgent?.modelProfileId || modelProfiles[0]?.id || "default_google"}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none transition-colors"
                >
                  {modelProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({profile.provider} / {profile.model})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  {copy.modelProfileHelp}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {copy.supportedIntegrations}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {leadPlatformOptions.map((platform) => (
                    <label
                      key={platform.id}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-500/20 rounded-lg text-sm text-slate-700 dark:text-slate-300"
                    >
                      <input
                        type="checkbox"
                        name="integrations"
                        value={platform.name}
                        defaultChecked={(editingAgent?.integrations || []).includes(platform.name)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{platform.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {copy.integrationsHelp}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {copy.tools}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableTools.map((tool) => (
                    <label
                      key={tool.id}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-700 dark:text-slate-300"
                    >
                      <input
                        type="checkbox"
                        name="tools"
                        value={tool.id}
                        defaultChecked={(editingAgent?.tools || []).includes(tool.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{businessToolLabel(tool.id)}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {copy.toolsHelp}
                </p>
              </div>

              {editingAgent && (
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-white">
                      {copy.agentStatus}
                    </p>
                    <p className="text-xs text-slate-500">
                      {copy.currently}{statusLabel(editingAgent.status)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      toggleStatus(editingAgent.id, editingAgent.status)
                    }
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border",
                      editingAgent.status === "Active"
                        ? "bg-slate-200 dark:bg-white/10 border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300"
                        : "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {editingAgent.status === "Active"
                      ? copy.disableAgent
                      : copy.activateAgent}
                  </button>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                >
                  {copy.cancel}
                </button>
                {editingAgent && (
                  <button
                    type="button"
                    onClick={() => setDeletingAgentId(editingAgent.id)}
                    className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-500/20"
                  >
                    {copy.deleteAgent}
                  </button>
                )}
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {editingAgent ? copy.saveChanges : copy.createAgent}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmModal
        isOpen={deletingAgentId !== null}
        title={copy.deleteAgentTitle}
        message={copy.deleteAgentMessage}
        confirmText={copy.deleteConfirm}
        cancelText={copy.cancel}
        onConfirm={confirmDeleteAgent}
        onCancel={() => setDeletingAgentId(null)}
      />
      <ConfirmModal
        isOpen={deletingRunId !== null}
        title={copy.deleteRunTitle}
        message={copy.deleteRunMessage}
        confirmText={copy.deleteConfirm}
        cancelText={copy.cancel}
        onConfirm={confirmDeleteRun}
        onCancel={() => setDeletingRunId(null)}
      />
    </div>
  );
}
