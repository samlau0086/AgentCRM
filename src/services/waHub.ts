export interface WaClient {
  id: string;
  name: string;
  phone: string;
  status: 'online' | 'offline';
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

export const getHubConfig = () => {
  return {
    url: (localStorage.getItem('wa_hub_url') || '').replace(/\/+$/, ''),
    token: localStorage.getItem('wa_hub_token') || ''
  };
};

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
    headers: token ? { 'x-hub-token': token } : undefined,
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
    headers: { 'x-hub-token': token }
  });
  if (!res.ok) throw new Error('Failed to fetch clients');
  const data = await res.json();
  return data.clients;
}

export async function fetchMessages(limit: number = 50): Promise<WaMessage[]> {
  const { url, token } = getHubConfig();
  if (!url || !token) {
    return [];
  }

  const res = await fetch(`${url}/api/messages?limit=${limit}`, {
    headers: { 'x-hub-token': token }
  });
  if (!res.ok) throw new Error('Failed to fetch messages');
  const data = await res.json();
  return data.messages;
}

export async function sendMessage(to: string, body: string, clientId?: string, attachments?: Array<{ name: string; type: string; mimeType?: string; url: string; size: number }>) {
  const { url, token } = getHubConfig();
  if (!url || !token) {
    throw new Error('WhatsApp Actor Hub is not configured.');
  }

  const payload: any = { to, body };
  if (clientId) payload.clientId = clientId;
  if (attachments?.length) {
    const attachment = attachments[0];
    payload.media = {
      url: attachment.url,
      originalName: attachment.name,
      mimeType: attachment.mimeType || attachment.type,
      sendAsDocument: !(attachment.mimeType || attachment.type)?.startsWith('image/') && !(attachment.mimeType || attachment.type)?.startsWith('video/'),
    };
  }

  const res = await fetch(`${url}/api/tasks/send-message`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-token': token
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to send message task');
  return res.json();
}
