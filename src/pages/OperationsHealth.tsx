import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Mail,
  RefreshCw,
  RotateCw,
  Search,
  UploadCloud,
  Wifi,
} from "lucide-react";
import { cn } from "../Layout";
import { useLanguage } from "../i18n";
import { notify } from "../services/notifications";

type HealthPayload = {
  generatedAt: string;
  database: { connected: boolean };
  inboxSync: {
    running: boolean;
    intervalMs: number;
    lastStartedAt?: string;
    lastFinishedAt?: string;
    lastReason?: string;
    lastEmailImported?: number;
    lastWhatsAppImported?: number;
    lastErrors?: string[];
  };
  email: {
    receiveProfiles: number;
    sendProfiles: number;
    mappings: number;
    inboxMessages: number;
    latestMessageAt?: string;
    lastImported: number;
    errors: string[];
  };
  whatsApp: {
    actors: number;
    uniqueClients: number;
    inboxMessages: number;
    latestMessageAt?: string;
    lastImported: number;
    errors: string[];
  };
  agents: {
    schedulerRunning: boolean;
    schedulerIntervalMs: number;
    scheduler: {
      lastStartedAt?: string;
      lastFinishedAt?: string;
      lastReason?: string;
      lastRan?: number;
      lastError?: string;
    };
    totalRuns: number;
    statusCounts: Record<string, number>;
    failedRuns: any[];
    latestRun?: any;
  };
  imports: {
    totalJobs: number;
    statusCounts: Record<string, number>;
    runningJobs: any[];
    failedJobs: any[];
    latestJob?: any;
  };
  leadPlatforms: {
    configured: number;
    enabled: number;
    totalRuns: number;
    failedRuns: any[];
    latestRun?: any;
  };
};

type OperationsLog = {
  id: string;
  timestamp: string;
  module: "agent" | "import" | "email" | "whatsapp" | "lead_platform" | "system";
  severity: "info" | "warning" | "error" | "success";
  title: string;
  detail: string;
  status?: string;
  recordId?: string;
  metadata?: Record<string, unknown>;
};

function formatTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatInterval(ms = 0) {
  if (ms >= 3600000) return `${Math.round(ms / 3600000)}h`;
  if (ms >= 60000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function statusTone(kind: "ok" | "warn" | "bad") {
  if (kind === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (kind === "warn") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
  return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300";
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "ok",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
        </div>
        <div className={cn("rounded-lg border p-2", statusTone(tone))}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

function ModuleCard({
  title,
  subtitle,
  status,
  children,
}: {
  title: string;
  subtitle: string;
  status: "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  const label = status === "ok" ? "Healthy" : status === "warn" ? "Needs attention" : "Failing";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2 py-1 text-xs font-semibold", statusTone(status))}>
          {label}
        </span>
      </div>
      <div className="mt-4 space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-slate-50 px-3 py-2 dark:bg-black/20">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right text-xs font-semibold text-slate-800 dark:text-slate-200">{value}</span>
    </div>
  );
}

export default function OperationsHealth() {
  const { language } = useLanguage();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [logs, setLogs] = useState<OperationsLog[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logSearch, setLogSearch] = useState("");
  const [logModule, setLogModule] = useState("");
  const [logSeverity, setLogSeverity] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");

  const copy = {
    title: language === "zh" ? "运维健康" : "Operations Health",
    subtitle: language === "zh"
      ? "集中查看同步、导入、智能体与获客平台的生产运行状态。"
      : "Monitor background sync, imports, agents, and lead-platform collection from one place.",
    refresh: language === "zh" ? "刷新" : "Refresh",
    triggerSync: language === "zh" ? "同步收件箱" : "Run inbox sync",
    triggerAgents: language === "zh" ? "运行智能体调度" : "Run agent scheduler",
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (logSearch.trim()) params.set("search", logSearch.trim());
      if (logModule) params.set("module", logModule);
      if (logSeverity) params.set("severity", logSeverity);
      const response = await fetch(`/api/operations/logs?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Logs request failed with HTTP ${response.status}.`);
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setLogTotal(Number(data.total || 0));
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load operations logs.", "error", copy.title);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadHealth = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/operations/health");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Health check failed with HTTP ${response.status}.`);
      setHealth(data);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load operations health.", "error", copy.title);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
    const timer = window.setInterval(loadHealth, 30000);
    return () => window.clearInterval(timer);
  }, [language]);

  useEffect(() => {
    const timer = window.setTimeout(loadLogs, 250);
    return () => window.clearTimeout(timer);
  }, [logSearch, logModule, logSeverity, language]);

  const runAction = async (action: "sync" | "agents") => {
    setBusyAction(action);
    try {
      const response = await fetch(action === "sync" ? "/api/communication/inbox/background-sync" : "/api/agent/scheduler/tick", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Action failed with HTTP ${response.status}.`);
      notify(language === "zh" ? "任务已执行。" : "Task executed.", "success", copy.title);
      await loadHealth();
      await loadLogs();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to run action.", "error", copy.title);
    } finally {
      setBusyAction("");
    }
  };

  const derived = useMemo(() => {
    if (!health) return null;
    const emailWarn = health.email.receiveProfiles === 0 || health.email.mappings === 0 || health.email.errors.length > 0;
    const waWarn = health.whatsApp.actors === 0 || health.whatsApp.errors.length > 0;
    const agentFailed = Number(health.agents.statusCounts.Failed || 0);
    const importFailed = Number((health.imports.statusCounts.failed || 0) + (health.imports.statusCounts.completed_with_errors || 0));
    const platformFailed = health.leadPlatforms.failedRuns.length;
    return {
      issueCount: Number(!health.database.connected) + Number(emailWarn) + Number(waWarn) + agentFailed + importFailed + platformFailed,
      emailStatus: health.email.errors.length > 0 ? "bad" : emailWarn ? "warn" : "ok",
      waStatus: health.whatsApp.errors.length > 0 ? "bad" : waWarn ? "warn" : "ok",
      agentStatus: health.agents.scheduler.lastError || agentFailed > 0 ? "bad" : health.agents.schedulerRunning ? "warn" : "ok",
      importStatus: importFailed > 0 ? "warn" : health.imports.runningJobs.length > 0 ? "warn" : "ok",
      platformStatus: platformFailed > 0 ? "bad" : health.leadPlatforms.enabled === 0 ? "warn" : "ok",
    } as const;
  }, [health]);

  const failures = [
    ...(health?.agents.failedRuns || []).map((item) => ({ module: "Agent", title: item.taskType || item.workflowId || item.id, detail: item.errorMessage || item.status, time: item.createdAt })),
    ...(health?.imports.failedJobs || []).map((item) => ({ module: "Import", title: item.fileName || item.id, detail: item.message || item.status, time: item.completedAt || item.createdAt })),
    ...(health?.leadPlatforms.failedRuns || []).map((item) => ({ module: "Lead Platform", title: item.taskType || item.targetId || item.id, detail: item.errorMessage || item.status, time: item.createdAt })),
  ].slice(0, 12);

  const severityClass = (severity: OperationsLog["severity"]) => {
    if (severity === "error") return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300";
    if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
    if (severity === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
    return "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-4 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{copy.title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={loadHealth} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {copy.refresh}
          </button>
          <button type="button" onClick={() => runAction("sync")} disabled={!!busyAction} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50">
            <RotateCw className={cn("h-4 w-4", busyAction === "sync" && "animate-spin")} />
            {copy.triggerSync}
          </button>
          <button type="button" onClick={() => runAction("agents")} disabled={!!busyAction} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900">
            <Bot className="h-4 w-4" />
            {copy.triggerAgents}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={language === "zh" ? "数据库" : "Database"} value={health?.database.connected ? "OK" : "Down"} detail={language === "zh" ? "CRM 记录存储连接状态" : "CRM record storage connectivity"} icon={Database} tone={health?.database.connected ? "ok" : "bad"} />
        <MetricCard label={language === "zh" ? "待处理问题" : "Open Issues"} value={derived?.issueCount ?? "-"} detail={language === "zh" ? "失败任务、异常同步与缺失配置" : "Failed jobs, sync errors, and missing configuration"} icon={AlertTriangle} tone={(derived?.issueCount || 0) > 0 ? "warn" : "ok"} />
        <MetricCard label={language === "zh" ? "后台同步间隔" : "Sync Interval"} value={formatInterval(health?.inboxSync.intervalMs || 0)} detail={`${language === "zh" ? "上次完成" : "Last finished"}: ${formatTime(health?.inboxSync.lastFinishedAt)}`} icon={Wifi} tone={health?.inboxSync.running ? "warn" : "ok"} />
        <MetricCard label={language === "zh" ? "智能体调度间隔" : "Agent Interval"} value={formatInterval(health?.agents.schedulerIntervalMs || 0)} detail={`${language === "zh" ? "上次运行数" : "Last ran"}: ${health?.agents.scheduler.lastRan ?? 0}`} icon={Activity} tone={health?.agents.schedulerRunning ? "warn" : "ok"} />
      </div>

      {health && derived && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ModuleCard title="Email" subtitle={language === "zh" ? "IMAP 同步与 SMTP 配置" : "IMAP sync and SMTP configuration"} status={derived.emailStatus}>
            <Fact label={language === "zh" ? "接收配置" : "Receive profiles"} value={health.email.receiveProfiles} />
            <Fact label={language === "zh" ? "发送配置" : "Send profiles"} value={health.email.sendProfiles} />
            <Fact label={language === "zh" ? "账号映射" : "Mappings"} value={health.email.mappings} />
            <Fact label={language === "zh" ? "最近邮件" : "Latest email"} value={formatTime(health.email.latestMessageAt)} />
            {health.email.errors.map((error) => <Fact key={error} label={language === "zh" ? "错误" : "Error"} value={<span className="text-red-500">{error}</span>} />)}
          </ModuleCard>

          <ModuleCard title="WhatsApp Actor Hub" subtitle={language === "zh" ? "Actor/Client 池与后台同步" : "Actor/client pool and background sync"} status={derived.waStatus}>
            <Fact label={language === "zh" ? "Actor 数" : "Actors"} value={health.whatsApp.actors} />
            <Fact label={language === "zh" ? "Client 数" : "Clients"} value={health.whatsApp.uniqueClients} />
            <Fact label={language === "zh" ? "消息线程" : "Threads"} value={health.whatsApp.inboxMessages} />
            <Fact label={language === "zh" ? "最近消息" : "Latest message"} value={formatTime(health.whatsApp.latestMessageAt)} />
            {health.whatsApp.errors.map((error) => <Fact key={error} label={language === "zh" ? "错误" : "Error"} value={<span className="text-red-500">{error}</span>} />)}
          </ModuleCard>

          <ModuleCard title={language === "zh" ? "智能体运行" : "Agent Runs"} subtitle={language === "zh" ? "后台调度与运行结果" : "Server scheduler and workflow results"} status={derived.agentStatus}>
            <Fact label={language === "zh" ? "总运行数" : "Total runs"} value={health.agents.totalRuns} />
            <Fact label={language === "zh" ? "状态" : "Statuses"} value={Object.entries(health.agents.statusCounts).map(([k, v]) => `${k}:${v}`).join("  ") || "-"} />
            <Fact label={language === "zh" ? "上次调度" : "Last scheduler"} value={formatTime(health.agents.scheduler.lastFinishedAt)} />
            {health.agents.scheduler.lastError && <Fact label={language === "zh" ? "调度错误" : "Scheduler error"} value={<span className="text-red-500">{health.agents.scheduler.lastError}</span>} />}
          </ModuleCard>

          <ModuleCard title={language === "zh" ? "导入任务" : "Import Jobs"} subtitle={language === "zh" ? "CSV 导入进度与失败行" : "CSV import progress and failed rows"} status={derived.importStatus}>
            <Fact label={language === "zh" ? "总任务" : "Total jobs"} value={health.imports.totalJobs} />
            <Fact label={language === "zh" ? "运行中" : "Running"} value={health.imports.runningJobs.length} />
            <Fact label={language === "zh" ? "状态" : "Statuses"} value={Object.entries(health.imports.statusCounts).map(([k, v]) => `${k}:${v}`).join("  ") || "-"} />
            <Fact label={language === "zh" ? "最近任务" : "Latest job"} value={formatTime(health.imports.latestJob?.createdAt)} />
          </ModuleCard>

          <ModuleCard title={language === "zh" ? "获客平台" : "Lead Platforms"} subtitle={language === "zh" ? "平台配置与采集运行" : "Platform config and collection runs"} status={derived.platformStatus}>
            <Fact label={language === "zh" ? "已配置" : "Configured"} value={health.leadPlatforms.configured} />
            <Fact label={language === "zh" ? "已启用" : "Enabled"} value={health.leadPlatforms.enabled} />
            <Fact label={language === "zh" ? "采集运行" : "Collection runs"} value={health.leadPlatforms.totalRuns} />
            <Fact label={language === "zh" ? "最近采集" : "Latest collection"} value={formatTime(health.leadPlatforms.latestRun?.createdAt)} />
          </ModuleCard>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{language === "zh" ? "生产日志" : "Production Logs"}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === "zh" ? `统一事件流，当前匹配 ${logTotal} 条。` : `Unified event stream. ${logTotal} matching event(s).`}
            </p>
          </div>
          <button
            type="button"
            onClick={loadLogs}
            disabled={logsLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            <RefreshCw className={cn("h-4 w-4", logsLoading && "animate-spin")} />
            {language === "zh" ? "刷新日志" : "Refresh logs"}
          </button>
        </div>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/10 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={logSearch}
              onChange={(event) => setLogSearch(event.target.value)}
              placeholder={language === "zh" ? "搜索模块、任务、错误、ID..." : "Search module, job, error, ID..."}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-slate-200"
            />
          </div>
          <select
            value={logModule}
            onChange={(event) => setLogModule(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-slate-200"
          >
            <option value="">{language === "zh" ? "全部模块" : "All modules"}</option>
            <option value="agent">Agent</option>
            <option value="lead_platform">Lead Platform</option>
            <option value="import">Import</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="system">System</option>
          </select>
          <select
            value={logSeverity}
            onChange={(event) => setLogSeverity(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-slate-200"
          >
            <option value="">{language === "zh" ? "全部级别" : "All severities"}</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="success">Success</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:bg-black/20">
              <tr>
                <th className="px-4 py-3">{language === "zh" ? "时间" : "Time"}</th>
                <th className="px-4 py-3">{language === "zh" ? "模块" : "Module"}</th>
                <th className="px-4 py-3">{language === "zh" ? "级别" : "Severity"}</th>
                <th className="px-4 py-3">{language === "zh" ? "事件" : "Event"}</th>
                <th className="px-4 py-3">{language === "zh" ? "状态" : "Status"}</th>
                <th className="px-4 py-3">{language === "zh" ? "记录 ID" : "Record ID"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                    {logsLoading ? (language === "zh" ? "正在加载日志..." : "Loading logs...") : (language === "zh" ? "没有匹配的日志。" : "No matching logs.")}
                  </td>
                </tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-3 text-xs text-slate-500">{formatTime(log.timestamp)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{log.module}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full border px-2 py-1 text-xs font-semibold", severityClass(log.severity))}>
                      {log.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{log.title}</div>
                    <div className="mt-1 max-w-xl truncate text-xs text-slate-500">{log.detail || "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{log.status || "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.recordId || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{language === "zh" ? "最近失败" : "Recent Failures"}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{language === "zh" ? "来自智能体、导入和获客平台任务。" : "From agent, import, and lead-platform jobs."}</p>
          </div>
          {(failures.length === 0) && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:bg-black/20">
              <tr>
                <th className="px-4 py-3">{language === "zh" ? "模块" : "Module"}</th>
                <th className="px-4 py-3">{language === "zh" ? "任务" : "Job"}</th>
                <th className="px-4 py-3">{language === "zh" ? "详情" : "Detail"}</th>
                <th className="px-4 py-3">{language === "zh" ? "时间" : "Time"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {failures.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">{language === "zh" ? "当前没有失败记录。" : "No failed records right now."}</td></tr>
              ) : failures.map((failure, index) => (
                <tr key={`${failure.module}-${index}`} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{failure.module}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{failure.title}</td>
                  <td className="px-4 py-3 text-red-500">{failure.detail}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatTime(failure.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard label="Email" value={health?.email.inboxMessages ?? "-"} detail={language === "zh" ? "数据库中的邮件线程" : "Email threads stored in database"} icon={Mail} />
        <MetricCard label="WhatsApp" value={health?.whatsApp.inboxMessages ?? "-"} detail={language === "zh" ? "数据库中的 WhatsApp 线程" : "WhatsApp threads stored in database"} icon={Wifi} />
        <MetricCard label={language === "zh" ? "导入" : "Imports"} value={health?.imports.totalJobs ?? "-"} detail={language === "zh" ? "后台导入任务记录" : "Background import job records"} icon={UploadCloud} />
      </div>
    </div>
  );
}
