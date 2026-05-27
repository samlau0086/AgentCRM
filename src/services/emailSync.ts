export interface EmailMessage {
  id: string;
  sender: string;
  target: string;
  intent: string;
  subject: string;
  summary: string;
  channel: 'Email';
  date: string;
  read: boolean;
}

export interface ReceiveProfile {
  id: string;
  name: string;
  imapHost: string;
  imapPort: string;
  imapUser: string;
  imapPass: string;
}

export interface SendProfile {
  id: string;
  name: string;
  sendProvider: 'smtp' | 'resend';
  smtpHost: string;
  smtpPort: string;
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
}

export function getReceiveProfiles(): ReceiveProfile[] {
  try {
    const data = localStorage.getItem('receive_profiles');
    if (data) return JSON.parse(data);
  } catch (e) {}
  return [];
}

export function saveReceiveProfiles(profiles: ReceiveProfile[]) {
  localStorage.setItem('receive_profiles', JSON.stringify(profiles));
}

export function getSendProfiles(): SendProfile[] {
  try {
    const data = localStorage.getItem('send_profiles');
    if (data) return JSON.parse(data);
  } catch (e) {}
  return [];
}

export function saveSendProfiles(profiles: SendProfile[]) {
  localStorage.setItem('send_profiles', JSON.stringify(profiles));
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
}

export async function fetchEmails(): Promise<EmailMessage[]> {
  const mappings = getEmailMappings();
  const receiveProfiles = getReceiveProfiles();
  
  if (mappings.length === 0 || receiveProfiles.length === 0) {
    return [];
  }

  const allEmails: EmailMessage[] = [];
  
  for (const mapping of mappings) {
    const profile = receiveProfiles.find(p => p.id === mapping.receiveProfileId);
    if (profile && profile.imapHost && profile.imapUser) {
      throw new Error(
        `Real IMAP sync is not connected in this browser build for ${profile.name}. Configure a backend email sync worker before fetching mail.`,
      );
    }
  }

  return allEmails;
}

export async function sendEmail(targetMappingId: string, to: string, subject: string, body: string) {
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
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to send email through Resend.');
    }
    return { ok: true, provider: 'resend', result: await response.json() };
  } else {
    throw new Error('SMTP sending requires a backend mail transport. Use Resend or add a server-side SMTP endpoint.');
  }
}
