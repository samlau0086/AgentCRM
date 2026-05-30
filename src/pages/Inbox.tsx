import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Inbox as InboxTray,
  Mail,
  MessageCircle,
  Search,
  Bot,
  Send,
  CornerDownRight,
  Loader2,
  User,
  X,
  Paperclip,
  Sparkles,
  Clock,
  Calendar,
  Trash2,
  RefreshCw,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  RemoveFormatting,
  Reply,
  Forward,
  SquarePen,
} from "lucide-react";
import { cn } from "../Layout";
import { useLanguage } from "../i18n";
import { fetchClients, fetchMessages, sendMessage, WaClient } from "../services/waHub";
import { fetchEmails, sendEmail, getEmailMappings, getEmailSignatures, loadEmailConfigurationFromServer } from "../services/emailSync";
import {
  getInboxMessages,
  loadInboxMessagesFromServer,
  addDraftToThread,
  markMessageRead,
  MessagePreview,
  ThreadMessage,
  saveInboxMessages,
  getCustomers,
  Customer,
  updateInboxMessage,
  Attachment,
  UniversalComment,
  getCurrentUser,
  addOutboundMessage,
  deleteInboxMessage,
  getModelProfiles,
} from "../services/db";
import { CommentSection } from "../components/CommentSection";
import ConfirmModal from "../components/ConfirmModal";
import { notify } from "../services/notifications";

interface InboxInsight {
  intent: string;
  priority: "low" | "medium" | "high";
  risk: string;
  customerNeed: string;
  recommendedActions: string[];
  replyGuidance: string[];
  model?: string;
  provider?: string;
  analyzedAt?: string;
}

type SenderAnalysisMode = "auto" | "manual";

interface SenderAnalysisPreference {
  sender: string;
  mode: SenderAnalysisMode;
  updatedAt?: string;
}

const INBOX_INSIGHTS_KEY = "crm_inbox_ai_insights";
const SENDER_ANALYSIS_PREFS_KEY = "crm_inbox_sender_analysis_prefs";
const LAST_SIGNATURE_BY_RECIPIENT_KEY = "crm_last_email_signature_by_recipient";

function loadJsonMap<T>(key: string): Record<string, T> {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function senderPreferenceKey(sender = "") {
  return sender.trim().toLowerCase() || "unknown";
}

function stripHtml(value = "") {
  const element = document.createElement("div");
  element.innerHTML = value;
  return (element.textContent || element.innerText || "").replace(/\u00a0/g, " ").trim();
}

function escapeHtml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function editorHtml(value = "") {
  return /<\/?[a-z][\s\S]*>/i.test(value)
    ? value
    : value
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>") || "<br>"}</p>`)
        .join("");
}

function quotedOriginalHtml(message?: MessagePreview | null) {
  if (!message) return "";
  const first = message.thread?.[0];
  const body = first?.htmlContent || `<p>${escapeHtml(first?.content || message.summary).replace(/\n/g, "<br>")}</p>`;
  return `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #d1d5db;color:#475569;font-size:13px">
    <p>On ${escapeHtml(message.date)}, ${escapeHtml(message.sender)} wrote:</p>
    ${body}
  </div>`;
}

function loadLastSignatureByRecipient(): Record<string, string> {
  return loadJsonMap<string>(LAST_SIGNATURE_BY_RECIPIENT_KEY);
}

export default function Inbox() {
  const { t, language } = useLanguage();
  const [waClients, setWaClients] = useState<WaClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [replyText, setReplyText] = useState("");
  const [replyTo, setReplyTo] = useState<string[]>([]);
  const [replyCc, setReplyCc] = useState<string[]>([]);
  const [replyBcc, setReplyBcc] = useState<string[]>([]);
  const [replyShowCc, setReplyShowCc] = useState(false);
  const [replyShowBcc, setReplyShowBcc] = useState(false);

  const [composeScheduleDate, setComposeScheduleDate] = useState("");
  const [composeScheduleTime, setComposeScheduleTime] = useState("");
  const [showComposeSchedule, setShowComposeSchedule] = useState(false);

  const [replyScheduleDate, setReplyScheduleDate] = useState("");
  const [replyScheduleTime, setReplyScheduleTime] = useState("");
  const [showReplySchedule, setShowReplySchedule] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAIGenerateSubject = () => {
    if (!stripHtml(composeBody)) {
      notify("Please enter some message content first.", "warning", "Message content required");
      return;
    }
    setComposeSubject(
      `Re: ` +
        stripHtml(composeBody).substring(0, 30) +
        (stripHtml(composeBody).length > 30 ? "..." : ""),
    );
  };

  const handleAIGenerateBody = () => {
    if (!composeSubject && !composeTo.length) {
      setComposeBody(
        "Hi,\n\nI hope this email finds you well.\n\nBest regards,\nSales Team",
      );
      return;
    }
    setComposeBody(
      `Hi ${composeTo.length > 0 ? composeTo[0].split("<")[0].trim() : "there"},\n\nRegarding: ${composeSubject || "our recent discussion"}\n${stripHtml(composeBody) ? "\n" + stripHtml(composeBody) + "\n" : ""}\nPlease let me know if you need any further information.\n\nBest regards,\nSales Team\n`,
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((f) => ({
        name: f.name,
        size: f.size,
      }));
      setComposeAttachments((prev) => [...prev, ...newFiles]);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetCompose = () => {
    setComposeTo([]);
    setComposeCc([]);
    setComposeBcc([]);
    setComposeSubject("");
    setComposeBody("");
    setComposeMode("new");
    setComposeOriginalMessage(null);
    const mappingSignatureId = getEmailMappings()[0]?.signatureId || "";
    const signature = getEmailSignatures().find((item) => item.id === mappingSignatureId);
    setComposeSignatureId(mappingSignatureId);
    setComposeSignatureHtml(signature?.html || "");
    setComposeAttachments([]);
    setComposeScheduleDate("");
    setComposeScheduleTime("");
    setShowComposeSchedule(false);
  };

  const handleComposeSend = async () => {
    const composePlainText = stripHtml(composeBody);
    if (!composeTo.length || !composeSubject.trim() || !composePlainText) {
      notify("Please add at least one recipient, a subject, and a message.", "warning", "Missing email details");
      return;
    }

    const isScheduled =
      showComposeSchedule && composeScheduleDate && composeScheduleTime;

    if (isScheduled) {
      notify("Scheduled sending requires a real backend scheduler. Send immediately or configure a scheduler endpoint first.", "warning", "Scheduler not configured");
      return;
    }

    setIsSending(true);
    try {
      const signatureHtml = composeSignatureHtml || "";
      const originalHtml = composeOriginalMessage ? quotedOriginalHtml(composeOriginalMessage) : "";
      const finalHtml = `${composeBody}${signatureHtml ? `<div class="email-signature">${signatureHtml}</div>` : ""}${originalHtml}`;
      const finalText = stripHtml(finalHtml);
      await sendEmail("default", composeTo.join(", "), composeSubject, finalText, finalHtml);
      if (composeTo[0] && composeSignatureId) {
        const next = { ...loadLastSignatureByRecipient(), [composeTo[0].trim().toLowerCase()]: composeSignatureId };
        localStorage.setItem(LAST_SIGNATURE_BY_RECIPIENT_KEY, JSON.stringify(next));
      }
      const sentMessage = addOutboundMessage({
        sender: "agent@example.com",
        target: composeTo.join(", "),
        intent: "Outbound",
        subject: composeSubject,
        summary: finalText.slice(0, 140),
        channel: "Email",
        thread: [
          {
            id: `t_${Date.now()}`,
            sender: "agent",
            content: finalText,
            htmlContent: finalHtml,
            time: new Date().toLocaleTimeString(),
          },
        ],
        tags: composeAttachments.length ? ["attachments"] : [],
      });
      setMessages(getInboxMessages());
      resetCompose();
      setSelectedMailbox("sent");
      setActiveMessageId(sentMessage.id);
      setActiveTab("inbox");
    } catch (e: any) {
      notify(`Error sending: ${e.message}`, "error", "Send failed");
    } finally {
      setIsSending(false);
    }
  };

  const applySignatureForRecipient = (recipient: string) => {
    const signatures = getEmailSignatures();
    const lastSignatureId = loadLastSignatureByRecipient()[recipient.trim().toLowerCase()];
    const fallbackSignatureId = getEmailMappings()[0]?.signatureId || "";
    const signatureId = lastSignatureId || fallbackSignatureId;
    const signature = signatures.find((item) => item.id === signatureId);
    setComposeSignatureId(signatureId || "");
    setComposeSignatureHtml(signature?.html || "");
  };

  const startReply = (message: MessagePreview, initialBody = "") => {
    const recipient = message.direction === "outbound" || message.intent === "Outbound" ? message.target : message.sender;
    setComposeMode("reply");
    setComposeOriginalMessage(message);
    setComposeTo(recipient ? [recipient] : []);
    setComposeCc([]);
    setComposeBcc([]);
    setComposeSubject(message.subject.toLowerCase().startsWith("re:") ? message.subject : `Re: ${message.subject}`);
    setComposeBody(initialBody);
    applySignatureForRecipient(recipient);
    setActiveTab("compose");
  };

  const startForward = (message: MessagePreview) => {
    setComposeMode("forward");
    setComposeOriginalMessage(message);
    setComposeTo([]);
    setComposeCc([]);
    setComposeBcc([]);
    setComposeSubject(message.subject.toLowerCase().startsWith("fwd:") ? message.subject : `Fwd: ${message.subject}`);
    setComposeBody("");
    const fallbackSignatureId = getEmailMappings()[0]?.signatureId || "";
    const signature = getEmailSignatures().find((item) => item.id === fallbackSignatureId);
    setComposeSignatureId(fallbackSignatureId);
    setComposeSignatureHtml(signature?.html || "");
    setActiveTab("compose");
  };

  const handleCancelCompose = () => {
    const originalMessageId = composeOriginalMessage?.id;
    resetCompose();
    setActiveTab("inbox");
    if (originalMessageId) {
      setActiveMessageId(originalMessageId);
    }
  };

  const handleSelectMessage = (message: MessagePreview) => {
    if (!message.read) {
      markMessageRead(message.id);
      setMessages(getInboxMessages());
    }
    setActiveMessageId(message.id);
    setActiveTab("inbox");
  };

  const [messages, setMessages] = useState<MessagePreview[]>([]);
  const [activeMessageId, setActiveMessageId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMailbox, setSelectedMailbox] = useState<"inbox" | "sent">("inbox");

  const [activeTab, setActiveTab] = useState<"inbox" | "compose">("inbox");
  const [composeTo, setComposeTo] = useState<string[]>([]);
  const [composeCc, setComposeCc] = useState<string[]>([]);
  const [composeBcc, setComposeBcc] = useState<string[]>([]);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeMode, setComposeMode] = useState<"new" | "reply" | "forward">("new");
  const [composeOriginalMessage, setComposeOriginalMessage] = useState<MessagePreview | null>(null);
  const [composeSignatureId, setComposeSignatureId] = useState("");
  const [composeSignatureHtml, setComposeSignatureHtml] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [composeAttachments, setComposeAttachments] = useState<
    { name: string; size: number }[]
  >([]);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [inboxInsights, setInboxInsights] = useState<Record<string, InboxInsight>>(() => loadJsonMap<InboxInsight>(INBOX_INSIGHTS_KEY));
  const [insightErrors, setInsightErrors] = useState<Record<string, string>>({});
  const [analyzingMessageId, setAnalyzingMessageId] = useState<string | null>(null);
  const [loadingInsightId, setLoadingInsightId] = useState<string | null>(null);
  const [checkedInsightIds, setCheckedInsightIds] = useState<Set<string>>(() => new Set());
  const [senderAnalysisPrefs, setSenderAnalysisPrefs] = useState<Record<string, SenderAnalysisPreference>>(() => loadJsonMap<SenderAnalysisPreference>(SENDER_ANALYSIS_PREFS_KEY));
  const [checkedSenderPrefKeys, setCheckedSenderPrefKeys] = useState<Set<string>>(() => new Set());
  const [loadingSenderPrefKey, setLoadingSenderPrefKey] = useState<string | null>(null);

  const syncInboxMessages = async (silent = false) => {
    if (!silent) setIsSyncing(true);
    const failures: string[] = [];
    let addedCount = 0;

    try {
      const [emailResult, waResult] = await Promise.allSettled([
        fetchEmails(),
        fetchMessages(50),
      ]);
      const emails = emailResult.status === "fulfilled" ? emailResult.value : [];
      const waMessages = waResult.status === "fulfilled" ? waResult.value : [];

      if (emailResult.status === "rejected") {
        failures.push(`Email: ${emailResult.reason?.message || "sync failed"}`);
      }
      if (waResult.status === "rejected") {
        failures.push(`WhatsApp: ${waResult.reason?.message || "sync failed"}`);
      }

      const existing = getInboxMessages();
      const existingIds = new Set(existing.map((m) => m.id));
      const emailById = new Map(emails.map((email) => [email.id, email]));
      let updatedCount = 0;
      const refreshedExisting = existing.map((message) => {
        const email = emailById.get(message.id);
        if (!email) return message;
        if (message.subject !== email.subject || message.summary !== email.summary || message.sender !== email.sender) {
          updatedCount += 1;
        }
        return {
          ...message,
          ...email,
          thread: message.thread?.length
            ? message.thread.map((item, index) => index === 0 ? { ...item, content: email.summary, htmlContent: email.bodyHtml, time: email.date } : item)
            : [
                {
                  id: `t_${email.id}`,
                  sender: "user",
                  content: email.summary,
                  htmlContent: email.bodyHtml,
                  time: email.date,
                },
              ],
        };
      });
      const emailPreviews: MessagePreview[] = emails
        .filter((email) => !existingIds.has(email.id))
        .map((email) => ({
          ...email,
          direction: "inbound",
          thread: [
            {
              id: `t_${email.id}`,
              sender: "user",
              content: email.summary,
              htmlContent: email.bodyHtml,
              time: email.date,
            },
          ],
        }));
      emailPreviews.forEach((message) => existingIds.add(message.id));

      const waPreviews: MessagePreview[] = waMessages
        .filter((msg) => !existingIds.has(msg.id))
        .map((msg) => ({
          id: msg.id,
          sender: msg.sender,
          target: msg.recipient,
          intent: "WhatsApp",
          subject: "WhatsApp conversation",
          summary: msg.body,
          channel: "WhatsApp",
          date: new Date(msg.created_at).toLocaleString(),
          direction: msg.direction === "outbound" ? "outbound" : "inbound",
          read: msg.direction === "outbound",
          thread: [
            {
              id: `t_${msg.id}`,
              sender: msg.direction === "outbound" ? "agent" : "user",
              content: msg.body,
              time: new Date(msg.created_at).toLocaleTimeString(),
            },
          ],
        }));

      const merged = [...emailPreviews, ...waPreviews, ...refreshedExisting];
      addedCount = emailPreviews.length + waPreviews.length;
      if (addedCount > 0 || updatedCount > 0) {
        saveInboxMessages(merged);
      }
      const hydratedMessages = getInboxMessages();
      setMessages(hydratedMessages);
      if (!activeMessageIdRef.current && hydratedMessages.length > 0) {
        setActiveMessageId(hydratedMessages[0].id);
      }

      if (!silent) {
        if (failures.length > 0) {
          notify(`${failures.join(" | ")}. Imported ${addedCount} new message(s).`, "warning", "Sync completed with warnings");
        } else {
          notify(`Imported ${addedCount} new message(s).`, "success", "Inbox synced");
        }
      }
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchClients()
      .then((clients) => {
        setWaClients(clients);
        const onlineClient = clients.find((c) => c.status === "online");
        if (onlineClient) setSelectedClientId(onlineClient.id);
        else if (clients.length > 0) setSelectedClientId(clients[0].id);
      })
      .catch(console.error);

    setCustomers(getCustomers());
    const initialMessages = getInboxMessages();
    setMessages(initialMessages);
    if (initialMessages.length > 0) {
      setActiveMessageId(initialMessages[0].id);
    }

    Promise.allSettled([
      loadEmailConfigurationFromServer(),
      loadInboxMessagesFromServer(),
    ])
      .then((results) => {
        const inboxResult = results[1];
        if (inboxResult.status === "fulfilled") {
          setMessages(inboxResult.value);
          if (inboxResult.value.length > 0) {
            setActiveMessageId((current) => current || inboxResult.value[0].id);
          }
        }
      })
      .then(() => syncInboxMessages(true))
      .catch(console.error);
  }, []);

  const activeMessage =
    messages.find((m) => m.id === activeMessageId) || messages[0] || null;

  // Load draft when switching messages
  useEffect(() => {
    setReplyText(drafts[activeMessageId] || "");
    if (activeMessage && activeMessage.channel === "Email") {
      setReplyTo(activeMessage.sender ? [activeMessage.sender] : []);
      setReplyCc([]);
      setReplyBcc([]);
      setReplyShowCc(false);
      setReplyShowBcc(false);
      setReplyScheduleDate("");
      setReplyScheduleTime("");
      setShowReplySchedule(false);
    } else {
      setReplyScheduleDate("");
      setReplyScheduleTime("");
      setShowReplySchedule(false);
    }
  }, [activeMessageId]);

  // Scroll to bottom when thread changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeMessage?.thread]);

  useEffect(() => {
    localStorage.setItem(INBOX_INSIGHTS_KEY, JSON.stringify(inboxInsights));
  }, [inboxInsights]);

  useEffect(() => {
    localStorage.setItem(SENDER_ANALYSIS_PREFS_KEY, JSON.stringify(senderAnalysisPrefs));
  }, [senderAnalysisPrefs]);

  useEffect(() => {
    if (!activeMessage) return;
    if (activeMessage.direction === "outbound" || activeMessage.intent === "Outbound") return;
    const key = senderPreferenceKey(activeMessage.sender);
    if (senderAnalysisPrefs[key] || checkedSenderPrefKeys.has(key) || loadingSenderPrefKey === key) return;
    const loadSenderPreference = async () => {
      setLoadingSenderPrefKey(key);
      try {
        const res = await fetch(`/api/ai/inbox-sender-analysis-pref?sender=${encodeURIComponent(activeMessage.sender)}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.preference) {
          setSenderAnalysisPrefs((prev) => ({ ...prev, [key]: data.preference }));
        }
      } catch (err) {
        console.warn("Failed to load sender analysis preference", err);
      } finally {
        setCheckedSenderPrefKeys((prev) => new Set(prev).add(key));
        setLoadingSenderPrefKey((current) => current === key ? null : current);
      }
    };
    loadSenderPreference();
  }, [activeMessage?.sender, checkedSenderPrefKeys, loadingSenderPrefKey, senderAnalysisPrefs]);

  async function handleAnalyzeInboxMessage(force = false, targetMessage = activeMessage) {
    if (!targetMessage) return;
    if (!force && inboxInsights[targetMessage.id]) return;
    const messageId = targetMessage.id;
    setAnalyzingMessageId(messageId);
    setInsightErrors((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
    try {
      const modelProfile = getModelProfiles()[0];
      const res = await fetch("/api/ai/inbox-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          subject: targetMessage.subject,
          sender: targetMessage.sender,
          channel: targetMessage.channel,
          message: targetMessage.summary,
          systemLanguage: language,
          modelProfile,
          force,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `AI analysis failed with HTTP ${res.status}.`);
      setInboxInsights((prev) => ({ ...prev, [messageId]: data }));
      setCheckedInsightIds((prev) => new Set(prev).add(messageId));
    } catch (err) {
      setInsightErrors((prev) => ({
        ...prev,
        [messageId]: err instanceof Error ? err.message : "AI analysis failed.",
      }));
      setCheckedInsightIds((prev) => new Set(prev).add(messageId));
    } finally {
      setAnalyzingMessageId((current) => current === messageId ? null : current);
    }
  }

  useEffect(() => {
    if (
      !activeMessage ||
      activeMessage.direction === "outbound" ||
      activeMessage.intent === "Outbound" ||
      inboxInsights[activeMessage.id] ||
      checkedInsightIds.has(activeMessage.id) ||
      loadingInsightId === activeMessage.id
    ) return;
    const messageId = activeMessage.id;
    const senderKey = senderPreferenceKey(activeMessage.sender);
    if (!senderAnalysisPrefs[senderKey] && !checkedSenderPrefKeys.has(senderKey)) return;
    const senderMode = senderAnalysisPrefs[senderKey]?.mode || "auto";
    const loadPersistedInsight = async () => {
      setLoadingInsightId(messageId);
      try {
        const res = await fetch(`/api/ai/inbox-insights/${encodeURIComponent(messageId)}`);
        if (res.status === 404) return;
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.insight) {
          setInboxInsights((prev) => ({ ...prev, [messageId]: data.insight }));
        } else if (senderMode === "auto") {
          await handleAnalyzeInboxMessage(false, activeMessage);
        }
      } catch (err) {
        console.warn("Failed to load persisted inbox insight", err);
      } finally {
        setCheckedInsightIds((prev) => new Set(prev).add(messageId));
        setLoadingInsightId((current) => current === messageId ? null : current);
      }
    };
    loadPersistedInsight();
  }, [activeMessage?.id, checkedInsightIds, checkedSenderPrefKeys, inboxInsights, loadingInsightId, senderAnalysisPrefs]);

  const updateSenderAnalysisMode = async (sender: string, mode: SenderAnalysisMode) => {
    const key = senderPreferenceKey(sender);
    const preference = { sender, mode, updatedAt: new Date().toISOString() };
    setSenderAnalysisPrefs((prev) => ({ ...prev, [key]: preference }));
    setCheckedSenderPrefKeys((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/ai/inbox-sender-analysis-pref", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to save sender preference with HTTP ${res.status}.`);
      if (data.preference) {
        setSenderAnalysisPrefs((prev) => ({ ...prev, [key]: data.preference }));
      }
      if (mode === "auto" && activeMessage && senderPreferenceKey(activeMessage.sender) === key && !inboxInsights[activeMessage.id]) {
        setCheckedInsightIds((prev) => {
          const next = new Set(prev);
          next.delete(activeMessage.id);
          return next;
        });
        await handleAnalyzeInboxMessage(false, activeMessage);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to save sender analysis preference.", "error", "Preference save failed");
    }
  };

  const setScheduleDefaults = () => {
    setReplyScheduleDate("");
    setReplyScheduleTime("");
    setShowReplySchedule(false);
  };

  const handleSend = async () => {
    const replyPlainText = stripHtml(replyText);
    if (!replyPlainText || !activeMessage) return;
    setIsSending(true);

    const isScheduled =
      showReplySchedule && replyScheduleDate && replyScheduleTime;

    try {
    if (isScheduled) {
        notify("Scheduled sending requires a real backend scheduler. Send immediately or configure a scheduler endpoint first.", "warning", "Scheduler not configured");
        return;
      }

      if (activeMessage.channel === "WhatsApp") {
        await sendMessage(activeMessage.target, replyPlainText, selectedClientId);
        addOutboundMessage({
          sender: "agent",
          target: activeMessage.target,
          intent: "Outbound",
          subject: activeMessage.subject,
          summary: replyPlainText.slice(0, 140),
          channel: "WhatsApp",
          thread: [
            {
              id: `t_${Date.now()}`,
              sender: "agent",
              content: replyPlainText,
              time: new Date().toLocaleTimeString(),
            },
          ],
        });
      } else {
        await sendEmail(
          "default",
          replyTo.length > 0 ? replyTo.join(", ") : activeMessage.sender,
          `Re: ${activeMessage.subject}`,
          replyPlainText,
          replyText,
        );
        addOutboundMessage({
          sender: "agent@example.com",
          target: replyTo.length > 0 ? replyTo.join(", ") : activeMessage.sender,
          intent: "Outbound",
          subject: `Re: ${activeMessage.subject}`,
          summary: replyPlainText.slice(0, 140),
          channel: "Email",
          thread: [
            {
              id: `t_${Date.now()}`,
              sender: "agent",
              content: replyPlainText,
              htmlContent: replyText,
              time: new Date().toLocaleTimeString(),
            },
          ],
        });
      }

      addDraftToThread(activeMessage.id, replyPlainText);
      setMessages(getInboxMessages());

      setReplyText("");
      setDrafts((prev) => {
        const newDrafts = { ...prev };
        delete newDrafts[activeMessage.id];
        return newDrafts;
      });
      setScheduleDefaults();
    } catch (e: any) {
      notify(`Error sending: ${e.message}`, "error", "Send failed");
    } finally {
      setIsSending(false);
    }
  };

  const handleAddComment = (
    content: string,
    attachments: Attachment[],
    parentId?: string,
  ) => {
    if (!activeMessage) return;
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

    let newComments = [...(activeMessage.comments || [])];
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

    updateInboxMessage(activeMessage.id, { comments: newComments });
    setMessages(getInboxMessages());
  };

  const handleConfirmDeleteMessage = () => {
    if (!deletingMessageId) return;

    deleteInboxMessage(deletingMessageId);
    const nextMessages = getInboxMessages();
    setMessages(nextMessages);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[deletingMessageId];
      return next;
    });
    setInboxInsights((prev) => {
      const next = { ...prev };
      delete next[deletingMessageId];
      return next;
    });
    setInsightErrors((prev) => {
      const next = { ...prev };
      delete next[deletingMessageId];
      return next;
    });
    setCheckedInsightIds((prev) => {
      const next = new Set(prev);
      next.delete(deletingMessageId);
      return next;
    });
    fetch(`/api/ai/inbox-insights/${encodeURIComponent(deletingMessageId)}`, {
      method: "DELETE",
    }).catch(console.error);

    if (activeMessageId === deletingMessageId) {
      setActiveMessageId(nextMessages[0]?.id || "");
      setIsCommentsOpen(false);
      setReplyText("");
    }

    setDeletingMessageId(null);
  };

  const activeMessageIdRef = useRef(activeMessageId);
  useEffect(() => {
    activeMessageIdRef.current = activeMessageId;
  }, [activeMessageId]);

  const handleDraftAIReply = async () => {
    if (!activeMessage) return;
    const msgId = activeMessage.id;
    setIsDrafting(true);
    // Don't clear to empty, instead clear current if it's the active one
    if (activeMessageIdRef.current === msgId) {
      setReplyText("");
    }

    // Retrieve preferred language if available
    const customer = getCustomers().find(
      (c) => c.id === activeMessage.customerId,
    );
    const prefLanguage = customer?.preferredLanguage || "en";
    const currentSystemLanguage = language;

    try {
      const res = await fetch("/api/ai/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: activeMessage.summary,
          intent: activeMessage.intent,
          preferredLanguage: prefLanguage,
          systemLanguage: currentSystemLanguage,
        }),
      });
      const data = await res.json();
      const reply = data.reply || "Failed to generate reply.";

      setDrafts((prev) => ({ ...prev, [msgId]: reply }));
      if (activeMessageIdRef.current === msgId) {
        setReplyText(reply);
        startReply(activeMessage, editorHtml(reply));
      }
    } catch (err) {
      console.error(err);
      const errorMsg = "Error reaching AI endpoint.";
      setDrafts((prev) => ({ ...prev, [msgId]: errorMsg }));
      if (activeMessageIdRef.current === msgId) {
        setReplyText(errorMsg);
      }
    } finally {
      setIsDrafting(false);
    }
  };

  const mailboxMessages = messages.filter((msg) =>
    selectedMailbox === "sent"
      ? msg.direction === "outbound" || msg.intent === "Outbound"
      : msg.direction !== "outbound" && msg.intent !== "Outbound",
  );

  const filteredMessages = mailboxMessages.filter((msg) => {
    const q = searchQuery.toLowerCase();
    return (
      msg.subject.toLowerCase().includes(q) ||
      msg.summary.toLowerCase().includes(q) ||
      msg.sender.toLowerCase().includes(q) ||
      msg.target.toLowerCase().includes(q) ||
      (msg.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });

  const switchMailbox = (mailbox: "inbox" | "sent") => {
    setSelectedMailbox(mailbox);
    setActiveTab("inbox");
    const nextMessage = messages.find((msg) =>
      mailbox === "sent"
        ? msg.direction === "outbound" || msg.intent === "Outbound"
        : msg.direction !== "outbound" && msg.intent !== "Outbound",
    );
    setActiveMessageId(nextMessage?.id || "");
  };

  return (
    <div className="flex h-full flex-col lg:flex-row bg-white dark:bg-black/20">
      {/* List */}
      <div className="w-full lg:w-[400px] border-r border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 flex flex-col h-full shrink-0">
        <div className="p-6 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#050608]">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              {t("inbox.title")}
            </h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  resetCompose();
                  setActiveTab("compose");
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 dark:border-blue-500/30"
                title={language === "zh" ? "写邮件" : "Compose email"}
                aria-label={language === "zh" ? "写邮件" : "Compose email"}
              >
                <SquarePen className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => syncInboxMessages(false)}
                disabled={isSyncing}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                title={language === "zh" ? "同步邮件和 WhatsApp 消息" : "Sync Email and WhatsApp messages"}
                aria-label={language === "zh" ? "同步邮件和 WhatsApp 消息" : "Sync Email and WhatsApp messages"}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => switchMailbox("inbox")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                selectedMailbox === "inbox"
                  ? "border-blue-200 bg-white text-blue-600 shadow-sm dark:border-blue-500/30 dark:bg-slate-800 dark:text-blue-400"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              <InboxTray className="h-4 w-4" />
              {language === "zh" ? "收件箱" : "Inbox"}
            </button>
            <button
              type="button"
              onClick={() => switchMailbox("sent")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                selectedMailbox === "sent"
                  ? "border-blue-200 bg-white text-blue-600 shadow-sm dark:border-blue-500/30 dark:bg-slate-800 dark:text-blue-400"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              <Send className="h-4 w-4" />
              {language === "zh" ? "发件箱" : "Sent"}
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={t("inbox.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500/50 focus:bg-white dark:focus:bg-white/10 outline-none transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredMessages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {selectedMailbox === "sent" ? (
                <>
                  <Send className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <p>{language === "zh" ? "发件箱暂无邮件" : "No sent messages yet"}</p>
                </>
              ) : (
                <>
                  <InboxTray className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <p>{language === "zh" ? "收件箱暂无邮件" : "No inbox messages yet"}</p>
                </>
              )}
            </div>
          )}
          {filteredMessages.map((msg) => (
            <div
              key={msg.id}
              onClick={() => handleSelectMessage(msg)}
              className={cn(
                "p-5 border-b border-slate-200 dark:border-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors relative",
                activeMessageId === msg.id &&
                  "bg-blue-50/50 dark:bg-white/[0.06]",
              )}
            >
              {activeMessageId === msg.id && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
              )}
              {selectedMailbox === "inbox" && !msg.read && (
                <div className="absolute right-4 top-5 w-2 h-2 rounded-full bg-blue-500"></div>
              )}
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 max-w-[80%]">
                  {msg.channel === "Email" ? (
                    <Mail className="w-4 h-4 text-slate-400" />
                  ) : (
                    <MessageCircle className="w-4 h-4 text-emerald-500" />
                  )}
                  <span
                    className={cn(
                      "text-sm truncate",
                      !msg.read
                        ? "font-semibold text-slate-900 dark:text-white"
                        : "font-medium text-slate-600 dark:text-slate-300",
                    )}
                  >
                    {selectedMailbox === "sent" ? `To: ${msg.target}` : customers.find((c) =>
                      c.contacts?.some(
                        (contact) =>
                          contact.value.toLowerCase() ===
                          msg.sender.toLowerCase(),
                      ),
                    )?.name || msg.sender}
                  </span>
                </div>
              </div>
              <h3
                className={cn(
                  "text-sm mb-1.5 whitespace-normal break-words",
                  !msg.read
                    ? "font-semibold text-slate-800 dark:text-slate-200"
                    : "text-slate-700 dark:text-slate-300",
                )}
                title={msg.subject}
              >
                {msg.subject}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2">
                {msg.summary}
              </p>

              {msg.tags && msg.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {msg.tags.map((t) => (
                    <span
                      key={t}
                      className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20 rounded text-[10px] font-mono tracking-widest uppercase">
                    {msg.intent}
                  </span>
                  {msg.assignee && (
                    <span className="px-2 py-1 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 rounded text-[10px] font-mono">
                      {msg.assignee.split(" ")[0]}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-slate-400">
                    {msg.date}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingMessageId(msg.id);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    title="Delete message"
                    aria-label="Delete message"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail View / Compose View */}
      <div className="flex-1 bg-white dark:bg-[#050608] flex flex-col h-full min-w-0">
        {activeTab === "compose" ? (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              {composeMode === "reply" ? "Reply Mail" : composeMode === "forward" ? "Forward Mail" : "Compose Mail"}
            </h2>
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-4">
                  <label className="w-16 shrink-0 mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    To
                  </label>
                  <div className="flex-1">
                    <TaggedEmailInput
                      value={composeTo}
                      onChange={(next) => {
                        setComposeTo(next);
                        if (next[0] && next[0] !== composeTo[0]) applySignatureForRecipient(next[0]);
                      }}
                      customers={customers}
                      placeholder="Type @name or email..."
                    />
                  </div>
                  <div className="flex gap-2 shrink-0 mt-2">
                    <button
                      className={cn(
                        "text-xs font-medium hover:text-blue-500",
                        showCc
                          ? "text-blue-500"
                          : "text-slate-500 dark:text-slate-400",
                      )}
                      onClick={() => setShowCc(!showCc)}
                    >
                      Cc
                    </button>
                    <button
                      className={cn(
                        "text-xs font-medium hover:text-blue-500",
                        showBcc
                          ? "text-blue-500"
                          : "text-slate-500 dark:text-slate-400",
                      )}
                      onClick={() => setShowBcc(!showBcc)}
                    >
                      Bcc
                    </button>
                  </div>
                </div>
                {showCc && (
                  <div className="flex items-start gap-4">
                    <label className="w-16 shrink-0 mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      Cc
                    </label>
                    <div className="flex-1">
                      <TaggedEmailInput
                        value={composeCc}
                        onChange={setComposeCc}
                        customers={customers}
                        placeholder="Type @name or email..."
                      />
                    </div>
                    <div className="w-[52px]"></div>
                  </div>
                )}
                {showBcc && (
                  <div className="flex items-start gap-4">
                    <label className="w-16 shrink-0 mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      Bcc
                    </label>
                    <div className="flex-1">
                      <TaggedEmailInput
                        value={composeBcc}
                        onChange={setComposeBcc}
                        customers={customers}
                        placeholder="Type @name or email..."
                      />
                    </div>
                    <div className="w-[52px]"></div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <label className="w-16 shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Subject
                </label>
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="Email Subject"
                    className="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                  />
                  <button
                    onClick={handleAIGenerateSubject}
                    title="Generate Subject"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-full transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                </div>
                <div className="w-[52px]"></div>
              </div>
              <div className="flex items-start gap-4">
                <label className="w-16 shrink-0 mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Signature
                </label>
                <div className="flex-1">
                  <select
                    value={composeSignatureId}
                    onChange={(e) => {
                      const signatureId = e.target.value;
                      const signature = getEmailSignatures().find((item) => item.id === signatureId);
                      setComposeSignatureId(signatureId);
                      setComposeSignatureHtml(signature?.html || "");
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                  >
                    <option value="">No signature</option>
                    {getEmailSignatures().map((signature) => (
                      <option key={signature.id} value={signature.id}>{signature.name}</option>
                    ))}
                  </select>
                </div>
                <div className="w-[52px]"></div>
              </div>
              <div className="flex-1 flex flex-col min-h-[300px] mt-4 relative">
                <button
                  onClick={handleAIGenerateBody}
                  title="Generate Content"
                  className="absolute top-12 right-3 p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors z-10 shadow-sm border border-blue-200 dark:border-blue-800"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
                <RichTextEditor
                  value={composeBody}
                  onChange={setComposeBody}
                  placeholder="Type your message here..."
                  className="flex-1 min-h-[300px]"
                />

                {/* Attachments Area */}
                {composeAttachments.length > 0 && (
                  <div className="absolute bottom-16 left-4 right-4 flex flex-wrap gap-2">
                    {composeAttachments.map((file, idx) => (
                      <span
                        key={idx}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs shadow-sm"
                      >
                        <Paperclip className="w-3 h-3 text-slate-400" />
                        <span className="max-w-[120px] truncate">
                          {file.name}
                        </span>
                        <span className="text-slate-400 text-[10px]">
                          ({Math.round(file.size / 1024)}kb)
                        </span>
                        <button
                          onClick={() =>
                            setComposeAttachments(
                              composeAttachments.filter((_, i) => i !== idx),
                            )
                          }
                          className="ml-1 text-slate-400 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="absolute bottom-3 left-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                    title="Attach File"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                  />
                </div>
              </div>
              {composeOriginalMessage && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  <div className="mb-2 font-semibold text-slate-800 dark:text-slate-100">Original email</div>
                  <div className="mb-1">From: {composeOriginalMessage.sender}</div>
                  <div className="mb-1">To: {composeOriginalMessage.target}</div>
                  <div className="mb-3">Subject: {composeOriginalMessage.subject}</div>
                  <div className="max-h-56 overflow-y-auto rounded-lg bg-white p-3 dark:bg-black/20">
                    {composeOriginalMessage.thread?.[0]?.htmlContent ? (
                      <iframe title="original-email" sandbox="" srcDoc={composeOriginalMessage.thread[0].htmlContent} className="h-48 w-full rounded bg-white" />
                    ) : (
                      <p className="whitespace-pre-wrap">{composeOriginalMessage.thread?.[0]?.content || composeOriginalMessage.summary}</p>
                    )}
                  </div>
                </div>
              )}
              <div className="pt-4 flex justify-between items-center border-t border-slate-200 dark:border-white/10 mt-6">
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setShowComposeSchedule(!showComposeSchedule)}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      showComposeSchedule
                        ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5",
                    )}
                    title="Schedule Send"
                  >
                    <Calendar className="w-5 h-5" />
                  </button>
                  {showComposeSchedule && (
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={composeScheduleDate}
                        onChange={(e) => setComposeScheduleDate(e.target.value)}
                        className="px-3 py-1.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200"
                      />
                      <input
                        type="time"
                        value={composeScheduleTime}
                        onChange={(e) => setComposeScheduleTime(e.target.value)}
                        className="px-3 py-1.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleCancelCompose}
                    className="px-6 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors border border-transparent"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleComposeSend}
                    disabled={isSending || !composeTo.length || !composeSubject.trim() || !stripHtml(composeBody)}
                    className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {isSending ? "Sending..." : showComposeSchedule ? "Schedule" : "Send"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : activeMessage ? (
          <>
            {/* Detail Header */}
            <div className="p-6 border-b border-slate-200 dark:border-white/10 flex justify-between items-start shrink-0 bg-slate-50/50 dark:bg-black/20">
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex items-start gap-3 mb-2">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight whitespace-normal break-words leading-snug" title={activeMessage.subject}>
                    {activeMessage.subject}
                  </h2>
                  <span className="px-2 py-1 bg-white dark:bg-white/10 shadow-sm border border-slate-200 dark:border-white/20 text-slate-700 dark:text-slate-300 rounded text-[10px] font-mono tracking-widest uppercase shrink-0">
                    {activeMessage.intent}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>From:</span>
                  {(() => {
                    const c = customers.find((c) =>
                      c.contacts?.some(
                        (contact) =>
                          contact.value.toLowerCase() ===
                          activeMessage.sender.toLowerCase(),
                      ),
                    );
                    return c ? (
                      <Link
                        to={`/customers/${c.id}`}
                        className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 flex items-center gap-1"
                      >
                        <User className="w-3 h-3" />
                        {c.name}{" "}
                        <span className="text-slate-400 dark:text-slate-500 no-underline text-xs">
                          ({activeMessage.sender})
                        </span>
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {activeMessage.sender}
                      </span>
                    );
                  })()}
                  {activeMessage.target && (
                    <span className="ml-2">
                      To:{" "}
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {activeMessage.target}
                      </span>
                    </span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  {(activeMessage.tags || []).map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 rounded text-[10px] font-medium flex items-center gap-1"
                    >
                      {tag}
                      <button
                        onClick={() => {
                          const newTags = activeMessage.tags?.filter(
                            (_, i) => i !== idx,
                          );
                          updateInboxMessage(activeMessage.id, {
                            tags: newTags,
                          });
                          setMessages(getInboxMessages());
                        }}
                        className="hover:text-amber-500 ml-1"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  <input
                    placeholder="Add tag..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = e.currentTarget.value.trim();
                        if (val && !(activeMessage.tags || []).includes(val)) {
                          const newTags = [...(activeMessage.tags || []), val];
                          updateInboxMessage(activeMessage.id, {
                            tags: newTags,
                          });
                          setMessages(getInboxMessages());
                          e.currentTarget.value = "";
                        }
                      }
                    }}
                    className="w-32 px-2 py-1 bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded text-[10px] outline-none focus:border-blue-500 transition-colors placeholder:text-slate-400 dark:text-slate-200"
                  />
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setDeletingMessageId(activeMessage.id)}
                  className="px-3 py-2 border rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors bg-white border-slate-200 text-slate-600 hover:text-red-600 hover:bg-red-50 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:text-red-400 dark:hover:bg-red-500/10"
                  title="Delete message"
                  aria-label="Delete message"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => startReply(activeMessage)}
                  className="px-3 py-2 border rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors bg-white border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:text-blue-400 dark:hover:bg-blue-500/10"
                  title="Reply"
                >
                  <Reply className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => startForward(activeMessage)}
                  className="px-3 py-2 border rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors bg-white border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:text-blue-400 dark:hover:bg-blue-500/10"
                  title="Forward"
                >
                  <Forward className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsCommentsOpen(!isCommentsOpen)}
                  className={cn(
                    "px-3 py-2 border rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors",
                    isCommentsOpen
                      ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10",
                  )}
                >
                  <MessageCircle className="w-4 h-4" />
                  Internal ({activeMessage.comments?.length || 0})
                </button>
                {activeMessage.channel === "WhatsApp" &&
                  waClients.length > 0 && (
                    <select
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className="px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg outline-none shadow-sm cursor-pointer"
                    >
                      {waClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.status})
                        </option>
                      ))}
                    </select>
                  )}
                <div className="relative">
                  <select
                    value={activeMessage.assignee || ""}
                    onChange={(e) => {
                      const newAssignee = e.target.value;
                      const updatedMsgs = messages.map((m) =>
                        m.id === activeMessage.id
                          ? { ...m, assignee: newAssignee }
                          : m,
                      );
                      setMessages(updatedMsgs);
                      updateInboxMessage(activeMessage.id, {
                        assignee: newAssignee,
                      });
                    }}
                    className="appearance-none pr-8 px-4 py-2 bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 border border-slate-200 dark:border-white/20 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer outline-none w-[160px]"
                  >
                    <option value="" disabled>
                      {t("inbox.assign")}
                    </option>
                    <option value="Alice Chen">Alice Chen (Sales)</option>
                    <option value="Bob Smith">Bob Smith (Sales)</option>
                    <option value="Charlie Davis">
                      Charlie Davis (Support)
                    </option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex">
              <div className="flex-1 flex flex-col min-w-0">
                {/* Conversation Area */}
                <div
                  ref={scrollRef}
                  className="flex-1 p-6 overflow-y-auto space-y-6"
                >
                  {activeMessage.thread.map((tMsg) => (
                    <div
                      key={tMsg.id}
                      className={cn(
                        "flex flex-col",
                        tMsg.htmlContent ? "max-w-full" : "max-w-[85%]",
                        tMsg.sender === "agent" && !tMsg.htmlContent ? "ml-auto" : "",
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-slate-500">
                          {tMsg.sender === "agent"
                            ? "You"
                            : activeMessage.sender}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {tMsg.time}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "p-4 rounded-2xl text-sm leading-relaxed",
                          tMsg.htmlContent
                            ? "bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 rounded-tl-sm border border-slate-200 dark:border-white/5"
                            : tMsg.sender === "agent"
                            ? "bg-blue-600 text-white rounded-tr-sm"
                            : "bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 rounded-tl-sm border border-slate-200 dark:border-white/5",
                        )}
                      >
                        {tMsg.htmlContent ? (
                          <iframe
                            title={`email-${tMsg.id}`}
                            sandbox=""
                            srcDoc={tMsg.htmlContent}
                            className="w-full h-[520px] rounded-lg bg-white border border-slate-200"
                          />
                        ) : (
                          tMsg.content.split("\n").map((line, i) => (
                            <span key={i}>
                              {line}
                              <br />
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  ))}

                  {/* AI Insights Card (injecting inline if latest message is from user) */}
                  {(activeMessage.thread[activeMessage.thread.length - 1]
                    .sender === "user" ||
                    activeMessage.direction === "outbound" ||
                    activeMessage.intent === "Outbound") && (
                    <div className="max-w-[85%] mt-6">
                      <div className="bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/20 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <h3 className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2">
                            <Bot className="w-4 h-4 text-blue-500" />
                            {t("inbox.aiInsights")}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAnalyzeInboxMessage(Boolean(inboxInsights[activeMessage.id]))}
                            disabled={analyzingMessageId === activeMessage.id}
                            className="px-3 py-1.5 bg-white dark:bg-white/5 border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                          >
                            {analyzingMessageId === activeMessage.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            {inboxInsights[activeMessage.id]
                              ? language === "zh" ? "重新分析" : "Reanalyze"
                              : language === "zh" ? "分析" : "Analyze"}
                          </button>
                          {activeMessage.direction === "outbound" || activeMessage.intent === "Outbound" ? (
                            <span className="px-3 py-1.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium shadow-sm">
                              {language === "zh" ? "默认手动分析" : "Manual by default"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const key = senderPreferenceKey(activeMessage.sender);
                                const currentMode = senderAnalysisPrefs[key]?.mode || "auto";
                                updateSenderAnalysisMode(activeMessage.sender, currentMode === "auto" ? "manual" : "auto");
                              }}
                              className="px-3 py-1.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/10 transition-colors shadow-sm"
                            >
                              {(senderAnalysisPrefs[senderPreferenceKey(activeMessage.sender)]?.mode || "auto") === "auto"
                                ? language === "zh" ? "发件人：自动分析" : "Sender: Auto"
                                : language === "zh" ? "发件人：手动分析" : "Sender: Manual"}
                            </button>
                          )}
                          </div>
                        </div>
                        {analyzingMessageId === activeMessage.id ? (
                          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                            {language === "zh" ? "正在分析当前消息..." : "Analyzing this message..."}
                          </div>
                        ) : insightErrors[activeMessage.id] ? (
                          <div className="text-sm text-red-600 dark:text-red-300">
                            {insightErrors[activeMessage.id]}
                          </div>
                        ) : inboxInsights[activeMessage.id] ? (
                          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <div className="rounded-lg bg-white/70 dark:bg-white/5 border border-blue-100 dark:border-blue-500/10 p-3">
                                <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">{language === "zh" ? "意图" : "Intent"}</div>
                                <div className="font-semibold text-blue-700 dark:text-blue-300">{inboxInsights[activeMessage.id].intent}</div>
                              </div>
                              <div className="rounded-lg bg-white/70 dark:bg-white/5 border border-blue-100 dark:border-blue-500/10 p-3">
                                <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">{language === "zh" ? "优先级" : "Priority"}</div>
                                <div className="font-semibold text-slate-800 dark:text-slate-100">{inboxInsights[activeMessage.id].priority}</div>
                              </div>
                              <div className="rounded-lg bg-white/70 dark:bg-white/5 border border-blue-100 dark:border-blue-500/10 p-3">
                                <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">{language === "zh" ? "风险" : "Risk"}</div>
                                <div className="font-semibold text-slate-800 dark:text-slate-100">{inboxInsights[activeMessage.id].risk}</div>
                              </div>
                            </div>
                            <p>{inboxInsights[activeMessage.id].customerNeed}</p>
                            <ul className="space-y-2">
                              {inboxInsights[activeMessage.id].recommendedActions.map((action, index) => (
                                <li key={index} className="flex gap-2">
                                  <CornerDownRight className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                  <span>{action}</span>
                                </li>
                              ))}
                            </ul>
                            {inboxInsights[activeMessage.id].replyGuidance.length > 0 && (
                              <div className="pt-3 border-t border-blue-200 dark:border-blue-500/10">
                                <div className="text-xs font-semibold text-slate-500 mb-2">{language === "zh" ? "回复要点" : "Reply Guidance"}</div>
                                <ul className="space-y-1">
                                  {inboxInsights[activeMessage.id].replyGuidance.map((point, index) => (
                                    <li key={index}>- {point}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {inboxInsights[activeMessage.id].model && (
                              <div className="text-[10px] text-slate-400">
                                {inboxInsights[activeMessage.id].provider} / {inboxInsights[activeMessage.id].model}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-600 dark:text-slate-300">
                            {language === "zh"
                              ? "点击分析按钮后，系统会使用已配置的模型分析当前消息。"
                              : "Click Analyze to run the configured model on this message."}
                          </div>
                        )}
                        <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-500/10">
                          <button
                            onClick={handleDraftAIReply}
                            disabled={isDrafting}
                            className="px-4 py-2 bg-white dark:bg-white/5 border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                          >
                            {isDrafting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : null}
                            {isDrafting ? "Drafting..." : "Draft AI Reply"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Reply Area */}
                {false && <div className="p-4 md:p-6 border-t border-slate-200 dark:border-white/10 shrink-0 bg-slate-50 dark:bg-black/20">
                  <div className="bg-white dark:bg-white/5 shadow-sm border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden focus-within:border-blue-500/50 focus-within:shadow-[0_0_0_1px_rgba(59,130,246,0.3)] transition-all">
                    {activeMessage.channel === "Email" && (
                      <div className="border-b border-slate-200 dark:border-white/10 p-3 bg-slate-50/50 dark:bg-black/40 flex flex-col gap-2">
                        <div className="flex items-start gap-3">
                          <label className="text-xs font-semibold text-slate-500 w-8 mt-1.5 shrink-0">
                            To:
                          </label>
                          <div className="flex-1">
                            <TaggedEmailInput
                              value={replyTo}
                              onChange={setReplyTo}
                              customers={customers}
                              placeholder="Add recipient..."
                            />
                          </div>
                          <div className="flex gap-2 text-xs shrink-0 mt-1.5">
                            <button
                              className={cn(
                                "font-medium hover:text-blue-500",
                                replyShowCc
                                  ? "text-blue-500"
                                  : "text-slate-500",
                              )}
                              onClick={() => setReplyShowCc(!replyShowCc)}
                            >
                              Cc
                            </button>
                            <button
                              className={cn(
                                "font-medium hover:text-blue-500",
                                replyShowBcc
                                  ? "text-blue-500"
                                  : "text-slate-500",
                              )}
                              onClick={() => setReplyShowBcc(!replyShowBcc)}
                            >
                              Bcc
                            </button>
                          </div>
                        </div>
                        {replyShowCc && (
                          <div className="flex items-start gap-3">
                            <label className="text-xs font-semibold text-slate-500 w-8 mt-1.5 shrink-0">
                              Cc:
                            </label>
                            <div className="flex-1">
                              <TaggedEmailInput
                                value={replyCc}
                                onChange={setReplyCc}
                                customers={customers}
                                placeholder="Add cc..."
                              />
                            </div>
                            <div className="w-[52px]" />
                          </div>
                        )}
                        {replyShowBcc && (
                          <div className="flex items-start gap-3">
                            <label className="text-xs font-semibold text-slate-500 w-8 mt-1.5 shrink-0">
                              Bcc:
                            </label>
                            <div className="flex-1">
                              <TaggedEmailInput
                                value={replyBcc}
                                onChange={setReplyBcc}
                                customers={customers}
                                placeholder="Add bcc..."
                              />
                            </div>
                            <div className="w-[52px]" />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="relative">
                      <button
                        onClick={() => {
                          if (!activeMessage) return;
                          const threadCtx =
                            activeMessage.thread
                              ?.map((m) => m.content)
                              .join("\n") || "";
                          setReplyText(
                            `Thank you for your message.\nRegarding your inquiry:\n${replyText ? "Note: " + replyText : "We are looking into it."}\nLet us know if you need anything else.\nBest,\nSupport Team`,
                          );
                        }}
                        title="AI Assist Generate Reply"
                        className="absolute right-3 top-12 p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors z-10 shadow-sm border border-blue-200 dark:border-blue-800"
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>
                      <RichTextEditor
                        value={replyText}
                        onChange={(text) => {
                          setReplyText(text);
                          if (activeMessage) {
                            setDrafts((prev) => ({
                              ...prev,
                              [activeMessage.id]: text,
                            }));
                          }
                        }}
                        placeholder={t("inbox.placeholder")}
                        className="min-h-[170px] border-0 bg-transparent"
                        editorClassName="pr-14"
                      />
                    </div>
                    <div className="bg-slate-50/50 dark:bg-black/40 p-3 px-4 flex justify-between items-center border-t border-slate-200 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        {activeMessage.channel === "WhatsApp" ? (
                          <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
                            <MessageCircle className="w-4 h-4 text-emerald-500" />
                            Reply via WhatsApp
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
                            <Mail className="w-4 h-4 text-slate-400" />
                            Reply via Email
                          </span>
                        )}
                        <div className="h-4 w-px bg-slate-300 dark:bg-white/10 mx-2" />
                        <button
                          onClick={() =>
                            setShowReplySchedule(!showReplySchedule)
                          }
                          className={cn(
                            "p-1.5 rounded transition-colors text-slate-500",
                            showReplySchedule
                              ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                              : "hover:bg-slate-200 dark:hover:bg-white/10",
                          )}
                          title="Schedule Send"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                        {showReplySchedule && (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={replyScheduleDate}
                              onChange={(e) =>
                                setReplyScheduleDate(e.target.value)
                              }
                              className="px-2 py-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded pt-0.5 pb-0.5 text-xs outline-none focus:border-blue-500"
                            />
                            <input
                              type="time"
                              value={replyScheduleTime}
                              onChange={(e) =>
                                setReplyScheduleTime(e.target.value)
                              }
                              className="px-2 py-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded pt-0.5 pb-0.5 text-xs outline-none focus:border-blue-500"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleSend}
                        disabled={isSending || !stripHtml(replyText)}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
                      >
                        {isSending ? (
                          <span className="flex items-center gap-2">
                            Sending...
                          </span>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            {t("inbox.send")}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>}
              </div>

              {/* Internal Comments Sidebar */}
              {isCommentsOpen && (
                <div className="w-[350px] border-l border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 flex flex-col overflow-hidden shrink-0">
                  <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" /> Internal Discussion
                    </h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <CommentSection
                      comments={activeMessage.comments || []}
                      onAddComment={handleAddComment}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Select a conversation to view details
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={deletingMessageId !== null}
        title="Delete Message"
        message="Are you sure you want to delete this message or email thread? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDeleteMessage}
        onCancel={() => setDeletingMessageId(null)}
      />
    </div>
  );
}

function TaggedEmailInput({
  value,
  onChange,
  customers,
  placeholder,
}: {
  value: string[];
  onChange: (val: string[]) => void;
  customers: Customer[];
  placeholder: string;
}) {
  const [inputVal, setInputVal] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCustomers = customers.filter(
    (c) =>
      inputVal.startsWith("@") &&
      c.name.toLowerCase().includes(inputVal.slice(1).toLowerCase()),
  );

  useEffect(() => {
    if (inputVal.startsWith("@")) {
      setShowDropdown(true);
      setActiveIndex(0);
    } else {
      setShowDropdown(false);
    }
  }, [inputVal]);

  const handleAdd = (email: string) => {
    if (email && !value.includes(email)) {
      onChange([...value, email]);
    }
    setInputVal("");
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      if (showDropdown && filteredCustomers.length > 0) {
        const selected = filteredCustomers[activeIndex];
        const emailToUse =
          selected.contacts?.find((c) => c.type === "Email")?.value ||
          `${selected.name.toLowerCase().replace(" ", ".")}@example.com`;
        handleAdd(`${selected.name} <${emailToUse}>`);
      } else if (inputVal.trim()) {
        handleAdd(inputVal.trim());
      }
    } else if (e.key === "Backspace" && !inputVal) {
      if (value.length > 0) {
        onChange(value.slice(0, -1));
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (showDropdown) {
        setActiveIndex((prev) =>
          Math.min(prev + 1, filteredCustomers.length - 1),
        );
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (showDropdown) {
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      }
    }
  };

  return (
    <div className="relative w-full">
      <div
        className="flex flex-wrap gap-2 items-center w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus-within:border-blue-500 transition-colors cursor-text min-h-[42px]"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, idx) => (
          <span
            key={idx}
            className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded text-sm whitespace-nowrap"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== idx))}
              className="hover:text-blue-500 focus:outline-none"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-slate-900 dark:text-white"
        />
      </div>
      {showDropdown && filteredCustomers.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10 py-1">
          {filteredCustomers.map((c, idx) => {
            const emailToUse =
              c.contacts?.find((contact) => contact.type === "Email")?.value ||
              `${c.name.toLowerCase().replace(" ", ".")}@example.com`;
            return (
              <div
                key={c.id}
                className={cn(
                  "px-4 py-2 cursor-pointer text-sm flex justify-between items-center group",
                  activeIndex === idx
                    ? "bg-slate-100 dark:bg-slate-700"
                    : "hover:bg-slate-50 dark:hover:bg-slate-700/50",
                )}
                onClick={() => handleAdd(`${c.name} <${emailToUse}>`)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-slate-900 dark:text-white">
                    {c.name}
                  </span>
                  <span className="text-slate-500 text-xs">{emailToUse}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  editorClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef("");
  const isEmpty = !stripHtml(value);

  useEffect(() => {
    const nextHtml = editorHtml(value);
    if (editorRef.current && lastHtmlRef.current !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
      lastHtmlRef.current = nextHtml;
    }
  }, [value]);

  const applyCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    const html = editorRef.current?.innerHTML || "";
    lastHtmlRef.current = html;
    onChange(html);
  };

  const handleInput = () => {
    const html = editorRef.current?.innerHTML || "";
    lastHtmlRef.current = html;
    onChange(html);
  };

  const tools = [
    { command: "bold", icon: Bold, label: "Bold" },
    { command: "italic", icon: Italic, label: "Italic" },
    { command: "underline", icon: Underline, label: "Underline" },
    { command: "insertUnorderedList", icon: List, label: "Bulleted list" },
    { command: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
    { command: "removeFormat", icon: RemoveFormatting, label: "Clear formatting" },
  ];

  return (
    <div className={cn("flex flex-col rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5", className)}>
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-1.5 dark:border-white/10">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.command}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              onMouseDown={(event) => {
                event.preventDefault();
                applyCommand(tool.command);
              }}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-blue-600 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-blue-300"
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      <div className="relative min-h-0 flex-1">
        {isEmpty && placeholder && (
          <div className="pointer-events-none absolute left-4 top-3 text-sm text-slate-400 dark:text-slate-500">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          onInput={handleInput}
          className={cn(
            "min-h-[140px] h-full w-full overflow-y-auto px-4 py-3 text-sm leading-relaxed text-slate-900 outline-none dark:text-white",
            "prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-ol:my-2",
            editorClassName,
          )}
        />
      </div>
    </div>
  );
}
