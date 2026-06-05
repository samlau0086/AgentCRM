export interface WaClient {
  id: string;
  name: string;
  phone: string;
  status: 'online' | 'offline';
}

export interface WaHubActor {
  id: string;
  clientId: string;
  name: string;
  phone?: string;
  status?: string;
  updatedAt?: string;
}

export const WA_HUB_ACTORS_KEY = 'wa_hub_actors';

export function waHubActorsKeyForUser(userId?: string) {
  return userId ? `${WA_HUB_ACTORS_KEY}:${userId}` : WA_HUB_ACTORS_KEY;
}

export interface WaMediaPayload {
  id?: string;
  originalName?: string;
  name?: string;
  mimeType?: string;
  type?: string;
  size?: number;
  url?: string;
  source?: string;
  whatsappMessageId?: string;
}

export interface WaMessage {
  id: string;
  client_id: string;
  clientId?: string;
  chatId?: string;
  chat_id?: string;
  chatid?: string;
  conversation_key?: string;
  conversation_id?: string;
  mob?: string;
  mobile?: string;
  direction: 'inbound' | 'outbound';
  sender: string;
  recipient: string;
  body: string;
  message_type?: string;
  payload?: {
    caption?: string;
    media?: WaMediaPayload;
    [key: string]: unknown;
  };
  created_at: string;
}

export interface WaTask {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | string;
  error?: string;
  result?: unknown;
  [key: string]: unknown;
}

type WaAttachment = {
  name: string;
  type: string;
  mimeType?: string;
  url: string;
  size: number;
};

export function parseWaHubActors(value: unknown): WaHubActor[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return Array.isArray(parsed)
      ? parsed
          .filter((actor) => actor?.clientId)
          .map((actor) => ({
            id: String(actor.id || `wa_actor_${actor.clientId}`),
            clientId: String(actor.clientId),
            name: String(actor.name || actor.clientId),
            phone: actor.phone ? String(actor.phone) : undefined,
            status: actor.status ? String(actor.status) : undefined,
            updatedAt: actor.updatedAt ? String(actor.updatedAt) : undefined,
          }))
      : [];
  } catch {
    return [];
  }
}

export function getConfiguredWaHubActors(userId?: string) {
  const userKey = waHubActorsKeyForUser(userId);
  const userActors = parseWaHubActors(localStorage.getItem(userKey));
  if (userId) return userActors;
  return userActors.length > 0 ? userActors : parseWaHubActors(localStorage.getItem(WA_HUB_ACTORS_KEY));
}

export const getHubConfig = () => {
  return {
    url: (localStorage.getItem('wa_hub_url') || '').replace(/\/+$/, ''),
    token: localStorage.getItem('wa_hub_token') || ''
  };
};

function authHeaders(token: string, extra?: Record<string, string>) {
  return {
    ...(extra || {}),
    'x-hub-token': token,
    Authorization: `Bearer ${token}`,
  };
}

async function readJsonError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  const message = data?.error || data?.message || fallback;
  return String(message);
}

export function resolveHubMediaUrl(url = '') {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:') || url.startsWith('data:')) return url;
  const { url: hubUrl } = getHubConfig();
  if (!hubUrl) return url;
  return `${hubUrl}${url.startsWith('/') ? url : `/${url}`}`;
}

export async function fetchHubMediaBlob(url: string) {
  const { token } = getHubConfig();
  const resolvedUrl = resolveHubMediaUrl(url);
  if (!resolvedUrl) throw new Error('Media URL is missing.');
  const res = await fetch(resolvedUrl, {
    headers: token ? authHeaders(token) : undefined,
  });
  if (!res.ok) throw new Error(`Failed to fetch WhatsApp media with HTTP ${res.status}.`);
  return res.blob();
}

export async function fetchClients(): Promise<WaClient[]> {
  const { url, token } = getHubConfig();
  if (!url || !token) {
    return [];
  }

  const res = await fetch(`${url}/api/clients`, {
    headers: authHeaders(token)
  });
  if (!res.ok) throw new Error('Failed to fetch clients');
  const data = await res.json();
  return data.clients;
}

async function fetchMessagesForClient(limit: number, clientId?: string): Promise<WaMessage[]> {
  const { url, token } = getHubConfig();
  if (!url || !token) {
    return [];
  }

  const params = new URLSearchParams({ limit: String(limit) });
  if (clientId) params.set('clientId', clientId);
  const res = await fetch(`${url}/api/messages?${params.toString()}`, {
    headers: authHeaders(token)
  });
  if (!res.ok) throw new Error('Failed to fetch messages');
  const data = await res.json();
  return data.messages || [];
}

export async function fetchMessages(limit: number = 50, clientIds: string[] = []): Promise<WaMessage[]> {
  const uniqueClientIds = Array.from(new Set(clientIds.filter(Boolean)));
  if (uniqueClientIds.length === 0) return fetchMessagesForClient(limit);
  const results = await Promise.all(uniqueClientIds.map((clientId) => fetchMessagesForClient(limit, clientId)));
  const seen = new Set<string>();
  return results.flat().filter((message) => {
    const key = `${message.client_id || message.clientId || ''}:${message.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isWhatsAppChatId(value: string) {
  return /@(c\.us|g\.us|lid)$/i.test(value.trim());
}

function isHubUploadUrl(value: string, hubUrl: string) {
  if (!value) return false;
  if (value.startsWith('/uploads/')) return true;
  return value.startsWith(`${hubUrl}/uploads/`);
}

function hubRelativeUploadUrl(value: string, hubUrl: string) {
  return value.startsWith(`${hubUrl}/uploads/`) ? value.slice(hubUrl.length) : value;
}

async function uploadHubAttachment(attachment: WaAttachment) {
  const { url, token } = getHubConfig();
  if (!url || !token) {
    throw new Error('WhatsApp Actor Hub is not configured.');
  }

  const mimeType = attachment.mimeType || attachment.type || 'application/octet-stream';
  if (isHubUploadUrl(attachment.url, url)) {
    return {
      url: hubRelativeUploadUrl(attachment.url, url),
      originalName: attachment.name,
      mimeType,
      size: attachment.size,
    };
  }

  const sourceUrl = resolveHubMediaUrl(attachment.url);
  const blobRes = await fetch(sourceUrl);
  if (!blobRes.ok) {
    throw new Error(`Failed to read WhatsApp attachment "${attachment.name}" with HTTP ${blobRes.status}.`);
  }

  const blob = await blobRes.blob();
  const file = new File([blob], attachment.name || 'whatsapp-attachment', { type: blob.type || mimeType });
  const form = new FormData();
  form.append('file', file);

  const uploadRes = await fetch(`${url}/api/uploads`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  });
  if (!uploadRes.ok) {
    throw new Error(await readJsonError(uploadRes, `Failed to upload WhatsApp attachment with HTTP ${uploadRes.status}.`));
  }
  const data = await uploadRes.json().catch(() => ({}));
  const uploaded = data.file || data.upload || data.media;
  if (!uploaded?.url) {
    throw new Error('WhatsApp Hub upload response did not include a media URL.');
  }
  return {
    url: uploaded.url,
    originalName: uploaded.originalName || attachment.name,
    mimeType: uploaded.mimeType || file.type || mimeType,
    size: uploaded.size || attachment.size,
  };
}

export async function fetchTask(taskId: string): Promise<WaTask> {
  const { url, token } = getHubConfig();
  if (!url || !token) {
    throw new Error('WhatsApp Actor Hub is not configured.');
  }

  const res = await fetch(`${url}/api/tasks/${encodeURIComponent(taskId)}`, {
    headers: authHeaders(token)
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('WhatsApp task was created, but this Hub token cannot verify delivery. Add the tasks:read permission to the WhatsApp Hub API token.');
    }
    throw new Error(await readJsonError(res, `Failed to query WhatsApp task with HTTP ${res.status}.`));
  }
  const data = await res.json();
  return data.task || data;
}

async function waitForTask(taskId: string, timeoutMs = 45000, intervalMs = 1500) {
  const startedAt = Date.now();
  let lastTask: WaTask | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    lastTask = await fetchTask(taskId);
    if (lastTask.status === 'succeeded') return lastTask;
    if (lastTask.status === 'failed') {
      throw new Error(lastTask.error || `WhatsApp task ${taskId} failed.`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const status = lastTask?.status || 'unknown';
  throw new Error(`WhatsApp task ${taskId} was created but not confirmed after ${Math.round(timeoutMs / 1000)}s. Current status: ${status}.`);
}

export async function sendMessage(to: string, body: string, clientId?: string, attachments?: WaAttachment[]) {
  const { url, token } = getHubConfig();
  if (!url || !token) {
    throw new Error('WhatsApp Actor Hub is not configured.');
  }

  const target = to.trim();
  if (!target) {
    throw new Error('WhatsApp recipient is required.');
  }

  const payload: any = {
    to: target,
    body,
    metadata: { source: 'crm' },
  };
  if (isWhatsAppChatId(target)) payload.chatId = target;
  if (clientId) payload.clientId = clientId;
  if (attachments?.length) {
    const attachment = await uploadHubAttachment(attachments[0]);
    const mimeType = attachment.mimeType || 'application/octet-stream';
    payload.media = {
      url: attachment.url,
      originalName: attachment.originalName,
      mimeType,
      sendAsDocument: !mimeType.startsWith('image/') && !mimeType.startsWith('video/'),
    };
  }

  const res = await fetch(`${url}/api/tasks/send-message`, {
    method: 'POST',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(await readJsonError(res, `Failed to create WhatsApp send task with HTTP ${res.status}.`));
  }
  const data = await res.json().catch(() => ({}));
  const task = data.task || data;
  if (!task?.id) return task;
  return waitForTask(task.id);
}
