export interface WaClient {
  id: string;
  name: string;
  phone: string;
  status: 'online' | 'offline';
}

export interface WaMessage {
  id: string;
  client_id: string;
  direction: 'inbound' | 'outbound';
  sender: string;
  recipient: string;
  body: string;
  created_at: string;
}

const getHubConfig = () => {
  return {
    url: localStorage.getItem('wa_hub_url') || '',
    token: localStorage.getItem('wa_hub_token') || ''
  };
};

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

export async function sendMessage(to: string, body: string, clientId?: string) {
  const { url, token } = getHubConfig();
  if (!url || !token) {
    throw new Error('WhatsApp Actor Hub is not configured.');
  }

  const payload: any = { to, body };
  if (clientId) payload.clientId = clientId;

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
