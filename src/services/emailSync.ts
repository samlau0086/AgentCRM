export interface EmailMessage {
  id: string;
  sender: string;
  target: string;
  intent: string;
  subject: string;
  summary: string;
  bodyHtml?: string;
  channel: 'Email';
  date: string;
  read: boolean;
}

export interface ReceiveProfile {
  id: string;
  name: string;
  imapHost: string;
  imapPort: string;
  imapSecurity?: 'ssl' | 'starttls' | 'none';
  imapRejectUnauthorized?: boolean;
  imapUser: string;
  imapPass: string;
}

export interface SendProfile {
  id: string;
  name: string;
  sendProvider: 'smtp' | 'resend';
  smtpHost: string;
  smtpPort: string;
  smtpSecurity?: 'ssl' | 'starttls' | 'none';
  smtpRejectUnauthorized?: boolean;
  smtpUser: string;
  smtpPass: string;
  resendApiKey: string;
  fromAddress: string;
}

export interface EmailMapping {
  id: string;
  name: string;
  receiveProfileId: string;
  sendProfileId: string;
  signatureId?: string;
}

export interface EmailSignature {
  id: string;
  name: string;
  html: string;
}

export function getReceiveProfiles(): ReceiveProfile[] {
  try {
    const data = localStorage.getItem('receive_profiles');
    if (data) {
      const profiles = JSON.parse(data);
      if (Array.isArray(profiles)) {
        return profiles.map((profile) => ({
          ...profile,
          imapSecurity: profile.imapSecurity || (profile.imapPort === '143' ? 'starttls' : 'ssl'),
          imapRejectUnauthorized: profile.imapRejectUnauthorized !== false,
        }));
      }
    }
  } catch (e) {}
  return [];
}

export function saveReceiveProfiles(profiles: ReceiveProfile[]) {
  localStorage.setItem('receive_profiles', JSON.stringify(profiles));
  persistRecordList('/api/email/receive-profiles', profiles).catch(console.error);
}

export function getSendProfiles(): SendProfile[] {
  try {
    const data = localStorage.getItem('send_profiles');
    if (data) {
      const profiles = JSON.parse(data);
      if (Array.isArray(profiles)) {
        return profiles.map((profile) => ({
          ...profile,
          smtpSecurity: profile.smtpSecurity || (profile.smtpPort === '587' ? 'starttls' : 'ssl'),
          smtpRejectUnauthorized: profile.smtpRejectUnauthorized !== false,
        }));
      }
    }
  } catch (e) {}
  return [];
}

export function saveSendProfiles(profiles: SendProfile[]) {
  localStorage.setItem('send_profiles', JSON.stringify(profiles));
  persistRecordList('/api/email/send-profiles', profiles).catch(console.error);
}

export function getEmailMappings(): EmailMapping[] {
  try {
    const data = localStorage.getItem('email_mappings');
    if (data) return JSON.parse(data);
  } catch (e) {}
  return [];
}

export function saveEmailMappings(mappings: EmailMapping[]) {
  localStorage.setItem('email_mappings', JSON.stringify(mappings));
  persistRecordList('/api/email/mappings', mappings).catch(console.error);
}

export function getEmailSignatures(): EmailSignature[] {
  try {
    const data = localStorage.getItem('email_signatures');
    if (data) return JSON.parse(data);
  } catch (e) {}
  return [];
}

export function saveEmailSignatures(signatures: EmailSignature[]) {
  localStorage.setItem('email_signatures', JSON.stringify(signatures));
  persistRecordList('/api/email/signatures', signatures).catch(console.error);
}

async function fetchRecordList<T>(route: string): Promise<T[] | null> {
  const response = await fetch(route);
  if (!response.ok) return null;
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function persistRecordList<T extends { id: string }>(route: string, records: T[]) {
  const existing = (await fetchRecordList<T>(route).catch(() => null)) || [];
  const nextIds = new Set(records.map((record) => record.id));
  await Promise.allSettled([
    ...records.map((record) =>
      fetch(`${route}/${encodeURIComponent(record.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      }),
    ),
    ...existing
      .filter((record) => !nextIds.has(record.id))
      .map((record) =>
        fetch(`${route}/${encodeURIComponent(record.id)}`, {
          method: 'DELETE',
        }),
      ),
  ]);
}

export async function loadEmailConfigurationFromServer() {
  const [receiveProfiles, sendProfiles, mappings, signatures] = await Promise.all([
    fetchRecordList<ReceiveProfile>('/api/email/receive-profiles'),
    fetchRecordList<SendProfile>('/api/email/send-profiles'),
    fetchRecordList<EmailMapping>('/api/email/mappings'),
    fetchRecordList<EmailSignature>('/api/email/signatures'),
  ]);
  if (receiveProfiles) saveReceiveProfiles(receiveProfiles);
  if (sendProfiles) saveSendProfiles(sendProfiles);
  if (mappings) saveEmailMappings(mappings);
  if (signatures) saveEmailSignatures(signatures);
  return {
    receiveProfiles: receiveProfiles ?? getReceiveProfiles(),
    sendProfiles: sendProfiles ?? getSendProfiles(),
    mappings: mappings ?? getEmailMappings(),
    signatures: signatures ?? getEmailSignatures(),
  };
}

export async function saveEmailConfigurationToServer(config: {
  receiveProfiles: ReceiveProfile[];
  sendProfiles: SendProfile[];
  mappings: EmailMapping[];
  signatures: EmailSignature[];
}) {
  await Promise.allSettled([
    persistRecordList('/api/email/receive-profiles', config.receiveProfiles),
    persistRecordList('/api/email/send-profiles', config.sendProfiles),
    persistRecordList('/api/email/mappings', config.mappings),
    persistRecordList('/api/email/signatures', config.signatures),
  ]);
}

export async function fetchEmails(): Promise<EmailMessage[]> {
  const mappings = getEmailMappings();
  const receiveProfiles = getReceiveProfiles();
  
  if (mappings.length === 0 || receiveProfiles.length === 0) {
    return [];
  }

  const response = await fetch('/api/email/sync-imap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mappings, receiveProfiles, limit: 10 }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if ((response.status === 504 || response.status === 520) && !data.syncVersion) {
      throw new Error(`IMAP sync reached the gateway before the app returned a JSON response (HTTP ${response.status}). The deployed backend is still slow or an old PM2 process is serving this route.`);
    }
    const version = data.syncVersion || 'unknown';
    throw new Error(`${data.error || `IMAP sync failed with HTTP ${response.status}.`} Backend sync version: ${version}.`);
  }
  return Array.isArray(data.emails) ? data.emails : [];
}

export async function sendEmail(targetMappingId: string, to: string, subject: string, body: string, htmlBody?: string) {
  const mappings = getEmailMappings();
  const sendProfiles = getSendProfiles();
  const mapping = mappings.find(m => m.id === targetMappingId) || mappings[0];
  
  if (!mapping) {
    throw new Error('Send account mapping is not configured.');
  }
  
  const profile = sendProfiles.find(p => p.id === mapping.sendProfileId);

  if (!profile) {
    throw new Error('Send profile is not configured.');
  }

  if (profile.sendProvider === 'resend') {
    if (!profile.resendApiKey || !profile.fromAddress) {
      throw new Error('Resend API key and from address are required.');
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${profile.resendApiKey}`,
      },
      body: JSON.stringify({
        from: profile.fromAddress,
        to: [to],
        subject,
        text: body,
        ...(htmlBody ? { html: htmlBody } : {}),
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to send email through Resend.');
    }
    return { ok: true, provider: 'resend', result: await response.json() };
  }

  if (!profile.smtpHost || !profile.smtpPort || !profile.smtpUser || !profile.smtpPass) {
    throw new Error('SMTP host, port, username, and password are required.');
  }
  const response = await fetch('/api/email/send-smtp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile,
      to,
      subject,
      text: body,
      ...(htmlBody ? { html: htmlBody } : {}),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `SMTP send failed with HTTP ${response.status}.`);
  }
  return { ok: true, provider: 'smtp', result };
}
