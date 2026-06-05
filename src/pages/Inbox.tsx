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
  Smile,
  Image as ImageIcon,
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
  Tag,
  Star,
  CheckSquare,
  Square,
} from "lucide-react";
import { cn } from "../Layout";
import { useLanguage } from "../i18n";
import { fetchClients, fetchHubMediaBlob, fetchMessages, getConfiguredWaHubActors, parseWaHubActors, resolveHubMediaUrl, sendMessage, WA_HUB_ACTORS_KEY, WaClient, WaHubActor, WaMessage } from "../services/waHub";
import { fetchEmails, sendEmail, getEmailMappings, getEmailSignatures, loadEmailConfigurationFromServer } from "../services/emailSync";
import { getMedias, MediaItem } from "../services/media";
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
  updateCustomer,
} from "../services/db";
import { CommentSection } from "../components/CommentSection";
import ConfirmModal from "../components/ConfirmModal";
import { notify } from "../services/notifications";
import { loadAppSettingsFromServer, saveAppSetting } from "../services/appSettings";

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
type InboxChannelFilter = "all" | "WhatsApp" | "Email";

interface SenderAnalysisPreference {
  sender: string;
  mode: SenderAnalysisMode;
  updatedAt?: string;
}

interface WhatsAppTranslation {
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
  shouldTranslate: boolean;
}

const INBOX_INSIGHTS_KEY = "crm_inbox_ai_insights";
const SENDER_ANALYSIS_PREFS_KEY = "crm_inbox_sender_analysis_prefs";
const LAST_SIGNATURE_BY_RECIPIENT_KEY = "crm_last_email_signature_by_recipient";
const WHATSAPP_CHAT_MOB_MAPPINGS_KEY = "crm_whatsapp_chat_mob_mappings";
const WHATSAPP_AUTO_TRANSLATE_PREFS_KEY = "crm_whatsapp_auto_translate_prefs";
const WHATSAPP_OUTBOUND_AUTO_TRANSLATE_PREFS_KEY = "crm_whatsapp_outbound_auto_translate_prefs";
const WHATSAPP_TRANSLATIONS_KEY = "crm_whatsapp_message_translations";
const BULK_DELETE_SENTINEL = "__bulk_delete__";
const WHATSAPP_EMOJIS = ["😀", "😂", "😊", "😍", "👍", "🙏", "🎉", "🔥", "✅", "💬", "📎", "❤️"];
const CUSTOMER_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh", label: "Chinese" },
  { value: "zh-hant", label: "Traditional Chinese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "id", label: "Indonesian" },
  { value: "th", label: "Thai" },
  { value: "vi", label: "Vietnamese" },
  { value: "tr", label: "Turkish" },
  { value: "ru", label: "Russian" },
];

function loadJsonMap<T>(key: string): Record<string, T> {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function clientsFromActors(clients: WaClient[], actors: WaHubActor[]): WaClient[] {
  if (actors.length === 0) return clients;
  const byId = new Map(clients.map((client) => [client.id, client]));
  return actors.map((actor) => {
    const client = byId.get(actor.clientId);
    return client || {
      id: actor.clientId,
      name: actor.name,
      phone: actor.phone || "",
      status: actor.status === "online" ? "online" : "offline",
    };
  });
}

function defaultWaClientId(clients: WaClient[]) {
  return clients.find((client) => client.status === "online")?.id || clients[0]?.id || "";
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

function extractRecipientValue(recipient: string) {
  const match = recipient.match(/<([^>]+)>/);
  return (match?.[1] || recipient).trim();
}

function normalizeConversationAddress(value = "") {
  return value.trim().toLowerCase().replace(/[^\d+a-z@._-]/g, "");
}

function isWhatsAppChatAddress(value = "") {
  return /@(c\.us|g\.us|lid)$/i.test(value.trim());
}

function normalizeCountry(value = "") {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function languageName(value = "") {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  const map: Record<string, string> = {
    ar: "Arabic",
    cn: "Chinese",
    de: "German",
    en: "English",
    es: "Spanish",
    fr: "French",
    hi: "Hindi",
    id: "Indonesian",
    it: "Italian",
    ja: "Japanese",
    ko: "Korean",
    nl: "Dutch",
    pt: "Portuguese",
    ru: "Russian",
    th: "Thai",
    tr: "Turkish",
    vi: "Vietnamese",
    zh: "Chinese",
    "zh-cn": "Chinese",
    "zh-hans": "Chinese",
    "zh-tw": "Traditional Chinese",
    "zh-hant": "Traditional Chinese",
  };
  return map[normalized] || value.trim();
}

function officialLanguageForCountry(country = "") {
  const map: Record<string, string> = {
    australia: "English",
    brazil: "Portuguese",
    canada: "English",
    china: "Chinese",
    cn: "Chinese",
    france: "French",
    germany: "German",
    hong_kong: "Traditional Chinese",
    india: "Hindi",
    indonesia: "Indonesian",
    italy: "Italian",
    japan: "Japanese",
    malaysia: "Malay",
    mexico: "Spanish",
    netherlands: "Dutch",
    portugal: "Portuguese",
    russia: "Russian",
    saudi_arabia: "Arabic",
    singapore: "English",
    south_korea: "Korean",
    spain: "Spanish",
    taiwan: "Traditional Chinese",
    thailand: "Thai",
    turkey: "Turkish",
    uae: "Arabic",
    united_arab_emirates: "Arabic",
    united_kingdom: "English",
    uk: "English",
    united_states: "English",
    usa: "English",
    us: "English",
    vietnam: "Vietnamese",
  };
  return map[normalizeCountry(country)] || "";
}

function getWhatsAppChatId(msg: { chatId?: string; chat_id?: string; chatid?: string; sender?: string; recipient?: string; direction?: string }) {
  const explicit = msg.chatId || msg.chat_id || msg.chatid;
  if (explicit) return String(explicit);
  return msg.direction === "outbound"
    ? String(msg.recipient || msg.sender || "unknown")
    : String(msg.sender || msg.recipient || "unknown");
}

function getWhatsAppConversationKey(msg: WaMessage) {
  return msg.conversation_key || msg.conversation_id || msg.mob || msg.mobile || getWhatsAppChatId(msg);
}

function getWhatsAppBody(msg: WaMessage) {
  return msg.body || msg.payload?.caption || "";
}

function getWhatsAppMediaAttachments(msg: WaMessage): Attachment[] {
  const media = msg.payload?.media;
  if (!media?.url) return [];
  const mimeType = media.mimeType || media.type || "application/octet-stream";
  return [
    {
      id: String(media.id || media.whatsappMessageId || msg.id),
      name: media.originalName || media.name || (mimeType.startsWith("image/") ? "WhatsApp image" : "WhatsApp media"),
      url: resolveHubMediaUrl(media.url),
      type: mimeType,
      mimeType,
      size: Number(media.size || 0),
    },
  ];
}

function mediaItemToAttachment(item: MediaItem): Attachment {
  const mimeType =
    item.type === "image"
      ? "image/*"
      : item.type === "video"
        ? "video/*"
        : "application/octet-stream";
  return {
    id: item.id,
    name: item.name,
    url: item.url,
    type: mimeType,
    mimeType,
    size: item.size,
  };
}

function WhatsAppAttachmentView({ attachment }: { attachment: Attachment }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const isImage = (attachment.mimeType || attachment.type || "").startsWith("image/");

  useEffect(() => {
    let revoked = false;
    let createdObjectUrl = "";
    setFailed(false);
    setObjectUrl("");

    if (!attachment.url) return undefined;
    if (!isImage) return undefined;
    if (attachment.url.startsWith("blob:") || attachment.url.startsWith("data:")) {
      setObjectUrl(attachment.url);
      return undefined;
    }

    fetchHubMediaBlob(attachment.url)
      .then((blob) => {
        if (revoked) return;
        createdObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(createdObjectUrl);
      })
      .catch((err) => {
        console.error(err);
        if (!revoked) setFailed(true);
      });

    return () => {
      revoked = true;
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [attachment.url, isImage]);

  const openAttachment = async () => {
    try {
      const blob = await fetchHubMediaBlob(attachment.url);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      console.error(err);
      notify(err instanceof Error ? err.message : "Failed to open WhatsApp media.", "error", "Media unavailable");
    }
  };

  if (isImage) {
    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-white/20 bg-black/5 dark:bg-black/20">
        {objectUrl ? (
          <img src={objectUrl} alt={attachment.name} className="max-h-80 w-full max-w-sm object-contain" />
        ) : (
          <button
            type="button"
            onClick={openAttachment}
            className="flex min-h-28 w-64 items-center justify-center px-4 py-6 text-xs opacity-75"
          >
            {failed ? "Open WhatsApp image" : "Loading image..."}
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={openAttachment}
      className="mt-2 flex max-w-sm items-center gap-2 rounded-xl border border-white/20 bg-black/5 px-3 py-2 text-left text-xs font-medium hover:bg-black/10 dark:bg-black/20 dark:hover:bg-black/30"
    >
      <Paperclip className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
    </button>
  );
}

export default function Inbox() {
  const { t, language } = useLanguage();
  const [waClients, setWaClients] = useState<WaClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedWhatsAppMedia, setSelectedWhatsAppMedia] = useState<MediaItem[]>([]);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [whatsAppChatMobMappings, setWhatsAppChatMobMappings] = useState<Record<string, string>>(() => loadJsonMap<string>(WHATSAPP_CHAT_MOB_MAPPINGS_KEY));
  const [editingChatMob, setEditingChatMob] = useState("");
  const [editingChatMobId, setEditingChatMobId] = useState("");
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
  const [autoTranslateWhatsAppPrefs, setAutoTranslateWhatsAppPrefs] = useState<Record<string, boolean>>(() => loadJsonMap<boolean>(WHATSAPP_AUTO_TRANSLATE_PREFS_KEY));
  const [outboundAutoTranslateWhatsAppPrefs, setOutboundAutoTranslateWhatsAppPrefs] = useState<Record<string, boolean>>(() => loadJsonMap<boolean>(WHATSAPP_OUTBOUND_AUTO_TRANSLATE_PREFS_KEY));
  const [whatsAppTranslations, setWhatsAppTranslations] = useState<Record<string, WhatsAppTranslation>>(() => loadJsonMap<WhatsAppTranslation>(WHATSAPP_TRANSLATIONS_KEY));
  const [translatingMessageIds, setTranslatingMessageIds] = useState<Set<string>>(() => new Set());
  const [failedTranslationIds, setFailedTranslationIds] = useState<Set<string>>(() => new Set());

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

  const resetCompose = (channel: "Email" | "WhatsApp" = "Email") => {
    setComposeTo([]);
    setComposeCc([]);
    setComposeBcc([]);
    setComposeSubject("");
    setComposeBody("");
    setComposeMode("new");
    setComposeChannel(channel);
    setComposeWhatsAppChatId("");
    setComposeOriginalMessage(null);
    const mappingSignatureId = getEmailMappings()[0]?.signatureId || "";
    const signature = getEmailSignatures().find((item) => item.id === mappingSignatureId);
    setComposeSignatureId(mappingSignatureId);
    setComposeSignatureHtml(signature?.html || "");
    setComposeAttachments([]);
    setSelectedWhatsAppMedia([]);
    setIsEmojiPickerOpen(false);
    setIsMediaPickerOpen(false);
    setComposeScheduleDate("");
    setComposeScheduleTime("");
    setShowComposeSchedule(false);
  };

  const handleComposeSend = async () => {
    const composePlainText = stripHtml(composeBody);
    if (!composeTo.length || (composeChannel === "Email" && !composeSubject.trim()) || !composePlainText) {
      notify(
        composeChannel === "WhatsApp"
          ? "Please add a WhatsApp recipient and a message."
          : "Please add at least one recipient, a subject, and a message.",
        "warning",
        composeChannel === "WhatsApp" ? "Missing WhatsApp details" : "Missing email details",
      );
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
      if (composeChannel === "WhatsApp") {
        const target = resolveWhatsAppSendTarget(composeTo[0]);
        const targetKey = normalizeConversationAddress(target);
        const shouldTranslateOutbound = targetKey ? outboundAutoTranslateWhatsAppPrefs[targetKey] ?? false : false;
        const outboundText = shouldTranslateOutbound
          ? await translateOutboundWhatsAppText(composePlainText, getWhatsAppOutboundTargetLanguage(target))
          : composePlainText;
        const mediaLines = selectedWhatsAppMedia.map((item) => `[${item.type}] ${item.name}`);
        const finalWhatsAppText = [outboundText, ...mediaLines].filter(Boolean).join("\n");
        const attachments = selectedWhatsAppMedia.map(mediaItemToAttachment);
        await sendMessage(target, finalWhatsAppText, selectedClientId, attachments);
        const sentMessage = addOutboundMessage({
          sender: "agent",
          target,
          intent: "Outbound",
          subject: "WhatsApp message",
          summary: finalWhatsAppText.slice(0, 140),
          channel: "WhatsApp",
          thread: [
            {
              id: `t_${Date.now()}`,
              sender: "agent",
              content: finalWhatsAppText,
              attachments,
              time: new Date().toLocaleTimeString(),
            },
          ],
          tags: selectedWhatsAppMedia.length ? ["media"] : [],
        });
        setMessages(getInboxMessages());
        setActiveMessageId(sentMessage.id);
        setComposeBody("");
        setSelectedWhatsAppMedia([]);
        setIsEmojiPickerOpen(false);
        setIsMediaPickerOpen(false);
        return;
      }

      const signatureHtml = composeSignatureHtml || "";
      const originalHtml = composeOriginalMessage ? quotedOriginalHtml(composeOriginalMessage) : "";
      const finalHtml = `${composeBody}${signatureHtml ? `<div class="email-signature">${signatureHtml}</div>` : ""}${originalHtml}`;
      const finalText = stripHtml(finalHtml);
      await sendEmail("default", composeTo.join(", "), composeSubject, finalText, finalHtml);
      if (composeTo[0] && composeSignatureId) {
        const next = { ...loadLastSignatureByRecipient(), [composeTo[0].trim().toLowerCase()]: composeSignatureId };
        saveAppSetting(LAST_SIGNATURE_BY_RECIPIENT_KEY, next);
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
    setComposeChannel(message.channel);
    setComposeMode("reply");
    setComposeOriginalMessage(message.channel === "Email" ? message : null);
    setComposeTo(recipient ? [recipient] : []);
    setComposeCc([]);
    setComposeBcc([]);
    setComposeSubject(message.subject.toLowerCase().startsWith("re:") ? message.subject : `Re: ${message.subject}`);
    setComposeBody(initialBody);
    if (message.channel === "Email") applySignatureForRecipient(recipient);
    setActiveTab("compose");
  };

  const startForward = (message: MessagePreview) => {
    setComposeChannel(message.channel);
    setComposeMode("forward");
    setComposeOriginalMessage(message.channel === "Email" ? message : null);
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
  const [channelFilter, setChannelFilter] = useState<InboxChannelFilter>("all");
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [bulkTag, setBulkTag] = useState("");
  const [bulkFollowUpDueAt, setBulkFollowUpDueAt] = useState("");

  const [activeTab, setActiveTab] = useState<"inbox" | "compose">("inbox");
  const [composeTo, setComposeTo] = useState<string[]>([]);
  const [composeCc, setComposeCc] = useState<string[]>([]);
  const [composeBcc, setComposeBcc] = useState<string[]>([]);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeMode, setComposeMode] = useState<"new" | "reply" | "forward">("new");
  const [composeChannel, setComposeChannel] = useState<"Email" | "WhatsApp">("Email");
  const [composeWhatsAppChatId, setComposeWhatsAppChatId] = useState("");
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
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);

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
      const waConversationKeys = new Set(
        waMessages.flatMap((msg) =>
          [getWhatsAppConversationKey(msg), getWhatsAppChatId(msg), msg.mob, msg.mobile, msg.sender, msg.recipient]
            .filter(Boolean)
            .map((value) => normalizeConversationAddress(String(value))),
        ),
      );
      let updatedCount = 0;
      const refreshedExisting = existing
        .filter((message) => {
          if (message.channel !== "WhatsApp") return true;
          const existingKeys = [message.chatId, message.mob, message.sender, message.target]
            .filter(Boolean)
            .map((value) => normalizeConversationAddress(String(value)));
          return !existingKeys.some((key) => waConversationKeys.has(key));
        })
        .map((message) => {
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
        .map((email) => {
          const matchedCustomer = findCustomerForMessage({
            ...email,
            direction: "inbound",
            channel: "Email",
            thread: [],
          } as MessagePreview);
          return {
            ...email,
            customerId: matchedCustomer?.id,
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
          };
        });
      emailPreviews.forEach((message) => existingIds.add(message.id));

      const waGroups = new Map<string, typeof waMessages>();
      waMessages.forEach((msg) => {
        const chatId = getWhatsAppConversationKey(msg);
        waGroups.set(chatId, [...(waGroups.get(chatId) || []), msg]);
      });
      const existingById = new Map(existing.map((message) => [message.id, message]));
      const waPreviews: MessagePreview[] = Array.from(waGroups.entries()).map(([chatId, group]) => {
        const sorted = group.sort((a, b) => Date.parse(a.created_at || "") - Date.parse(b.created_at || ""));
        const latest = sorted[sorted.length - 1];
        const previewId = `wa_chat_${chatId}`;
        const existingPreview = existingById.get(previewId);
        const mappedMob = whatsAppChatMobMappings[chatId] || latest.mob || latest.mobile || (latest.direction === "outbound" ? latest.recipient : latest.sender);
        const latestBody = getWhatsAppBody(latest);
        const latestAttachments = getWhatsAppMediaAttachments(latest);
        const summary = latestBody || latestAttachments[0]?.name || (latest.message_type === "media" ? "WhatsApp media" : "");
        const matchedCustomer = findCustomerByWhatsAppAddress(mappedMob || chatId);
        return {
          ...(existingPreview || {}),
          id: previewId,
          chatId,
          mob: mappedMob,
          customerId: matchedCustomer?.id || existingPreview?.customerId,
          sender: mappedMob || latest.sender,
          target: mappedMob || latest.recipient,
          intent: "WhatsApp",
          subject: "WhatsApp conversation",
          summary,
          channel: "WhatsApp",
          date: new Date(latest.created_at).toLocaleString(),
          direction: latest.direction === "outbound" ? "outbound" : "inbound",
          read: existingPreview?.read ?? latest.direction === "outbound",
          thread: sorted.map((msg) => {
            const attachments = getWhatsAppMediaAttachments(msg);
            return {
              id: `t_${msg.id}`,
              sender: msg.direction === "outbound" ? "agent" : "user",
              content: getWhatsAppBody(msg),
              attachments,
              time: new Date(msg.created_at).toLocaleTimeString(),
            };
          }),
        };
      });

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
        const actorClients = clientsFromActors(clients, getConfiguredWaHubActors());
        setWaClients(actorClients);
        setSelectedClientId(defaultWaClientId(actorClients));
      })
      .catch(console.error);
    getMedias().then(setMediaItems).catch(console.error);

    setCustomers(getCustomers());
    const initialMessages = getInboxMessages();
    setMessages(initialMessages);
    if (initialMessages.length > 0) {
      setActiveMessageId(initialMessages[0].id);
    }

    Promise.allSettled([
      loadEmailConfigurationFromServer(),
      loadInboxMessagesFromServer(),
      loadAppSettingsFromServer(),
    ])
      .then((results) => {
        const inboxResult = results[1];
        if (inboxResult.status === "fulfilled") {
          setMessages(inboxResult.value);
          if (inboxResult.value.length > 0) {
            setActiveMessageId((current) => current || inboxResult.value[0].id);
          }
        }
        const settingsResult = results[2];
        if (settingsResult.status === "fulfilled") {
          const savedActors = parseWaHubActors(settingsResult.value[WA_HUB_ACTORS_KEY]);
          if (savedActors.length > 0) {
            setWaClients((currentClients) => {
              const actorClients = clientsFromActors(currentClients, savedActors);
              setSelectedClientId((current) => actorClients.some((client) => client.id === current) ? current : defaultWaClientId(actorClients));
              return actorClients;
            });
          }
          const savedPrefs = settingsResult.value[WHATSAPP_AUTO_TRANSLATE_PREFS_KEY];
          if (savedPrefs && typeof savedPrefs === "object" && !Array.isArray(savedPrefs)) {
            setAutoTranslateWhatsAppPrefs(savedPrefs as Record<string, boolean>);
          }
          const savedOutboundPrefs = settingsResult.value[WHATSAPP_OUTBOUND_AUTO_TRANSLATE_PREFS_KEY];
          if (savedOutboundPrefs && typeof savedOutboundPrefs === "object" && !Array.isArray(savedOutboundPrefs)) {
            setOutboundAutoTranslateWhatsAppPrefs(savedOutboundPrefs as Record<string, boolean>);
          }
        }
      })
      .then(() => syncInboxMessages(true))
      .catch(console.error);
  }, []);

  const activeMessage =
    messages.find((m) => m.id === activeMessageId) || messages[0] || null;

  const whatsappTranslationKey = (messageId: string, threadId: string, targetLanguage: string) => `${messageId}:${threadId}:${targetLanguage}`;

  const getMessageChatId = (message: MessagePreview) =>
    message.chatId || (message.id.startsWith("wa_chat_") ? message.id.replace(/^wa_chat_/, "") : "") || message.sender || message.target;

  const whatsappAutoTranslatePrefKey = (message: MessagePreview | null) => {
    if (!message || message.channel !== "WhatsApp") return "";
    const contactValue =
      message.mob ||
      (message.direction === "outbound" ? message.target : message.sender) ||
      message.target ||
      message.sender ||
      getMessageChatId(message);
    return normalizeConversationAddress(contactValue);
  };

  const activeWhatsAppAutoTranslateKey = whatsappAutoTranslatePrefKey(activeMessage);
  const activeWhatsAppAutoTranslateEnabled = activeWhatsAppAutoTranslateKey
    ? autoTranslateWhatsAppPrefs[activeWhatsAppAutoTranslateKey] ?? false
    : false;
  const activeWhatsAppOutboundTranslateEnabled = activeWhatsAppAutoTranslateKey
    ? outboundAutoTranslateWhatsAppPrefs[activeWhatsAppAutoTranslateKey] ?? false
    : false;
  const findCustomerByWhatsAppAddress = (address = "", message?: MessagePreview | null) => {
    if (message?.customerId) {
      const customer = customers.find((item) => item.id === message.customerId);
      if (customer) return customer;
    }
    const lookupValues = new Set(
      [
        address,
        message?.mob,
        message?.sender,
        message?.target,
        message ? getMessageChatId(message) : "",
      ]
        .filter(Boolean)
        .map((value) => normalizeConversationAddress(String(value))),
    );
    return customers.find((customer) => {
      const contactValues = [
        customer.contact,
        ...(customer.contacts || [])
          .filter((contact) => ["whatsapp", "phone", "mobile"].includes(contact.type.toLowerCase()))
          .map((contact) => contact.value),
      ].map((value) => normalizeConversationAddress(value));
      return contactValues.some((value) => value && lookupValues.has(value));
    });
  };

  const getWhatsAppOutboundTargetLanguage = (address = "", message?: MessagePreview | null) => {
    const customer = findCustomerByWhatsAppAddress(address, message);
    return languageName(customer?.preferredLanguage || "") || officialLanguageForCountry(customer?.country || "") || "English";
  };

  const saveCustomerPreferredLanguage = (customer: Customer | undefined, preferredLanguage: string) => {
    if (!customer) {
      notify(
        language === "zh" ? "当前 WhatsApp 号码未匹配到客户，无法保存客户偏好语言。" : "This WhatsApp number is not matched to a customer, so the preferred language cannot be saved.",
        "warning",
        language === "zh" ? "未匹配客户" : "Customer not matched",
      );
      return;
    }
    updateCustomer(customer.id, { preferredLanguage });
    setCustomers(getCustomers());
    notify(
      language === "zh" ? "客户偏好语言已更新。" : "Customer preferred language updated.",
      "success",
      language === "zh" ? "语言已保存" : "Language saved",
    );
  };

  const saveOutboundWhatsAppTranslatePref = (key: string, enabled: boolean) => {
    if (!key) return;
    const nextPrefs = {
      ...outboundAutoTranslateWhatsAppPrefs,
      [key]: enabled,
    };
    setOutboundAutoTranslateWhatsAppPrefs(nextPrefs);
    localStorage.setItem(WHATSAPP_OUTBOUND_AUTO_TRANSLATE_PREFS_KEY, JSON.stringify(nextPrefs));
    saveAppSetting(WHATSAPP_OUTBOUND_AUTO_TRANSLATE_PREFS_KEY, nextPrefs);
  };

  const translateOutboundWhatsAppText = async (text: string, targetLanguage: string) => {
    const modelProfile = getModelProfiles()[0] || {};
    const res = await fetch("/api/ai/translate-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        targetLanguage,
        modelProfile,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Translation failed with HTTP ${res.status}.`);
    }
    return data.shouldTranslate && data.translatedText ? String(data.translatedText).trim() : text;
  };
  const activeWhatsAppOutboundTargetLanguage = activeMessage?.channel === "WhatsApp"
    ? getWhatsAppOutboundTargetLanguage(
        activeMessage.mob ||
          (activeMessage.direction === "outbound" ? activeMessage.target : activeMessage.sender) ||
          activeMessage.target,
        activeMessage,
      )
    : "English";
  const activeWhatsAppOutboundCustomer = activeMessage?.channel === "WhatsApp"
    ? findCustomerByWhatsAppAddress(
        activeMessage.mob ||
          (activeMessage.direction === "outbound" ? activeMessage.target : activeMessage.sender) ||
          activeMessage.target,
        activeMessage,
      )
    : undefined;

  const findCustomerForMessage = (message: MessagePreview | null) => {
    if (!message) return undefined;
    if (message.customerId) {
      const customer = customers.find((item) => item.id === message.customerId);
      if (customer) return customer;
    }
    if (message.channel === "WhatsApp") {
      return findCustomerByWhatsAppAddress(
        message.mob ||
          (message.direction === "outbound" ? message.target : message.sender) ||
          message.sender ||
          message.target,
        message,
      );
    }
    const values = new Set(
      [message.sender, message.target]
        .flatMap((value) => String(value || "").split(","))
        .map(extractRecipientValue)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    return customers.find((customer) => {
      const contactValues = [customer.contact, ...(customer.contacts || []).map((contact) => contact.value)]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);
      return contactValues.some((value) => values.has(value));
    });
  };

  const getMessageMappedPhone = (message: MessagePreview | null) => {
    if (!message || message.channel !== "WhatsApp") return "";
    const chatId = getMessageChatId(message);
    const customer = findCustomerByWhatsAppAddress("", message);
    const customerPhone = customer?.contacts?.find((contact) =>
      ["whatsapp", "mobile", "phone"].includes(contact.type.toLowerCase()),
    )?.value || "";
    const candidates = [
      whatsAppChatMobMappings[chatId],
      message.mob,
      customerPhone,
      message.direction === "outbound" ? message.target : message.sender,
      message.sender,
      message.target,
    ];
    return candidates
      .map((value) => extractRecipientValue(String(value || "")).trim())
      .find((value) => value && !isWhatsAppChatAddress(value)) || "";
  };

  const resolveWhatsAppSendTarget = (target: string, message?: MessagePreview | null) => {
    const cleanTarget = extractRecipientValue(target).trim();
    if (message?.channel === "WhatsApp") {
      const mappedPhone = getMessageMappedPhone(message);
      if (mappedPhone) return mappedPhone;
    }
    if (whatsAppChatMobMappings[cleanTarget]) return whatsAppChatMobMappings[cleanTarget];
    const normalizedTarget = normalizeConversationAddress(cleanTarget);
    const mappedEntry = Object.entries(whatsAppChatMobMappings).find(
      ([chatId]) => normalizeConversationAddress(chatId) === normalizedTarget,
    );
    if (mappedEntry?.[1]) return mappedEntry[1];
    return cleanTarget;
  };

  const getMessageContactLabel = (message: MessagePreview) => {
    const customer = findCustomerForMessage(message);
    if (message.channel === "WhatsApp") {
      const phone = getMessageMappedPhone(message);
      return customer ? `${customer.name}${phone ? ` (${phone})` : ""}` : phone || getMessageChatId(message);
    }
    if (customer) return customer.name;
    return message.direction === "outbound" || message.intent === "Outbound" ? `To: ${message.target}` : message.sender;
  };

  const getMessageTitle = (message: MessagePreview) => {
    const customer = findCustomerForMessage(message);
    if (message.channel === "WhatsApp") return customer?.name || getMessageContactLabel(message);
    return customer?.name || message.subject;
  };

  const getListTitle = (message: MessagePreview) => {
    if (message.channel === "WhatsApp") {
      const lastThread = message.thread?.[message.thread.length - 1];
      return message.summary || lastThread?.content || "WhatsApp media";
    }
    return message.subject;
  };

  const saveWhatsAppChatMobMapping = (chatId: string, mob: string) => {
    const normalizedChatId = chatId.trim();
    const normalizedMob = mob.trim();
    if (!normalizedChatId) {
      notify(language === "zh" ? "缺少 WhatsApp chatId，无法保存映射。" : "WhatsApp chatId is missing, so the mapping cannot be saved.", "warning", language === "zh" ? "无法保存" : "Cannot save");
      return;
    }

    const nextMappings = { ...whatsAppChatMobMappings };
    if (normalizedMob) {
      nextMappings[normalizedChatId] = normalizedMob;
    } else {
      delete nextMappings[normalizedChatId];
    }

    setWhatsAppChatMobMappings(nextMappings);
    localStorage.setItem(WHATSAPP_CHAT_MOB_MAPPINGS_KEY, JSON.stringify(nextMappings));
    saveAppSetting(WHATSAPP_CHAT_MOB_MAPPINGS_KEY, nextMappings);

    const nextMessages = getInboxMessages().map((message) => {
      if (message.channel !== "WhatsApp") return message;
      const messageChatId = getMessageChatId(message);
      if (messageChatId !== normalizedChatId) return message;
      return {
        ...message,
        chatId: normalizedChatId,
        mob: normalizedMob,
        sender: message.direction === "outbound" ? message.sender : normalizedMob || message.sender,
        target: message.direction === "outbound" ? normalizedMob || message.target : message.target,
      };
    });
    saveInboxMessages(nextMessages);
    setMessages(nextMessages);
    setEditingChatMobId("");
    setEditingChatMob("");
    notify(language === "zh" ? "WhatsApp chatId 与 mob 映射已更新。" : "WhatsApp chatId to mob mapping updated.", "success", language === "zh" ? "映射已更新" : "Mapping updated");
  };

  useEffect(() => {
    if (!activeWhatsAppAutoTranslateEnabled || !activeMessage || activeMessage.channel !== "WhatsApp") return;
    const modelProfile = getModelProfiles()[0] || {};
    const targetLanguage = language === "zh" ? "Chinese" : "English";

    activeMessage.thread
      .filter((threadItem) => threadItem.sender !== "agent" && !threadItem.htmlContent && threadItem.content?.trim())
      .forEach((threadItem) => {
        const key = whatsappTranslationKey(activeMessage.id, threadItem.id, targetLanguage);
        if (whatsAppTranslations[key] || translatingMessageIds.has(key) || failedTranslationIds.has(key)) return;

        setTranslatingMessageIds((prev) => new Set(prev).add(key));
        const params = new URLSearchParams({
          messageId: activeMessage.id,
          threadId: threadItem.id,
          targetLanguage,
          text: threadItem.content,
        });
        fetch(`/api/ai/message-translation?${params.toString()}`)
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Translation cache lookup failed with HTTP ${res.status}.`);
            if (data.translation) return data.translation;
            const translateRes = await fetch("/api/ai/translate-message", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messageId: activeMessage.id,
                threadId: threadItem.id,
                text: threadItem.content,
                targetLanguage,
                modelProfile,
              }),
            });
            const translated = await translateRes.json().catch(() => ({}));
            if (!translateRes.ok) throw new Error(translated.error || `Translation failed with HTTP ${translateRes.status}.`);
            return translated;
          })
          .then((data) => {
            setWhatsAppTranslations((prev) => ({
              ...prev,
              [key]: {
                sourceLanguage: String(data.sourceLanguage || "unknown"),
                targetLanguage: String(data.targetLanguage || targetLanguage),
                translatedText: String(data.translatedText || ""),
                shouldTranslate: Boolean(data.shouldTranslate && data.translatedText),
              },
            }));
          })
          .catch((err) => {
            console.error(err);
            setFailedTranslationIds((prev) => new Set(prev).add(key));
            notify(
              err instanceof Error ? err.message : "WhatsApp translation failed.",
              "error",
              language === "zh" ? "翻译失败" : "Translation failed",
            );
          })
          .finally(() => {
            setTranslatingMessageIds((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          });
      });
  }, [activeMessage?.id, activeWhatsAppAutoTranslateEnabled, language, whatsAppTranslations, translatingMessageIds, failedTranslationIds]);

  useEffect(() => {
    localStorage.setItem(WHATSAPP_TRANSLATIONS_KEY, JSON.stringify(whatsAppTranslations));
  }, [whatsAppTranslations]);

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
    if ((!replyPlainText && selectedWhatsAppMedia.length === 0) || !activeMessage) return;
    setIsSending(true);

    const isScheduled =
      showReplySchedule && replyScheduleDate && replyScheduleTime;

    try {
    if (isScheduled) {
        notify("Scheduled sending requires a real backend scheduler. Send immediately or configure a scheduler endpoint first.", "warning", "Scheduler not configured");
        return;
      }

      if (activeMessage.channel === "WhatsApp") {
        const targetAddress = resolveWhatsAppSendTarget(
          activeMessage.mob ||
            (activeMessage.direction === "outbound" ? activeMessage.target : activeMessage.sender) ||
            activeMessage.target,
          activeMessage,
        );
        const outboundText = activeWhatsAppOutboundTranslateEnabled
          ? await translateOutboundWhatsAppText(replyPlainText, getWhatsAppOutboundTargetLanguage(targetAddress, activeMessage))
          : replyPlainText;
        const mediaLines = selectedWhatsAppMedia.map((item) => `[${item.type}] ${item.name}`);
        const finalWhatsAppText = [outboundText, ...mediaLines].filter(Boolean).join("\n");
        const attachments = selectedWhatsAppMedia.map(mediaItemToAttachment);
        await sendMessage(targetAddress, finalWhatsAppText, selectedClientId, attachments);
        addOutboundMessage({
          sender: "agent",
          target: targetAddress,
          chatId: activeMessage.chatId,
          mob: isWhatsAppChatAddress(activeMessage.mob || "") ? targetAddress : activeMessage.mob || targetAddress,
          intent: "Outbound",
          subject: activeMessage.subject,
          summary: finalWhatsAppText.slice(0, 140),
          channel: "WhatsApp",
          thread: [
            {
              id: `t_${Date.now()}`,
              sender: "agent",
              content: finalWhatsAppText,
              attachments,
              time: new Date().toLocaleTimeString(),
            },
          ],
          tags: selectedWhatsAppMedia.length ? ["media"] : [],
        });
        addDraftToThread(activeMessage.id, finalWhatsAppText);
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
        addDraftToThread(activeMessage.id, replyPlainText);
      }

      setMessages(getInboxMessages());

      setReplyText("");
      setSelectedWhatsAppMedia([]);
      setIsEmojiPickerOpen(false);
      setIsMediaPickerOpen(false);
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

    const idsToDelete =
      deletingMessageId === BULK_DELETE_SENTINEL
        ? selectedMessageIds
        : [deletingMessageId];
    const deleteIdSet = new Set(idsToDelete);

    if (deletingMessageId === BULK_DELETE_SENTINEL) {
      const nextMessages = getInboxMessages().filter((msg) => !deleteIdSet.has(msg.id));
      saveInboxMessages(nextMessages);
      idsToDelete.forEach((messageId) => {
        fetch(`/api/communication/inbox/${encodeURIComponent(messageId)}`, {
          method: "DELETE",
        }).catch(console.error);
      });
    } else {
      deleteInboxMessage(deletingMessageId);
    }

    const nextMessages = getInboxMessages();
    setMessages(nextMessages);
    setDrafts((prev) => {
      const next = { ...prev };
      idsToDelete.forEach((messageId) => delete next[messageId]);
      return next;
    });
    setInboxInsights((prev) => {
      const next = { ...prev };
      idsToDelete.forEach((messageId) => delete next[messageId]);
      return next;
    });
    setInsightErrors((prev) => {
      const next = { ...prev };
      idsToDelete.forEach((messageId) => delete next[messageId]);
      return next;
    });
    setCheckedInsightIds((prev) => {
      const next = new Set(prev);
      idsToDelete.forEach((messageId) => next.delete(messageId));
      return next;
    });
    idsToDelete.forEach((messageId) => {
      fetch(`/api/ai/inbox-insights/${encodeURIComponent(messageId)}`, {
        method: "DELETE",
      }).catch(console.error);
    });

    if (deleteIdSet.has(activeMessageId)) {
      setActiveMessageId(nextMessages[0]?.id || "");
      setIsCommentsOpen(false);
      setReplyText("");
    }

    setSelectedMessageIds((prev) => prev.filter((id) => !deleteIdSet.has(id)));
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
    const modelProfile = getModelProfiles()[0] || {};

    try {
      const res = await fetch("/api/ai/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: activeMessage.summary,
          intent: activeMessage.intent,
          preferredLanguage: prefLanguage,
          systemLanguage: currentSystemLanguage,
          channel: activeMessage.channel,
          subject: activeMessage.subject,
          thread: activeMessage.thread,
          modelProfile,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `AI draft failed with HTTP ${res.status}.`);
      }
      const reply = String(data.reply || "").trim();
      if (!reply) {
        throw new Error("AI returned an empty reply.");
      }

      setDrafts((prev) => ({ ...prev, [msgId]: reply }));
      if (activeMessageIdRef.current === msgId) {
        setReplyText(reply);
        if (activeMessage.channel === "Email") {
          startReply(activeMessage, editorHtml(reply));
        }
      }
    } catch (err) {
      console.error(err);
      notify(
        err instanceof Error ? err.message : "Error reaching AI endpoint.",
        "error",
        "Draft AI Reply failed",
      );
    } finally {
      setIsDrafting(false);
    }
  };

  const getInsightSearchText = (message: MessagePreview, insight?: InboxInsight) =>
    [
      message.subject,
      message.summary,
      message.intent,
      ...(message.tags || []),
      insight?.intent,
      insight?.risk,
      insight?.customerNeed,
      ...(insight?.recommendedActions || []),
      ...(insight?.replyGuidance || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  const isLikelySpamMessage = (message: MessagePreview, insight?: InboxInsight) =>
    /spam|junk|phishing|scam|unsubscribe|promo|promotion|newsletter|垃圾|钓鱼|诈骗|退订|促销|广告|营销/.test(
      getInsightSearchText(message, insight),
    );

  const addMessageTag = (message: MessagePreview, tag: string) => {
    const tags = Array.from(new Set([...(message.tags || []), tag]));
    updateInboxMessage(message.id, { tags });
    setMessages(getInboxMessages());
    notify(
      language === "zh" ? `已添加标签：${tag}` : `Tag added: ${tag}`,
      "success",
      language === "zh" ? "标签已更新" : "Tag updated",
    );
  };

  const markMessageImportant = (message: MessagePreview) => {
    updateInboxMessage(message.id, { important: true });
    setMessages(getInboxMessages());
    notify(
      language === "zh" ? "已标记为重要。" : "Marked as important.",
      "success",
      language === "zh" ? "已标记" : "Marked",
    );
  };

  const assignMessageToSales = (message: MessagePreview) => {
    updateInboxMessage(message.id, { assignee: "Alice Chen" });
    setMessages(getInboxMessages());
    notify(
      language === "zh" ? "已分配给 Alice Chen。" : "Assigned to Alice Chen.",
      "success",
      language === "zh" ? "已分配" : "Assigned",
    );
  };

  const mailboxMessages = messages.filter((msg) =>
    selectedMailbox === "sent"
      ? msg.direction === "outbound" || msg.intent === "Outbound"
      : msg.direction !== "outbound" && msg.intent !== "Outbound",
  );

  const channelMessages = mailboxMessages.filter((msg) =>
    channelFilter === "all" ? true : msg.channel === channelFilter,
  );

  const filteredMessages = channelMessages.filter((msg) => {
    const q = searchQuery.toLowerCase();
    return (
      msg.subject.toLowerCase().includes(q) ||
      msg.summary.toLowerCase().includes(q) ||
      msg.sender.toLowerCase().includes(q) ||
      msg.target.toLowerCase().includes(q) ||
      (msg.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });

  const selectedMessageIdSet = new Set(selectedMessageIds);
  const visibleMessageIds = filteredMessages.map((msg) => msg.id);
  const selectedVisibleCount = visibleMessageIds.filter((id) => selectedMessageIdSet.has(id)).length;
  const allVisibleSelected = visibleMessageIds.length > 0 && selectedVisibleCount === visibleMessageIds.length;

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessageIds((prev) =>
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId],
    );
  };

  const toggleSelectAllVisible = () => {
    setSelectedMessageIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleMessageIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleMessageIds]));
    });
  };

  const applyBulkMessageUpdate = (updates: Partial<MessagePreview>, successMessage: string) => {
    if (!selectedMessageIds.length) return;
    const selectedIds = new Set(selectedMessageIds);
    const nextMessages = getInboxMessages().map((message) =>
      selectedIds.has(message.id) ? { ...message, ...updates } : message,
    );
    saveInboxMessages(nextMessages);
    setMessages(nextMessages);
    notify(successMessage, "success", language === "zh" ? "批量操作完成" : "Bulk action completed");
  };

  const handleBulkAddTag = () => {
    const tag = bulkTag.trim();
    if (!tag) {
      notify(language === "zh" ? "请输入要添加的标签。" : "Please enter a tag first.", "warning", language === "zh" ? "需要标签" : "Tag required");
      return;
    }
    const selectedIds = new Set(selectedMessageIds);
    const nextMessages = getInboxMessages().map((message) => {
      if (!selectedIds.has(message.id)) return message;
      const tags = Array.from(new Set([...(message.tags || []), tag]));
      return { ...message, tags };
    });
    saveInboxMessages(nextMessages);
    setMessages(nextMessages);
    setBulkTag("");
    notify(language === "zh" ? "已为选中的消息添加标签。" : "Tag added to selected messages.", "success", language === "zh" ? "标签已添加" : "Tag added");
  };

  const handleBulkMarkImportant = () => {
    applyBulkMessageUpdate(
      { important: true },
      language === "zh" ? "已将选中的消息标记为重要。" : "Selected messages marked as important.",
    );
  };

  const handleBulkAddFollowUp = () => {
    if (!bulkFollowUpDueAt) {
      notify(
        language === "zh" ? "请先设置跟进到期时间。" : "Please set a follow-up due date first.",
        "warning",
        language === "zh" ? "需要到期时间" : "Due date required",
      );
      return;
    }
    const selectedIds = new Set(selectedMessageIds);
    const nextMessages = getInboxMessages().map((message) => {
      if (!selectedIds.has(message.id)) return message;
      const tags = Array.from(new Set([...(message.tags || []), "follow-up"]));
      return {
        ...message,
        tags,
        followUpDueAt: new Date(bulkFollowUpDueAt).toISOString(),
      };
    });
    saveInboxMessages(nextMessages);
    setMessages(nextMessages);
    setBulkFollowUpDueAt("");
    notify(
      language === "zh" ? "已将选中的消息加入跟进。" : "Selected messages added to follow-up.",
      "success",
      language === "zh" ? "已加入跟进" : "Follow-up added",
    );
  };

  useEffect(() => {
    setSelectedMessageIds([]);
  }, [selectedMailbox, channelFilter]);

  const activeWhatsAppTarget = composeChannel === "WhatsApp" && composeTo[0]
    ? resolveWhatsAppSendTarget(composeTo[0])
    : "";
  const activeWhatsAppTargetKey = normalizeConversationAddress(activeWhatsAppTarget);
  const activeComposeWhatsAppOutboundTranslateEnabled = activeWhatsAppTargetKey
    ? outboundAutoTranslateWhatsAppPrefs[activeWhatsAppTargetKey] ?? false
    : false;
  const activeComposeWhatsAppCustomer = findCustomerByWhatsAppAddress(activeWhatsAppTarget);
  const activeComposeWhatsAppTargetLanguage = getWhatsAppOutboundTargetLanguage(activeWhatsAppTarget);
  const whatsappConversationItems = activeWhatsAppTargetKey
    ? messages
        .filter((msg) => {
          if (msg.channel !== "WhatsApp") return false;
          const senderKey = normalizeConversationAddress(msg.sender);
          const targetKey = normalizeConversationAddress(msg.target);
          return senderKey === activeWhatsAppTargetKey || targetKey === activeWhatsAppTargetKey;
        })
        .sort((a, b) => (Date.parse(a.date || "") || 0) - (Date.parse(b.date || "") || 0))
        .flatMap((msg) =>
          (msg.thread?.length ? msg.thread : [{
            id: msg.id,
            sender: msg.direction === "outbound" ? "agent" : "user",
            content: msg.summary,
            attachments: [],
            time: msg.date,
          }]).map((threadItem) => ({
            id: `${msg.id}:${threadItem.id}`,
            direction: threadItem.sender === "agent" || msg.direction === "outbound" ? "outbound" : "inbound",
            content: threadItem.content,
            attachments: threadItem.attachments || [],
            time: threadItem.time || msg.date,
          })),
        )
    : [];

  const activeMessageCustomer = findCustomerForMessage(activeMessage);
  const activeMessageTitle = activeMessage ? getMessageTitle(activeMessage) : "";
  const detailCustomer = detailCustomerId ? customers.find((customer) => customer.id === detailCustomerId) : undefined;

  const linkMessageToCustomer = (message: MessagePreview, customerId: string) => {
    updateInboxMessage(message.id, { customerId: customerId || undefined });
    const nextMessages = getInboxMessages();
    setMessages(nextMessages);
    notify(
      customerId
        ? language === "zh" ? "消息已关联客户。" : "Message linked to customer."
        : language === "zh" ? "已取消客户关联。" : "Customer link removed.",
      "success",
      language === "zh" ? "关联已更新" : "Link updated",
    );
  };

  const switchMailbox = (mailbox: "inbox" | "sent") => {
    setSelectedMailbox(mailbox);
    setActiveTab("inbox");
    const nextMessage = messages.find((msg) =>
      (mailbox === "sent"
        ? msg.direction === "outbound" || msg.intent === "Outbound"
        : msg.direction !== "outbound" && msg.intent !== "Outbound") &&
      (channelFilter === "all" || msg.channel === channelFilter),
    );
    setActiveMessageId(nextMessage?.id || "");
  };

  const switchChannelFilter = (nextFilter: InboxChannelFilter) => {
    setChannelFilter(nextFilter);
    setActiveTab("inbox");
    const nextMessage = messages.find((msg) =>
      (selectedMailbox === "sent"
        ? msg.direction === "outbound" || msg.intent === "Outbound"
        : msg.direction !== "outbound" && msg.intent !== "Outbound") &&
      (nextFilter === "all" || msg.channel === nextFilter),
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
                  resetCompose("Email");
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
                onClick={() => {
                  resetCompose("WhatsApp");
                  setActiveTab("compose");
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 dark:border-emerald-500/30"
                title={language === "zh" ? "发送 WhatsApp 消息" : "Send WhatsApp message"}
                aria-label={language === "zh" ? "发送 WhatsApp 消息" : "Send WhatsApp message"}
              >
                <MessageCircle className="h-4 w-4" />
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
          <div className="mb-3 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="grid grid-cols-3 gap-1">
              {[
                { value: "all" as const, label: "All", icon: InboxTray },
                { value: "WhatsApp" as const, label: "WhatsApp", icon: MessageCircle },
                { value: "Email" as const, label: "Email", icon: Mail },
              ].map((item) => {
                const Icon = item.icon;
                const active = channelFilter === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => switchChannelFilter(item.value)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-all",
                      active
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
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
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                disabled={filteredMessages.length === 0}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
              >
                {allVisibleSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                {language === "zh" ? "全选" : "Select all"}
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {language === "zh" ? `已选 ${selectedMessageIds.length} 条` : `${selectedMessageIds.length} selected`}
              </span>
              {selectedMessageIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedMessageIds([])}
                  className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                >
                  {language === "zh" ? "取消选择" : "Clear"}
                </button>
              )}
            </div>
            {selectedMessageIds.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-white/10">
                <div className="relative min-w-[150px] flex-1">
                  <Tag className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={bulkTag}
                    onChange={(e) => setBulkTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleBulkAddTag();
                    }}
                    placeholder={language === "zh" ? "输入标签" : "Enter tag"}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-2 text-xs text-slate-700 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-black/20 dark:text-slate-200"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleBulkAddTag}
                  className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  {language === "zh" ? "添加标签" : "Add tag"}
                </button>
                <button
                  type="button"
                  onClick={handleBulkMarkImportant}
                  className="flex items-center gap-1.5 rounded-md border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
                >
                  <Star className="h-3.5 w-3.5" />
                  {language === "zh" ? "标记重要" : "Important"}
                </button>
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
                  <input
                    type="datetime-local"
                    value={bulkFollowUpDueAt}
                    onChange={(e) => setBulkFollowUpDueAt(e.target.value)}
                    className="rounded border border-emerald-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-emerald-500 dark:border-emerald-500/30 dark:bg-black/30 dark:text-slate-200"
                    aria-label={language === "zh" ? "跟进到期时间" : "Follow-up due date"}
                  />
                  <button
                    type="button"
                    onClick={handleBulkAddFollowUp}
                    className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    {language === "zh" ? "加入跟进" : "Follow up"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setDeletingMessageId(BULK_DELETE_SENTINEL)}
                  className="flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {language === "zh" ? "删除" : "Delete"}
                </button>
              </div>
            )}
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
          {filteredMessages.map((msg) => {
            const contactLabel = getMessageContactLabel(msg);
            const listTitle = getListTitle(msg);
            return (
            <div
              key={msg.id}
              onClick={() => handleSelectMessage(msg)}
              className={cn(
                "p-5 border-b border-slate-200 dark:border-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors relative",
                activeMessageId === msg.id &&
                  "bg-blue-50/50 dark:bg-white/[0.06]",
                selectedMessageIdSet.has(msg.id) &&
                  "bg-blue-50 dark:bg-blue-500/10",
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
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMessageSelection(msg.id);
                    }}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-blue-600 dark:hover:bg-white/10"
                    title={language === "zh" ? "选择消息" : "Select message"}
                    aria-label={language === "zh" ? "选择消息" : "Select message"}
                  >
                    {selectedMessageIdSet.has(msg.id) ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
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
                    {contactLabel}
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
                title={listTitle}
              >
                {listTitle}
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
                  {msg.followUpDueAt && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-500/20 rounded text-[10px] font-mono">
                      <Clock className="h-3 w-3" />
                      {new Date(msg.followUpDueAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {msg.important && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                      {language === "zh" ? "重要" : "Important"}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-slate-400">
                    {msg.date}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateInboxMessage(msg.id, { important: !msg.important });
                      setMessages(getInboxMessages());
                    }}
                    className={cn(
                      "p-1 rounded transition-colors",
                      msg.important
                        ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                        : "text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10",
                    )}
                    title={language === "zh" ? "标记重要" : "Mark important"}
                    aria-label={language === "zh" ? "标记重要" : "Mark important"}
                  >
                    <Star className={cn("w-3.5 h-3.5", msg.important && "fill-current")} />
                  </button>
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
            );
          })}
        </div>
      </div>

      {/* Detail View / Compose View */}
      <div className="flex-1 bg-white dark:bg-[#050608] flex flex-col h-full min-w-0">
        {activeTab === "compose" ? (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              {composeChannel === "WhatsApp"
                ? language === "zh" ? "发送 WhatsApp 消息" : "Send WhatsApp Message"
                : composeMode === "reply" ? "Reply Mail" : composeMode === "forward" ? "Forward Mail" : "Compose Mail"}
            </h2>
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-4">
                  <label className="w-16 shrink-0 mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    {composeChannel === "WhatsApp" ? "WhatsApp" : "To"}
                  </label>
                  <div className="flex-1">
                    <TaggedEmailInput
                      value={composeTo}
                      onChange={(next) => {
                        setComposeTo(next);
                        if (composeChannel === "Email" && next[0] && next[0] !== composeTo[0]) applySignatureForRecipient(next[0]);
                      }}
                      customers={customers}
                      preferredContactType={composeChannel === "WhatsApp" ? "WhatsApp" : "Email"}
                      placeholder={composeChannel === "WhatsApp" ? "Type @name or WhatsApp number..." : "Type @name or email..."}
                    />
                  </div>
                  {composeChannel === "Email" && <div className="flex gap-2 shrink-0 mt-2">
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
                  </div>}
                </div>
                {composeChannel === "Email" && showCc && (
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
                {composeChannel === "Email" && showBcc && (
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
              {composeChannel === "Email" && <div className="flex items-center gap-4">
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
              </div>}
              {composeChannel === "Email" && <div className="flex items-start gap-4">
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
              </div>}
              {composeChannel === "WhatsApp" ? (
                <div className="mt-4 flex min-h-[430px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
                  <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-black/20">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      <MessageCircle className="h-4 w-4 text-emerald-500" />
                      {activeWhatsAppTarget || (language === "zh" ? "选择 WhatsApp 收件人" : "Select a WhatsApp recipient")}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {language === "zh" ? "这里会显示与该号码的收发记录。" : "Messages with this number appear here."}
                    </p>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    {activeWhatsAppTarget && whatsappConversationItems.length === 0 && (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">
                        {language === "zh" ? "暂无聊天记录，可以直接发送第一条消息。" : "No conversation yet. Send the first message below."}
                      </div>
                    )}
                    {!activeWhatsAppTarget && (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">
                        {language === "zh" ? "先输入号码，或输入 @ 选择客户。" : "Enter a number or type @ to choose a customer."}
                      </div>
                    )}
                    {whatsappConversationItems.map((item) => (
                      <div
                        key={item.id}
                        className={cn("flex", item.direction === "outbound" ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                            item.direction === "outbound"
                              ? "rounded-br-md bg-emerald-600 text-white"
                              : "rounded-bl-md border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-black/30 dark:text-slate-200",
                          )}
                        >
                          <div className="whitespace-pre-wrap break-words">
                            {item.content}
                            {item.attachments?.map((attachment) => (
                              <WhatsAppAttachmentView key={attachment.id || attachment.url} attachment={attachment} />
                            ))}
                          </div>
                          <div
                            className={cn(
                              "mt-1 text-[10px]",
                              item.direction === "outbound" ? "text-emerald-100" : "text-slate-400",
                            )}
                          >
                            {item.time}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-black/20">
                    {selectedWhatsAppMedia.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {selectedWhatsAppMedia.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                          >
                            {item.type === "image" ? (
                              <img src={item.url} alt={item.name} className="h-8 w-8 rounded object-cover" />
                            ) : (
                              <Paperclip className="h-4 w-4" />
                            )}
                            <span className="max-w-[160px] truncate">{item.name}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedWhatsAppMedia((prev) => prev.filter((media) => media.id !== item.id))}
                              className="text-emerald-700 hover:text-red-500 dark:text-emerald-200"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <textarea
                      value={composeBody}
                      onChange={(event) => setComposeBody(event.target.value)}
                      placeholder={language === "zh" ? "输入 WhatsApp 消息..." : "Type a WhatsApp message..."}
                      className="min-h-[92px] w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                    {activeWhatsAppTargetKey && (
                      <label className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={activeComposeWhatsAppOutboundTranslateEnabled}
                          onChange={(event) => saveOutboundWhatsAppTranslatePref(activeWhatsAppTargetKey, event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>{language === "zh" ? "发送前自动翻译" : "Translate before sending"}</span>
                        <span>{language === "zh" ? "目标语言" : "Target language"}</span>
                        <select
                          value={activeComposeWhatsAppCustomer?.preferredLanguage || ""}
                          onChange={(event) => saveCustomerPreferredLanguage(activeComposeWhatsAppCustomer, event.target.value)}
                          disabled={!activeComposeWhatsAppCustomer}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                          title={!activeComposeWhatsAppCustomer ? (language === "zh" ? "当前号码未匹配到客户" : "No matched customer for this number") : undefined}
                        >
                          <option value="">{activeComposeWhatsAppTargetLanguage}</option>
                          {CUSTOMER_LANGUAGE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="relative flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEmojiPickerOpen((open) => !open);
                            setIsMediaPickerOpen(false);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                          title={language === "zh" ? "添加 Emoji" : "Add emoji"}
                        >
                          <Smile className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsMediaPickerOpen((open) => !open);
                            setIsEmojiPickerOpen(false);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                          title={language === "zh" ? "选择媒体素材" : "Choose media asset"}
                        >
                          <ImageIcon className="h-4 w-4" />
                        </button>
                        {isEmojiPickerOpen && (
                          <div className="absolute bottom-11 left-0 z-20 grid w-56 grid-cols-6 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-slate-900">
                            {WHATSAPP_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  setComposeBody((body) => `${body}${emoji}`);
                                  setIsEmojiPickerOpen(false);
                                }}
                                className="rounded-lg p-2 text-lg hover:bg-slate-100 dark:hover:bg-white/10"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                        {isMediaPickerOpen && (
                          <div className="absolute bottom-11 left-10 z-20 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-slate-900">
                            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                              {language === "zh" ? "媒体素材库" : "Media Library"}
                            </div>
                            <div className="max-h-64 space-y-2 overflow-y-auto">
                              {mediaItems.length === 0 && (
                                <div className="py-6 text-center text-sm text-slate-400">
                                  {language === "zh" ? "暂无媒体素材" : "No media assets"}
                                </div>
                              )}
                              {mediaItems.map((item) => {
                                const selected = selectedWhatsAppMedia.some((media) => media.id === item.id);
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() =>
                                      {
                                        setSelectedWhatsAppMedia((prev) =>
                                          selected ? prev.filter((media) => media.id !== item.id) : [...prev, item],
                                        );
                                        setIsMediaPickerOpen(false);
                                      }
                                    }
                                    className={cn(
                                      "flex w-full items-center gap-3 rounded-lg border p-2 text-left text-sm transition-colors",
                                      selected
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                                        : "border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/10",
                                    )}
                                  >
                                    {item.type === "image" ? (
                                      <img src={item.url} alt={item.name} className="h-10 w-10 rounded object-cover" />
                                    ) : (
                                      <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 dark:bg-white/10">
                                        <Paperclip className="h-4 w-4 text-slate-500" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate font-medium text-slate-800 dark:text-slate-100">{item.name}</div>
                                      <div className="text-xs capitalize text-slate-400">{item.type}</div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {selectedWhatsAppMedia.length > 0
                          ? `${selectedWhatsAppMedia.length} ${language === "zh" ? "个附件" : "attachment(s)"}`
                          : language === "zh" ? "支持 Emoji、图片和文件" : "Emoji, images, and files supported"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
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
              )}
              {composeOriginalMessage && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  <div className="mb-2 font-semibold text-slate-800 dark:text-slate-100">
                    {composeOriginalMessage.channel === "WhatsApp" ? "Original WhatsApp message" : "Original email"}
                  </div>
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
                  {composeChannel === "WhatsApp" && waClients.length > 0 && (
                    <select
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className="px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                    >
                      {waClients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name} ({client.status})
                        </option>
                      ))}
                    </select>
                  )}
                  {composeChannel === "Email" && (
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
                  )}
                  {composeChannel === "Email" && showComposeSchedule && (
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
                    disabled={isSending || !composeTo.length || (composeChannel === "Email" && !composeSubject.trim()) || !stripHtml(composeBody)}
                    className={cn(
                      "px-6 py-2 text-sm font-medium text-white rounded-lg shadow-md transition-colors flex items-center gap-2 disabled:opacity-50",
                      composeChannel === "WhatsApp" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700",
                    )}
                  >
                    {composeChannel === "WhatsApp" ? <MessageCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {isSending ? "Sending..." : composeChannel === "WhatsApp" ? "Send WhatsApp" : showComposeSchedule ? "Schedule" : "Send"}
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
                  {activeMessageCustomer ? (
                    <button
                      type="button"
                      onClick={() => setDetailCustomerId(activeMessageCustomer.id)}
                      className="text-left text-xl font-semibold tracking-tight text-blue-700 underline-offset-4 hover:underline dark:text-blue-300"
                      title={activeMessageCustomer.name}
                    >
                      {activeMessageTitle}
                    </button>
                  ) : (
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight whitespace-normal break-words leading-snug" title={activeMessageTitle}>
                      {activeMessageTitle}
                    </h2>
                  )}
                  <span className="px-2 py-1 bg-white dark:bg-white/10 shadow-sm border border-slate-200 dark:border-white/20 text-slate-700 dark:text-slate-300 rounded text-[10px] font-mono tracking-widest uppercase shrink-0">
                    {activeMessage.intent}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>From:</span>
                  {activeMessage.channel === "WhatsApp" ? (() => {
                    const chatId = getMessageChatId(activeMessage);
                    const mappedMob = whatsAppChatMobMappings[chatId] || activeMessage.mob || activeMessage.sender;
                    const isEditing = editingChatMobId === chatId;
                    const displayAddress = mappedMob || chatId;
                    return (
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        {isEditing ? (
                          <input
                            value={editingChatMob}
                            onChange={(event) => setEditingChatMob(event.target.value)}
                            onBlur={() => saveWhatsAppChatMobMapping(chatId, editingChatMob)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                saveWhatsAppChatMobMapping(chatId, editingChatMob);
                              }
                              if (event.key === "Escape") {
                                setEditingChatMobId("");
                                setEditingChatMob("");
                              }
                            }}
                            autoFocus
                            className="w-48 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 outline-none focus:border-emerald-500 dark:border-emerald-500/40 dark:bg-black/30 dark:text-slate-100"
                            placeholder={language === "zh" ? "输入 mob/手机号" : "Enter mob / phone"}
                          />
                        ) : (
                          <button
                            type="button"
                            onDoubleClick={() => {
                              setEditingChatMobId(chatId);
                              setEditingChatMob(mappedMob || "");
                            }}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                            title={language === "zh" ? "双击编辑 WhatsApp 手机号映射" : "Double-click to edit WhatsApp phone mapping"}
                          >
                            {displayAddress}
                          </button>
                        )}
                      </span>
                    );
                  })() : (() => {
                    const c = customers.find((c) =>
                      c.contacts?.some(
                        (contact) =>
                          contact.value.toLowerCase() ===
                          activeMessage.sender.toLowerCase(),
                      ),
                    );
                    return c ? (
                      <button
                        type="button"
                        onClick={() => setDetailCustomerId(c.id)}
                        className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 flex items-center gap-1"
                      >
                        <User className="w-3 h-3" />
                        {c.name}{" "}
                        <span className="text-slate-400 dark:text-slate-500 no-underline text-xs">
                          ({activeMessage.sender})
                        </span>
                      </button>
                    ) : (
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {activeMessage.sender}
                      </span>
                    );
                  })()}
                  {activeMessage.channel !== "WhatsApp" && activeMessage.target && (
                    <span className="ml-2">
                      To:{" "}
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {activeMessage.target}
                      </span>
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>{language === "zh" ? "关联客户:" : "Linked customer:"}</span>
                  <div className="w-full max-w-[360px]">
                    <CustomerSearchDropdown
                      customers={customers}
                      value={activeMessage.customerId || activeMessageCustomer?.id || ""}
                      onChange={(customerId) => linkMessageToCustomer(activeMessage, customerId)}
                      placeholder={language === "zh" ? "搜索客户名称、联系人或标签..." : "Search customer, contact, or tag..."}
                      emptyLabel={language === "zh" ? "未关联客户" : "No linked customer"}
                    />
                  </div>
                  {activeMessageCustomer && (
                    <button
                      type="button"
                      onClick={() => setDetailCustomerId(activeMessageCustomer.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                    >
                      <User className="h-3.5 w-3.5" />
                      {activeMessageCustomer.name}
                    </button>
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
                {activeMessage.channel === "WhatsApp" && (
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={activeWhatsAppAutoTranslateEnabled}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        if (!activeWhatsAppAutoTranslateKey) return;
                        if (enabled) setFailedTranslationIds(new Set());
                        const nextPrefs = {
                          ...autoTranslateWhatsAppPrefs,
                          [activeWhatsAppAutoTranslateKey]: enabled,
                        };
                        setAutoTranslateWhatsAppPrefs(nextPrefs);
                        localStorage.setItem(WHATSAPP_AUTO_TRANSLATE_PREFS_KEY, JSON.stringify(nextPrefs));
                        saveAppSetting(WHATSAPP_AUTO_TRANSLATE_PREFS_KEY, nextPrefs);
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {language === "zh" ? "自动翻译" : "Auto translate"}
                  </label>
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
                        "flex w-fit flex-col",
                        tMsg.htmlContent ? "max-w-full" : "max-w-[85%]",
                        tMsg.sender === "agent" && !tMsg.htmlContent ? "ml-auto items-end" : "mr-auto items-start",
                      )}
                    >
                      <div className={cn("flex items-center gap-2 mb-1", tMsg.sender === "agent" && !tMsg.htmlContent ? "justify-end" : "justify-start")}>
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
                          "w-fit max-w-full break-words p-4 rounded-2xl text-sm leading-relaxed",
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
                          (() => {
                            const translationKey = whatsappTranslationKey(activeMessage.id, tMsg.id, language === "zh" ? "Chinese" : "English");
                            const translation = whatsAppTranslations[translationKey];
                            const isTranslating = translatingMessageIds.has(translationKey);
                            return (
                              <div className="whitespace-pre-wrap break-words">
                                {tMsg.content}
                                {isTranslating && tMsg.sender !== "agent" && activeWhatsAppAutoTranslateEnabled && (
                                  <div className="mt-3 border-t border-current/20 pt-2 text-xs opacity-75">
                                    {language === "zh" ? "正在翻译..." : "Translating..."}
                                  </div>
                                )}
                                {translation?.shouldTranslate && translation.translatedText && (
                                  <div className="mt-3 border-t border-current/20 pt-2">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest opacity-60">
                                      {language === "zh" ? "翻译" : "Translation"} · {translation.sourceLanguage}
                                    </div>
                                    {translation.translatedText}
                                  </div>
                                )}
                                {tMsg.attachments?.map((attachment) => (
                                  <WhatsAppAttachmentView key={attachment.id || attachment.url} attachment={attachment} />
                                ))}
                              </div>
                            );
                          })()
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
                        <div className="mt-4 border-t border-blue-200 pt-4 dark:border-blue-500/10">
                          <div className="mb-2 text-xs font-semibold text-slate-500">
                            {language === "zh" ? "快捷处理选项" : "Options"}
                          </div>
                          {(() => {
                            const insight = inboxInsights[activeMessage.id];
                            const isSpam = isLikelySpamMessage(activeMessage, insight);
                            return (
                              <div className="flex flex-wrap gap-2">
                                {!isSpam && (
                                  <button
                                    type="button"
                                    onClick={handleDraftAIReply}
                                    disabled={isDrafting}
                                    className="flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-50 dark:border-blue-600 dark:bg-white/5 dark:text-blue-400 dark:hover:bg-blue-900/30"
                                  >
                                    {isDrafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                    {isDrafting ? "Drafting..." : "Draft AI Reply"}
                                  </button>
                                )}
                                {isSpam && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setDeletingMessageId(activeMessage.id)}
                                      className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 dark:border-red-500/30 dark:bg-white/5 dark:text-red-300 dark:hover:bg-red-500/10"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      {language === "zh" ? "删除垃圾邮件" : "Delete Spam"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => addMessageTag(activeMessage, "spam")}
                                      className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-700 shadow-sm transition-colors hover:bg-amber-50 dark:border-amber-500/30 dark:bg-white/5 dark:text-amber-300 dark:hover:bg-amber-500/10"
                                    >
                                      <Tag className="h-4 w-4" />
                                      {language === "zh" ? "标记垃圾" : "Tag Spam"}
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => markMessageImportant(activeMessage)}
                                  className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-700 shadow-sm transition-colors hover:bg-amber-50 dark:border-amber-500/30 dark:bg-white/5 dark:text-amber-300 dark:hover:bg-amber-500/10"
                                >
                                  <Star className="h-4 w-4" />
                                  {language === "zh" ? "标记重要" : "Mark Important"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addMessageTag(activeMessage, "follow-up")}
                                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                                >
                                  <Tag className="h-4 w-4" />
                                  {language === "zh" ? "加入跟进" : "Tag Follow-up"}
                                </button>
                                {activeMessage.direction !== "outbound" && activeMessage.intent !== "Outbound" && (
                                  <button
                                    type="button"
                                    onClick={() => assignMessageToSales(activeMessage)}
                                    className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-white/5 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                                  >
                                    <User className="h-4 w-4" />
                                    {language === "zh" ? "分配销售" : "Assign Sales"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => startForward(activeMessage)}
                                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                                >
                                  <Forward className="h-4 w-4" />
                                  {language === "zh" ? "转发" : "Forward"}
                                </button>
                                {isSpam && (
                                  <button
                                    type="button"
                                    onClick={() => updateSenderAnalysisMode(activeMessage.sender, "manual")}
                                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                                  >
                                    <Bot className="h-4 w-4" />
                                    {language === "zh" ? "该发件人手动分析" : "Sender Manual Analysis"}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {activeMessage.channel === "WhatsApp" && (
                  <div className="shrink-0 border-t border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-black/20">
                    {selectedWhatsAppMedia.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {selectedWhatsAppMedia.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                          >
                            {item.type === "image" ? (
                              <img src={item.url} alt={item.name} className="h-8 w-8 rounded object-cover" />
                            ) : (
                              <Paperclip className="h-4 w-4" />
                            )}
                            <span className="max-w-[180px] truncate">{item.name}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedWhatsAppMedia((prev) => prev.filter((media) => media.id !== item.id))}
                              className="text-emerald-700 hover:text-red-500 dark:text-emerald-200"
                              aria-label={language === "zh" ? "移除附件" : "Remove attachment"}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {activeWhatsAppAutoTranslateKey && (
                      <label className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={activeWhatsAppOutboundTranslateEnabled}
                          onChange={(event) => saveOutboundWhatsAppTranslatePref(activeWhatsAppAutoTranslateKey, event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>{language === "zh" ? "发送前自动翻译" : "Translate before sending"}</span>
                        <span>{language === "zh" ? "目标语言" : "Target language"}</span>
                        <select
                          value={activeWhatsAppOutboundCustomer?.preferredLanguage || ""}
                          onChange={(event) => saveCustomerPreferredLanguage(activeWhatsAppOutboundCustomer, event.target.value)}
                          disabled={!activeWhatsAppOutboundCustomer}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                          title={!activeWhatsAppOutboundCustomer ? (language === "zh" ? "当前号码未匹配到客户" : "No matched customer for this number") : undefined}
                        >
                          <option value="">{activeWhatsAppOutboundTargetLanguage}</option>
                          {CUSTOMER_LANGUAGE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="flex items-end gap-2">
                      <div className="relative flex items-center gap-1 pb-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEmojiPickerOpen((open) => !open);
                            setIsMediaPickerOpen(false);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                          title={language === "zh" ? "添加 Emoji" : "Add emoji"}
                          aria-label={language === "zh" ? "添加 Emoji" : "Add emoji"}
                        >
                          <Smile className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsMediaPickerOpen((open) => !open);
                            setIsEmojiPickerOpen(false);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                          title={language === "zh" ? "选择媒体素材" : "Choose media asset"}
                          aria-label={language === "zh" ? "选择媒体素材" : "Choose media asset"}
                        >
                          <ImageIcon className="h-4 w-4" />
                        </button>
                        {isEmojiPickerOpen && (
                          <div className="absolute bottom-11 left-0 z-20 grid w-56 grid-cols-6 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-slate-900">
                            {WHATSAPP_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  setReplyText((body) => `${body}${emoji}`);
                                  setIsEmojiPickerOpen(false);
                                }}
                                className="rounded-lg p-2 text-lg hover:bg-slate-100 dark:hover:bg-white/10"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                        {isMediaPickerOpen && (
                          <div className="absolute bottom-11 left-10 z-20 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-slate-900">
                            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                              {language === "zh" ? "媒体素材库" : "Media Library"}
                            </div>
                            <div className="max-h-64 space-y-2 overflow-y-auto">
                              {mediaItems.length === 0 && (
                                <div className="py-6 text-center text-sm text-slate-400">
                                  {language === "zh" ? "暂无媒体素材" : "No media assets"}
                                </div>
                              )}
                              {mediaItems.map((item) => {
                                const selected = selectedWhatsAppMedia.some((media) => media.id === item.id);
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedWhatsAppMedia((prev) =>
                                        selected ? prev.filter((media) => media.id !== item.id) : [...prev, item],
                                      );
                                      setIsMediaPickerOpen(false);
                                    }}
                                    className={cn(
                                      "flex w-full items-center gap-3 rounded-lg border p-2 text-left text-sm transition-colors",
                                      selected
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                                        : "border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/10",
                                    )}
                                  >
                                    {item.type === "image" ? (
                                      <img src={item.url} alt={item.name} className="h-10 w-10 rounded object-cover" />
                                    ) : (
                                      <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 dark:bg-white/10">
                                        <Paperclip className="h-4 w-4 text-slate-500" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate font-medium text-slate-800 dark:text-slate-100">{item.name}</div>
                                      <div className="text-xs capitalize text-slate-400">{item.type}</div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      <textarea
                        value={replyText}
                        onChange={(event) => {
                          setReplyText(event.target.value);
                          setDrafts((prev) => ({ ...prev, [activeMessage.id]: event.target.value }));
                        }}
                        onKeyDown={(event) => {
                          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                            event.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder={language === "zh" ? "输入 WhatsApp 消息..." : "Type a WhatsApp message..."}
                        className="min-h-[52px] max-h-32 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={isSending || (!stripHtml(replyText) && selectedWhatsAppMedia.length === 0)}
                        className="mb-1 flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {language === "zh" ? "发送" : "Send"}
                      </button>
                    </div>
                  </div>
                )}

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
        title={
          deletingMessageId === BULK_DELETE_SENTINEL
            ? language === "zh" ? "批量删除消息" : "Delete Messages"
            : language === "zh" ? "删除消息" : "Delete Message"
        }
        message={
          deletingMessageId === BULK_DELETE_SENTINEL
            ? language === "zh"
              ? `确定要删除选中的 ${selectedMessageIds.length} 条消息/邮件吗？此操作无法撤销。`
              : `Delete ${selectedMessageIds.length} selected message(s)? This action cannot be undone.`
            : language === "zh"
              ? "确定要删除这条消息/邮件线程吗？此操作无法撤销。"
              : "Are you sure you want to delete this message or email thread? This action cannot be undone."
        }
        confirmText={language === "zh" ? "删除" : "Delete"}
        cancelText={language === "zh" ? "取消" : "Cancel"}
        onConfirm={handleConfirmDeleteMessage}
        onCancel={() => setDeletingMessageId(null)}
      />
      {detailCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-white/10 dark:bg-white/5">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-300">
                  <User className="h-4 w-4" />
                  {language === "zh" ? "客户详情" : "Customer Detail"}
                </div>
                <h3 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{detailCustomer.name}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {[detailCustomer.industry, detailCustomer.city, detailCustomer.country].filter(Boolean).join(" · ") || detailCustomer.contact}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailCustomerId(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
                aria-label={language === "zh" ? "关闭" : "Close"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">{language === "zh" ? "阶段" : "Stage"}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">{detailCustomer.stage}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">{language === "zh" ? "评分 / 风险" : "Score / Risk"}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {detailCustomer.score} · {detailCustomer.risk}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">{language === "zh" ? "联系方式" : "Contacts"}</div>
                <div className="space-y-2">
                  {(detailCustomer.contacts?.length ? detailCustomer.contacts : [{ id: "primary", type: "Primary", value: detailCustomer.contact }]).map((contact) => (
                    <div key={contact.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-black/20">
                      <span className="font-medium text-slate-500 dark:text-slate-400">{contact.type}</span>
                      <span className="min-w-0 truncate text-slate-800 dark:text-slate-100">{contact.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              {detailCustomer.description && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  {detailCustomer.description}
                </div>
              )}
              {detailCustomer.tags && detailCustomer.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {detailCustomer.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-white/10 dark:bg-white/5">
              <button
                type="button"
                onClick={() => setDetailCustomerId(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              >
                {language === "zh" ? "关闭" : "Close"}
              </button>
              <Link
                to={`/customers/${detailCustomer.id}`}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                {language === "zh" ? "打开完整详情" : "Open Full Detail"}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaggedEmailInput({
  value,
  onChange,
  customers,
  placeholder,
  preferredContactType = "Email",
}: {
  value: string[];
  onChange: (val: string[]) => void;
  customers: Customer[];
  placeholder: string;
  preferredContactType?: string;
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
          selected.contacts?.find((c) => c.type === preferredContactType)?.value ||
          selected.contacts?.find((c) => c.type === "WhatsApp")?.value ||
          selected.contacts?.find((c) => c.type === "Mobile")?.value ||
          selected.contacts?.find((c) => c.type === "Phone")?.value ||
          selected.contacts?.find((c) => c.type === "Email")?.value ||
          selected.contact ||
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
              c.contacts?.find((contact) => contact.type === preferredContactType)?.value ||
              c.contacts?.find((contact) => contact.type === "WhatsApp")?.value ||
              c.contacts?.find((contact) => contact.type === "Mobile")?.value ||
              c.contacts?.find((contact) => contact.type === "Phone")?.value ||
              c.contacts?.find((contact) => contact.type === "Email")?.value ||
              c.contact ||
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

function CustomerSearchDropdown({
  customers,
  value,
  onChange,
  placeholder,
  emptyLabel,
}: {
  customers: Customer[];
  value: string;
  onChange: (customerId: string) => void;
  placeholder: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedCustomer = customers.find((customer) => customer.id === value);
  const inputValue = open ? query : selectedCustomer?.name || "";
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCustomers = customers
    .filter((customer) => {
      if (!normalizedQuery) return true;
      const haystack = [
        customer.name,
        customer.contact,
        customer.industry,
        customer.country,
        ...(customer.tags || []),
        ...(customer.contacts || []).flatMap((contact) => [contact.type, contact.value]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .slice(0, 8);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const selectCustomer = (customerId: string) => {
    onChange(customerId);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, filteredCustomers.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = filteredCustomers[activeIndex];
      if (selected) selectCustomer(selected.id);
    }
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div className="relative">
      <div
        className="flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm transition-colors focus-within:border-blue-500 dark:border-white/10 dark:bg-white/5"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <User className={cn("h-4 w-4 shrink-0", selectedCustomer ? "text-blue-600 dark:text-blue-300" : "text-slate-400")} />
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => {
            setQuery("");
            setOpen(false);
          }, 120)}
          onKeyDown={handleKeyDown}
          placeholder={open ? placeholder : selectedCustomer ? selectedCustomer.name : emptyLabel}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
        {value && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              selectCustomer("");
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-white/10"
            aria-label="Clear customer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-slate-900">
          {filteredCustomers.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-400">No customers found</div>
          ) : (
            filteredCustomers.map((customer, index) => {
              const primaryContact =
                customer.contacts?.find((contact) => ["Email", "WhatsApp", "Mobile", "Phone"].includes(contact.type))?.value ||
                customer.contact;
              const active = index === activeIndex;
              return (
                <button
                  key={customer.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectCustomer(customer.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    active ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "hover:bg-slate-50 dark:hover:bg-white/10",
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{customer.name}</div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">{primaryContact}</div>
                  </div>
                  {customer.id === value && (
                    <CheckSquare className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                  )}
                </button>
              );
            })
          )}
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
