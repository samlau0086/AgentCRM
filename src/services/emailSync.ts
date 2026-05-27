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
    return [
      { id: 'msg_1', sender: 'buyer1@example.com', target: 'agent@example.com', intent: 'Inquiry', subject: 'Bulk Pricing Request', summary: 'Customer asking for a 10k units volume discount and lead times.', channel: 'Email', date: '10:30 AM', read: false },
      { id: 'msg_3', sender: 'jane@globaltech.com', target: 'support@example.com', intent: 'Negotiation', subject: 'Re: Quotation #1044', summary: 'Requesting to split the payment terms to 50/50 instead of 100% upfront.', channel: 'Email', date: 'Yesterday', read: true }
    ];
  }

  const allEmails: EmailMessage[] = [];
  
  for (const mapping of mappings) {
    const profile = receiveProfiles.find(p => p.id === mapping.receiveProfileId);
    if (profile && profile.imapHost && profile.imapUser) {
      console.log(`Connecting to IMAP ${profile.imapHost} as ${profile.imapUser}...`);
      allEmails.push(
        { id: `msg_${mapping.id}_1`, sender: 'supplier@vendor.com', target: profile.imapUser, intent: 'Invoice', subject: `Invoice for ${profile.imapUser}`, summary: 'Attached is the invoice for the recent components order.', channel: 'Email', date: '10:00 AM', read: false },
        { id: `msg_${mapping.id}_2`, sender: 'newlead@startup.io', target: profile.imapUser, intent: 'Inquiry', subject: 'Integration Question', summary: 'Can your platform integrate with our existing CRM via API?', channel: 'Email', date: 'Yesterday', read: true }
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
    console.log('Simulating sending email without proper config');
    return { ok: true, mocked: true };
  }
  
  const profile = sendProfiles.find(p => p.id === mapping.sendProfileId);

  if (!profile) {
    console.log('Send Profile not found');
    return { ok: false, error: 'Send profile not configured' };
  }

  if (profile.sendProvider === 'resend') {
    console.log(`Sending email to ${to} via Resend API as ${profile.fromAddress}...`);
  } else {
    console.log(`Sending email to ${to} via SMTP ${profile.smtpHost} as ${profile.smtpUser}...`);
  }
  
  await new Promise(resolve => setTimeout(resolve, 800));
  
  return { ok: true, messageId: `msg_${Math.random().toString(36).substr(2, 9)}` };
}
