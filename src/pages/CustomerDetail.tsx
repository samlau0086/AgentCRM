import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  History,
  Bot,
  Sparkles,
  Building2,
  UserCircle,
  Briefcase,
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  Edit2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../i18n";
import {
  getCustomer,
  updateCustomer,
  Customer,
  CustomerLog,
  UniversalComment,
  Attachment,
  getCurrentUser,
} from "../services/db";
import { CommentSection } from "../components/CommentSection";

export default function CustomerDetail() {
  const { id } = useParams();
  const { t } = useLanguage();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasPendingDraft, setHasPendingDraft] = useState(true);
  const [showInsight, setShowInsight] = useState(true);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [draftContent, setDraftContent] = useState(
    "Email Draft: MOQ Negotiation response.",
  );
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

  const [customer, setCustomer] = useState<Customer | undefined>(undefined);

  useEffect(() => {
    if (id) {
      setCustomer(getCustomer(id));
    }
  }, [id]);

  const handleGenerateProposal = async () => {
    setIsGenerating(true);

    // Call AI to generate proposal using customer preferred language
    try {
      const prefLanguage = customer?.preferredLanguage || "en";
      const res = await fetch("/api/ai/draft-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customer?.name || "Customer",
          intent: customer?.intent || "Medium",
          preferredLanguage: prefLanguage,
        }),
      });
      const data = await res.json();
      const generatedDraft =
        data.reply || "Email Draft: MOQ Negotiation response.";

      setDraftContent(generatedDraft);
      setHasPendingDraft(true);

      if (customer && id) {
        const newLog: CustomerLog = {
          id: `t_${Date.now()}`,
          time: "Just now",
          event: "AI drafted a new proposal",
          type: "ai",
        };
        const newLogs = [newLog, ...(customer.logs || [])];
        updateCustomer(id, { logs: newLogs });
        setCustomer(getCustomer(id));
      }
    } catch (err) {
      console.error(err);
      setDraftContent("Error generating proposal.");
      setHasPendingDraft(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveSend = () => {
    setIsSending(true);
    setTimeout(() => {
      setHasPendingDraft(false);
      if (customer && id) {
        const newLog: CustomerLog = {
          id: `t_${Date.now()}`,
          time: "Just now",
          event: `Approved and sent: ${draftContent}`,
          type: "comm",
        };
        const newLogs = [newLog, ...(customer.logs || [])];
        updateCustomer(id, { logs: newLogs });
        setCustomer(getCustomer(id));
      }
      setIsSending(false);
    }, 1000);
  };

  const handleAddComment = (
    content: string,
    attachments: Attachment[],
    parentId?: string,
  ) => {
    if (!customer || !id) return;
    const currentUser = getCurrentUser();

    const newComment: UniversalComment = {
      id: Math.random().toString(36).substr(2, 9),
      authorId: currentUser.id,
      authorName: currentUser.name,
      content,
      createdAt: new Date().toISOString(),
      attachments,
      replies: [],
    };

    let newComments = [...(customer.comments || [])];

    if (parentId) {
      const addReply = (commentsList: UniversalComment[]): boolean => {
        for (let c of commentsList) {
          if (c.id === parentId) {
            c.replies = [...(c.replies || []), newComment];
            return true;
          }
          if (c.replies && addReply(c.replies)) {
            return true;
          }
        }
        return false;
      };
      addReply(newComments);
    } else {
      newComments.push(newComment);
    }

    updateCustomer(id, { comments: newComments });
    setCustomer(getCustomer(id));
  };

  return (
    <div className="w-full p-8 flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/customers"
          className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors border border-transparent hover:border-slate-200 dark:border-white/5"
        >
          <ArrowLeft className="w-5 h-5 text-slate-400 dark:text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white" />
        </Link>
        {customer ? (
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
                {customer.name}
              </h1>
              <span className="px-2 py-1 bg-purple-900/40 text-purple-400 border border-purple-500/20 rounded text-[10px] font-mono">
                {customer.stage}
              </span>
              {(customer.tags || []).map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20 rounded text-[10px] font-mono"
                >
                  {tag}
                </span>
              ))}
            </div>
            <p className="text-slate-400 dark:text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2 text-sm font-light">
              <span className="flex items-center gap-1">
                <UserCircle className="w-4 h-4 shrink-0" />
                <span>{customer.contact}</span>
              </span>
              {customer.contacts?.map((c, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 ml-2 border-l border-slate-300 dark:border-white/10 pl-2"
                >
                  {c.type === "Email" ? (
                    <Mail className="w-4 h-4 shrink-0" />
                  ) : (
                    <Briefcase className="w-4 h-4 shrink-0" />
                  )}
                  <span>{c.value}</span>
                </span>
              ))}
            </p>
          </div>
        ) : (
          <div>Loading...</div>
        )}
        {customer && (
          <Link
            to={`/customers?edit=${id}`}
            className="ml-auto px-4 py-2 bg-white dark:bg-white/5 shadow-sm border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 rounded-lg flex text-sm text-slate-700 dark:text-slate-300 font-semibold items-center gap-2 transition-colors cursor-pointer"
          >
            <Edit2 className="w-4 h-4" /> Edit Info
          </Link>
        )}
      </div>

      {customer && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: AI Summary & Actions */}
          <div className="lg:col-span-2 space-y-6">
            {/* AI Summary */}
            <div className="bg-gradient-to-br from-blue-900/20 to-black/20 border border-blue-600/20 dark:border-blue-500/20 rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                  {t("cd.aiSummary")}
                </h2>
              </div>
              <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-light">
                Customer is highly interested in bulk ordering 10,000 units but
                is currently negotiating on the Minimum Order Quantity (MOQ)
                criteria. They have opened the last pricing proposal 3 times in
                the past 24 hours. The overall intent is very high, but risk of
                stalling exists if MOQ flexibility is not addressed.
              </p>
            </div>

            {/* Next Best Action (AI Driven) */}
            {showInsight && (
              <div className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-emerald-600/30 dark:border-emerald-500/30 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                <h2 className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 mb-2 uppercase tracking-widest">
                  {t("cd.nextAction")}
                </h2>
                <p className="text-slate-900 dark:text-white text-lg font-light mb-6">
                  Suggest offering a{" "}
                  <span className="font-semibold">5% discount</span> or
                  splitting the MOQ across two deliveries to close the deal
                  today.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleGenerateProposal}
                    disabled={isGenerating}
                    className="flex items-center justify-center gap-2 flex-1 bg-emerald-600/20 border border-emerald-600/40 dark:border-emerald-500/40 hover:bg-emerald-600/30 text-emerald-600 dark:text-emerald-400 py-2.5 rounded text-sm font-semibold transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)] disabled:opacity-50"
                  >
                    {isGenerating && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    {isGenerating ? "Generating..." : t("cd.generateProposal")}
                  </button>
                  <button
                    onClick={() => setShowInsight(false)}
                    className="px-4 py-2 bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    {t("cd.dismiss")}
                  </button>
                </div>
              </div>
            )}

            {/* Timeline & Conversation History */}
            <div className="bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  {t("cd.timeline")}
                </h2>
                <button
                  onClick={() => setIsLogModalOpen(true)}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-300 text-xs font-medium cursor-pointer"
                >
                  {t("cd.viewLog")}
                </button>
              </div>

              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-px before:bg-white/10">
                {(customer?.logs || []).slice(0, 3).map((item, i) => (
                  <div
                    key={item.id}
                    className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 bg-black text-slate-400 dark:text-slate-500 group-[.is-active]:border-blue-500/30 group-[.is-active]:text-blue-600 dark:text-blue-400 shadow-xl shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                      {item.type === "ai" ? (
                        <Bot className="w-4 h-4" />
                      ) : item.type === "comm" ? (
                        <Mail className="w-4 h-4" />
                      ) : (
                        <History className="w-4 h-4" />
                      )}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/5 shadow-sm dark:shadow-none hover:bg-white/[0.08] transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-slate-800 dark:text-slate-200 text-sm text-center">
                          {item.event}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                        {item.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Key Details & Pending Agent Actions */}
          <div className="space-y-6">
            {/* Agent Approval Queue */}
            {hasPendingDraft && (
              <div className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                  {t("cd.pendingApproval")}
                </h2>
                <div className="space-y-3">
                  <div className="p-4 bg-amber-950/20 border border-amber-600/20 dark:border-amber-500/20 rounded-xl relative overflow-hidden">
                    {isEditingDraft ? (
                      <div className="flex flex-col gap-3 relative z-10">
                        <div className="p-0.5 rounded-lg bg-white/5 border border-amber-500/30 focus-within:border-amber-500/60 focus-within:bg-black/20 transition-all">
                          <textarea
                            value={draftContent}
                            onChange={(e) => setDraftContent(e.target.value)}
                            className="w-full bg-transparent p-3 text-sm text-slate-800 dark:text-slate-200 resize-none outline-none"
                            rows={4}
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => setIsEditingDraft(false)}
                            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold shadow-sm transition-colors flex items-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Save Draft
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 relative z-10">
                        <p className="text-sm text-amber-600 dark:text-amber-500 font-light">
                          {draftContent}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleApproveSend}
                            disabled={isSending || !draftContent.trim()}
                            className="flex items-center justify-center gap-2 flex-1 py-1.5 bg-amber-600/20 border border-amber-600/40 dark:border-amber-500/40 text-amber-600 dark:text-amber-400 rounded text-xs font-semibold hover:bg-amber-600/30 transition disabled:opacity-50"
                          >
                            {isSending && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            {isSending ? "Sending..." : t("cd.approveSend")}
                          </button>
                          <button
                            onClick={() => setIsEditingDraft(true)}
                            className="px-3 py-1.5 bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded text-xs font-semibold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                          >
                            {t("cd.edit")}
                          </button>
                          <button
                            className="px-3 py-1.5 bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded text-xs font-semibold hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors"
                            onClick={() => setHasPendingDraft(false)}
                          >
                            {t("cd.dismiss") || "Dismiss"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Profile Memory */}
            <div className="bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl p-6">
              <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">
                {t("cd.profileMemory")}
              </h2>
              <div className="space-y-4">
                <div className="flex gap-3 text-sm">
                  <Building2 className="w-5 h-5 text-slate-600 shrink-0" />
                  <div>
                    <p className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-widest">
                      {t("cd.indSize")}
                    </p>
                    <p className="text-slate-800 dark:text-slate-200 font-mono mt-1 text-xs">
                      {customer.industry || "Manufacturing, 100-500 emp."}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 text-sm mt-4 border-t border-slate-200 dark:border-white/5 pt-4">
                  <Briefcase className="w-5 h-5 text-slate-600 shrink-0" />
                  <div>
                    <p className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-widest">
                      {t("cd.budget")}
                    </p>
                    <p className="text-slate-800 dark:text-slate-200 font-mono mt-1 text-xs">
                      $50k - $100k
                    </p>
                  </div>
                </div>

                {customer.address || customer.city || customer.province ? (
                  <div className="flex gap-3 text-sm mt-4 border-t border-slate-200 dark:border-white/5 pt-4">
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      📍
                    </div>
                    <div>
                      <p className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-widest">
                        Office Address
                      </p>
                      <p className="text-slate-800 dark:text-slate-200 font-mono mt-1 text-xs">
                        {[customer.address, customer.city, customer.province]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                  </div>
                ) : null}

                {customer.description && (
                  <div className="flex gap-3 text-sm mt-4 border-t border-slate-200 dark:border-white/5 pt-4">
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      ℹ️
                    </div>
                    <div>
                      <p className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-widest">
                        Description
                      </p>
                      <p className="text-slate-800 dark:text-slate-200 mt-1 text-sm font-light leading-relaxed">
                        {customer.description}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Semantic & Behavioral Memory Tags */}
            <div className="bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl p-6">
              <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">
                {t("cd.semanticMemory")}
              </h2>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-[10px] font-mono rounded">
                  Strict on delivery times
                </span>
                <span className="px-2.5 py-1 bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-[10px] font-mono rounded">
                  Prefers WhatsApp
                </span>
                <span className="px-2.5 py-1 bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-[10px] font-mono rounded">
                  Requires PO process
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collaboration & Comments */}
      {customer && (
        <div className="bg-white dark:bg-slate-900 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-2xl p-6 lg:p-8">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
            Internal Discussion
          </h2>
          <CommentSection
            comments={customer.comments || []}
            onAddComment={handleAddComment}
          />
        </div>
      )}

      {/* Log Modal */}
      {isLogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh] border border-slate-200 dark:border-white/10 animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Complete Activity Log
              </h3>
              <button
                onClick={() => setIsLogModalOpen(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-500 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-6 relative before:absolute before:inset-0 before:ml-11 before:-translate-x-px before:h-full before:w-px before:bg-slate-200 dark:before:bg-white/10">
              {/* Added older historical items to simulate full log */}
              {(customer?.logs || []).map((item, i) => (
                <div
                  key={item.id}
                  className="relative flex items-center gap-6 group is-active"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 bg-black text-slate-400 dark:text-slate-500 shadow-sm shrink-0 z-10 bg-white dark:bg-slate-900">
                    {item.type === "ai" ? (
                      <Bot className="w-4 h-4 text-blue-500" />
                    ) : item.type === "comm" ? (
                      <Mail className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <History className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5 shadow-sm">
                    <div className="font-medium text-slate-800 dark:text-slate-200 text-sm mb-1">
                      {item.event}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                      {item.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
