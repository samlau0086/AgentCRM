import React, { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, RotateCcw, Trash2, Filter, Database } from "lucide-react";
import { cn } from "../Layout";
import { useLanguage } from "../i18n";
import {
  deleteImportJob,
  ImportJob,
  loadImportJobs,
  pruneImportJobs,
  retryImportJobFailedRows,
} from "../services/db";
import { notify } from "../services/notifications";

const IMPORT_TYPES = [
  { value: "", labelEn: "All imports", labelZh: "全部导入" },
  { value: "customers_csv", labelEn: "My Customers", labelZh: "我的客户" },
  { value: "public_leads_csv", labelEn: "Public Pool", labelZh: "公海客户" },
];

const IMPORT_STATUSES = [
  { value: "", labelEn: "All statuses", labelZh: "全部状态" },
  { value: "queued", labelEn: "Queued", labelZh: "排队中" },
  { value: "running", labelEn: "Running", labelZh: "运行中" },
  { value: "completed", labelEn: "Completed", labelZh: "已完成" },
  { value: "completed_with_errors", labelEn: "Completed with errors", labelZh: "完成但有错误" },
  { value: "failed", labelEn: "Failed", labelZh: "失败" },
];

function jobTypeLabel(job: ImportJob, language: string) {
  if (job.type === "customers_csv") return language === "zh" ? "我的客户" : "My Customers";
  return language === "zh" ? "公海客户" : "Public Pool";
}

function statusTone(status: ImportJob["status"]) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20";
  if (status === "completed_with_errors") return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20";
  if (status === "failed") return "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20";
  return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20";
}

export default function ImportHistory() {
  const { language } = useLanguage();
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pruneDays, setPruneDays] = useState(30);
  const [busyJobId, setBusyJobId] = useState("");

  const summary = useMemo(() => {
    return jobs.reduce(
      (acc, job) => {
        acc.total += 1;
        acc.imported += job.importedRows;
        acc.failed += job.failedRows;
        acc.skipped += job.skippedRows;
        return acc;
      },
      { total: 0, imported: 0, failed: 0, skipped: 0 },
    );
  }, [jobs]);

  const refreshJobs = async () => {
    setIsLoading(true);
    try {
      setJobs(await loadImportJobs(typeFilter, statusFilter));
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load import history.", "error", "Import history");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshJobs();
  }, [typeFilter, statusFilter]);

  const handleRetry = async (job: ImportJob) => {
    setBusyJobId(job.id);
    try {
      await retryImportJobFailedRows(job.id);
      notify(language === "zh" ? "失败行已重新创建导入任务。" : "Failed rows were queued for retry.", "success", language === "zh" ? "已创建重试任务" : "Retry queued");
      await refreshJobs();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to retry rows.", "error", language === "zh" ? "重试失败" : "Retry failed");
    } finally {
      setBusyJobId("");
    }
  };

  const handleDelete = async (job: ImportJob) => {
    setBusyJobId(job.id);
    try {
      await deleteImportJob(job.id);
      notify(language === "zh" ? "导入任务已删除。" : "Import job deleted.", "success", language === "zh" ? "已删除" : "Deleted");
      await refreshJobs();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete import job.", "error", language === "zh" ? "删除失败" : "Delete failed");
    } finally {
      setBusyJobId("");
    }
  };

  const handlePrune = async () => {
    setIsLoading(true);
    try {
      const result = await pruneImportJobs(pruneDays);
      notify(
        language === "zh" ? `已清理 ${result.deleted} 个导入任务。` : `Pruned ${result.deleted} import job(s).`,
        "success",
        language === "zh" ? "清理完成" : "Prune complete",
      );
      await refreshJobs();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to prune import jobs.", "error", language === "zh" ? "清理失败" : "Prune failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            {language === "zh" ? "导入历史" : "Import History"}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {language === "zh" ? "追踪客户与公海 CSV 导入任务、失败行与清理策略。" : "Track customer and Public Pool CSV import jobs, failed rows, and retention cleanup."}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshJobs}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          {language === "zh" ? "刷新" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [language === "zh" ? "任务数" : "Jobs", summary.total],
          [language === "zh" ? "导入" : "Imported", summary.imported],
          [language === "zh" ? "跳过" : "Skipped", summary.skipped],
          [language === "zh" ? "失败" : "Failed", summary.failed],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-slate-400" />
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black/30">
            {IMPORT_TYPES.map((item) => <option key={item.value} value={item.value}>{language === "zh" ? item.labelZh : item.labelEn}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black/30">
            {IMPORT_STATUSES.map((item) => <option key={item.value} value={item.value}>{language === "zh" ? item.labelZh : item.labelEn}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">{language === "zh" ? "清理已完成且早于" : "Prune completed older than"}</span>
          <input type="number" min={1} value={pruneDays} onChange={(event) => setPruneDays(Number(event.target.value) || 30)} className="w-20 rounded-md border border-slate-200 bg-white px-2 py-2 text-sm dark:border-white/10 dark:bg-black/30" />
          <span className="text-xs text-slate-500">{language === "zh" ? "天" : "days"}</span>
          <button type="button" onClick={handlePrune} disabled={isLoading} className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900">
            {language === "zh" ? "清理" : "Prune"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:bg-black/20">
              <tr>
                <th className="px-4 py-3">{language === "zh" ? "文件" : "File"}</th>
                <th className="px-4 py-3">{language === "zh" ? "类型" : "Type"}</th>
                <th className="px-4 py-3">{language === "zh" ? "状态" : "Status"}</th>
                <th className="px-4 py-3">{language === "zh" ? "进度" : "Progress"}</th>
                <th className="px-4 py-3">{language === "zh" ? "结果" : "Result"}</th>
                <th className="px-4 py-3">{language === "zh" ? "时间" : "Time"}</th>
                <th className="px-4 py-3 text-right">{language === "zh" ? "操作" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {jobs.map((job) => {
                const percent = job.totalRows === 0 ? 100 : Math.round((job.processedRows / job.totalRows) * 100);
                const canRetry = job.failedRows > 0 && !["queued", "running"].includes(job.status);
                return (
                  <tr key={job.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{job.fileName}</p>
                          <p className="text-xs text-slate-400">{job.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{jobTypeLabel(job, language)}</td>
                    <td className="px-4 py-4">
                      <span className={cn("rounded-full border px-2 py-1 text-xs font-semibold", statusTone(job.status))}>{job.status}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="w-40">
                        <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{percent}%</span><span>{job.processedRows}/{job.totalRows}</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-black/30"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} /></div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-500">
                      {job.importedRows} imported | {job.skippedRows} skipped | {job.failedRows} failed
                      {job.errors?.[0] && <div className="mt-1 text-red-500">Row {job.errors[0].rowNumber}: {job.errors[0].reason}</div>}
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-500">
                      <div>{new Date(job.createdAt).toLocaleString()}</div>
                      {job.completedAt && <div>{new Date(job.completedAt).toLocaleString()}</div>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {job.failedRows > 0 && (
                          <a href={`/api/imports/${encodeURIComponent(job.id)}/failed-csv`} className="rounded-md border border-slate-200 p-2 text-slate-500 hover:text-blue-600 dark:border-white/10" title={language === "zh" ? "下载失败行" : "Download failed rows"}>
                            <Download className="h-4 w-4" />
                          </a>
                        )}
                        <button type="button" onClick={() => handleRetry(job)} disabled={!canRetry || busyJobId === job.id} className="rounded-md border border-slate-200 p-2 text-slate-500 hover:text-blue-600 disabled:opacity-40 dark:border-white/10" title={language === "zh" ? "重试失败行" : "Retry failed rows"}>
                          <RotateCcw className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleDelete(job)} disabled={busyJobId === job.id} className="rounded-md border border-slate-200 p-2 text-slate-500 hover:text-red-600 disabled:opacity-40 dark:border-white/10" title={language === "zh" ? "删除任务" : "Delete job"}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {jobs.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">{language === "zh" ? "暂无导入任务。" : "No import jobs found."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
