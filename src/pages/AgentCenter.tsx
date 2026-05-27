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
  ListTodo
} from "lucide-react";
import { useLanguage } from "../i18n";
import { cn } from "../Layout";
import { getAgents, addAgent, updateAgent, Agent, getAgentRuns, getAgentSteps, getAgentApprovals, AgentRun, AgentStep, AgentApproval, saveAgentApprovals, addAgentRun, addAgentStep, addAgentApproval } from "../services/db";

export default function AgentCenter() {
  const { t, language } = useLanguage();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [activeTab, setActiveTab] = useState<'agents' | 'harness'>('harness');

  useEffect(() => {
    setAgents(getAgents());
    setRuns(getAgentRuns());
    setSteps(getAgentSteps());
    setApprovals(getAgentApprovals());
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [showTestModal, setShowTestModal] = useState(false);

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setIsModalOpen(true);
  };

  const handleTestAgent = async (agentId: string, wfName: string) => {
    let runFailed = false;
    const agent = agents.find((a) => a.id === agentId);
    const run = addAgentRun({
      agentId,
      taskType: `Test: ${wfName}`,
      status: "Running",
      currentStep: "Initializing",
      inputJson: { workflowName: wfName, language },
    });
    setRuns(getAgentRuns());
    setShowTestModal(true);
    setIsTestRunning(true);
    setTestLogs([
      "Initializing connection to agent workflow engine...",
      "Loading CRM context...",
    ]);
    try {
      const res = await fetch("/api/ai/trigger-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          context: `Workflow Name: ${wfName}. The user has just requested a test run simulation on a mock Lead with a High intent score.`,
          systemLanguage: language,
        }),
      });
      const data = await res.json();
      if (data.logs) {
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
        if (agent?.harness === "Human-in-the-loop") {
          addAgentApproval({
            runId: run.id,
            actionType: "send_email",
            proposedPayload: {
              to: "john@acme.com",
              subject: `Follow-up from ${agent.name}`,
              body: data.logs.join("\n"),
            },
            status: "Pending",
          });
        }
        setTestLogs((prev) => [
          ...prev,
          ...data.logs,
          "Test run completed successfully.",
        ]);
      } else {
        setTestLogs((prev) => [...prev, "Failed to execute workflow."]);
      }
    } catch (err) {
      runFailed = true;
      addAgentStep({
        runId: run.id,
        stepType: "Tool",
        toolName: "trigger_agent",
        outputJson: { error: "Network error triggering agent." },
        status: "Failed",
      });
      setTestLogs((prev) => [...prev, "Network error triggering agent."]);
    } finally {
      const updatedRuns = getAgentRuns().map((item) =>
        item.id === run.id
          ? {
              ...item,
              status: runFailed ? ("Failed" as const) : ("Completed" as const),
              currentStep: runFailed ? "Failed" : "Completed",
              errorMessage: runFailed ? "Network error triggering agent." : undefined,
            }
          : item,
      );
      localStorage.setItem("crm_agent_runs", JSON.stringify(updatedRuns));
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

    if (editingAgent) {
      updateAgent(editingAgent.id, Object.fromEntries(formData) as any);
    } else {
      addAgent({
        name: data.name as string,
        role: data.role as string,
        status: "Idle",
        harness: data.harness as "Auto" | "Human-in-the-loop",
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
            Monitor workloads and manage the intelligence layer.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-lg flex items-center gap-1 border border-slate-200 dark:border-white/10 shadow-inner">
            <button
              onClick={() => setActiveTab('harness')}
              className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2", activeTab === 'harness' ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300")}
            >
              <Network className="w-4 h-4" /> Harness & Approvals
            </button>
            <button
              onClick={() => setActiveTab('agents')}
              className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2", activeTab === 'agents' ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300")}
            >
              <Server className="w-4 h-4" /> Agent Fleet
            </button>
          </div>
          <button
            onClick={handleAdd}
            className="bg-blue-600 hover:bg-blue-500 text-white shadow-sm px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-medium transition-colors border border-transparent"
          >
            <Plus className="w-4 h-4" />
            Create Agent
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
                      {agent.name}
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
                        {agent.status}
                      </button>
                      <button
                        onClick={() => handleEdit(agent)}
                        className="p-1 text-slate-400 hover:text-blue-600 bg-transparent rounded transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-4 line-clamp-2 min-h-[32px]">
                    {agent.role}
                  </p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-[10px] font-mono tracking-widest uppercase text-slate-500 bg-slate-100 dark:bg-black/20 px-2 py-1 rounded-md border border-slate-200 dark:border-white/5 flex items-center gap-1" title="Harness / Guardrails">
                      {agent.harness === "Auto" ? (
                        <Zap className="w-3 h-3 text-amber-500" />
                      ) : (
                        <ShieldCheck className="w-3 h-3 text-blue-500" />
                      )}
                      {agent.harness}
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
                      title="Trigger/Test workflow"
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
              Human Approvals
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
                            Requires Approval
                          </span>
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Bot className="w-3 h-3" /> {agentInfo?.name || 'Agent'}
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-2">
                          Action: {approval.actionType}
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 max-w-[80px] text-right break-words">{approval.createdAt}</span>
                    </div>
                    {approval.actionType === 'send_email' && (
                      <div className="bg-white dark:bg-black/20 p-3 rounded-lg border border-slate-100 dark:border-white/5 shadow-sm text-sm mb-4">
                        <div className="mb-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">To:</span> {approval.proposedPayload.to}<br/>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Subject:</span> {approval.proposedPayload.subject}
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
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                      <button 
                        onClick={() => {
                           updateApprovalStatus(approval.id, "Approved");
                        }}
                        className="px-5 py-2 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors border border-transparent">
                        <CheckCircle2 className="w-4 h-4" /> Approve & Execute
                      </button>
                    </div>
                  </div>
                );
              })}
              {pendingApprovals.length === 0 && (
                <div className="text-center py-12">
                  <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">All Clear</h3>
                  <p className="text-sm text-slate-500">No pending approvals required.</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-white dark:bg-white/5 shadow-sm border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-slate-400" />
              Agent Runs & Trace Log
            </h2>
            <div className="flex-1 overflow-y-auto space-y-4">
              {runs.map(run => {
                const agentInfo = agents.find(a => a.id === run.agentId);
                const runSteps = steps.filter(s => s.runId === run.id);
                return (
                  <div key={run.id} className="p-4 border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={cn("flex w-2.5 h-2.5 rounded-full", run.status === 'Running' ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" : run.status === 'Pending' ? "bg-amber-500" : run.status === 'Failed' ? "bg-red-500" : "bg-emerald-500")} />
                        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{run.taskType}</h3>
                      </div>
                      <span className="text-xs text-slate-500">{run.status}</span>
                    </div>
                    <div className="text-xs text-slate-500 mb-4 flex items-center gap-2">
                      <Bot className="w-3 h-3" /> {agentInfo?.name}
                    </div>
                    <div className="space-y-2">
                      {runSteps.map((step, idx) => (
                        <div key={step.id} className="flex gap-3 text-xs">
                          <span className="text-slate-400 font-mono w-4 shrink-0 mt-0.5">{idx + 1}.</span>
                          <div className="flex-1">
                            <span className="text-blue-600 dark:text-blue-400 font-mono bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded mr-2">{step.toolName || step.stepType}</span>
                            <span className="text-slate-600 dark:text-slate-400">{step.status}</span>
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
                Agent Execution Log
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
                  <Loader2 className="w-3 h-3 animate-spin" /> Processing AI
                  tasks...
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
                {editingAgent ? "Configure Agent" : "Create Agent"}
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
                  Agent Name
                </label>
                <input
                  required
                  name="name"
                  defaultValue={editingAgent?.name}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none transition-colors"
                  placeholder="e.g. Objections Handler Agent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Prompt / Instructions
                </label>
                <textarea
                  required
                  name="role"
                  rows={4}
                  defaultValue={editingAgent?.role}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none transition-colors resize-none"
                  placeholder="Describe what this agent does..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Harness / Guardrails
                </label>
                <select
                  name="harness"
                  defaultValue={editingAgent?.harness || "Auto"}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none transition-colors"
                >
                  <option value="Auto">
                    Auto-execute (No approval needed)
                  </option>
                  <option value="Human-in-the-loop">
                    Human-in-the-loop (Requires approval)
                  </option>
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  Determines whether this agent can immediately send messages or
                  if drafts must be approved.
                </p>
              </div>

              {editingAgent?.integrations && editingAgent.integrations.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Supported Integrations (Scraping Leads)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {editingAgent.integrations.map(integration => (
                      <span key={integration} className="px-2.5 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md">
                        {integration}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {editingAgent && (
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-white">
                      Agent Status
                    </p>
                    <p className="text-xs text-slate-500">
                      Currently: {editingAgent.status}
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
                      ? "Disable Agent"
                      : "Activate Agent"}
                  </button>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {editingAgent ? "Save Changes" : "Create Agent"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
