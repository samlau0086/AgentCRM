import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n';
import { useTheme } from '../theme';
import { Sliders, Cpu, GitMerge, Check, Plus, Trash2, X, Save, KeyRound, Link2, ToggleLeft, ToggleRight, Loader2, PlugZap } from 'lucide-react';
import { cn } from '../Layout';
import { ReceiveProfile, SendProfile, EmailMapping, EmailSignature, getReceiveProfiles, saveReceiveProfiles, getSendProfiles, saveSendProfiles, getEmailMappings, saveEmailMappings, getEmailSignatures, saveEmailSignatures, loadEmailConfigurationFromServer, saveEmailConfigurationToServer } from '../services/emailSync';
import { Agent, ModelProfile, getAgents, getModelProfiles, saveModelProfiles, updateAgent } from '../services/db';
import { notify } from '../services/notifications';
import PasswordInput from '../components/PasswordInput';
import { loadAppSettingsFromServer, saveAppSetting } from '../services/appSettings';

type Tab = 'general' | 'agents' | 'integrations';

type LeadPlatform = {
  id: string;
  name: string;
  desc: string;
  defaultBaseUrl: string;
  helpText: string;
};

type LeadPlatformConfig = {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  endpointPath?: string;
  method?: 'GET' | 'POST';
  actorId?: string;
  agentId?: string;
  requestJson?: string;
  authHeaderName?: string;
  authScheme?: string;
  notes: string;
  updatedAt?: string;
};

const providers = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google' },
  { id: 'openrouter', name: 'OpenRouter.ai' },
  { id: 'custom', name: 'Custom (OpenAI API)' }
];

const modelsByProvider: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku'],
  google: ['gemini-1.5-pro', 'gemini-1.5-flash'],
};

const defaultBaseUrlByProvider: Partial<Record<ModelProfile['provider'], string>> = {
  openrouter: 'https://openrouter.ai/api/v1'
};

const defaultImapPortBySecurity: Record<NonNullable<ReceiveProfile['imapSecurity']>, string> = {
  ssl: '993',
  starttls: '143',
  none: '143',
};

const defaultSmtpPortBySecurity: Record<NonNullable<SendProfile['smtpSecurity']>, string> = {
  ssl: '465',
  starttls: '587',
  none: '25',
};

const leadGenerationPlatforms: LeadPlatform[] = [
  { id: 'outscraper', name: 'Outscraper', desc: 'Google Maps scraping', defaultBaseUrl: 'https://api.outscraper.cloud', helpText: 'Use an OutScraper API key with Google Maps Search or Places endpoints.' },
  { id: 'apify', name: 'Apify', desc: 'Web scraping & automation', defaultBaseUrl: 'https://api.apify.com/v2', helpText: 'Use an Apify token to run actors for prospect discovery and enrichment.' },
  { id: 'phantombuster', name: 'PhantomBuster', desc: 'Social media automation', defaultBaseUrl: 'https://api.phantombuster.com/api/v2', helpText: 'Use a PhantomBuster API key for social and LinkedIn-style automation workflows.' },
  { id: 'scrap_io', name: 'Scrap.io', desc: 'B2B leads from Maps', defaultBaseUrl: 'https://api.scrap.io', helpText: 'Use Scrap.io credentials for local business lead extraction.' },
  { id: 'hasdata', name: 'HasData', desc: 'Web extraction APIs', defaultBaseUrl: 'https://api.hasdata.com', helpText: 'Use a HasData API key for search, SERP, and web extraction jobs.' },
  { id: 'decodo', name: 'Decodo', desc: 'Contact data discovery', defaultBaseUrl: 'https://api.decodo.com', helpText: 'Use Decodo credentials for data discovery and enrichment pipelines.' },
  { id: 'clay_com', name: 'Clay.com', desc: 'Data enrichment workflows', defaultBaseUrl: 'https://api.clay.com', helpText: 'Use Clay API details for enrichment tables and outbound research workflows.' },
];

export default function Settings() {
  const { t, language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const [receiveProfiles, setReceiveProfiles] = useState<ReceiveProfile[]>([]);
  const [sendProfiles, setSendProfiles] = useState<SendProfile[]>([]);
  const [emailMappings, setEmailMappings] = useState<EmailMapping[]>([]);
  const [emailSignatures, setEmailSignatures] = useState<EmailSignature[]>([]);
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const [vectorStatus, setVectorStatus] = useState({ configured: false, status: 'Checking...', details: '' });
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [leadPlatformConfigs, setLeadPlatformConfigs] = useState<Record<string, LeadPlatformConfig>>({});
  const [appSettingsLoaded, setAppSettingsLoaded] = useState(false);
  const [editingLeadPlatform, setEditingLeadPlatform] = useState<LeadPlatform | null>(null);
  const [testingEmailKey, setTestingEmailKey] = useState<string | null>(null);
  const [isTestingWaHub, setIsTestingWaHub] = useState(false);
  const [leadPlatformDraft, setLeadPlatformDraft] = useState<LeadPlatformConfig>({
    enabled: false,
    apiKey: '',
    baseUrl: '',
    endpointPath: '',
    method: 'POST',
    actorId: '',
    agentId: '',
    requestJson: '',
    authHeaderName: 'Authorization',
    authScheme: 'Bearer',
    notes: ''
  });

  useEffect(() => {
    loadAppSettingsFromServer().then((settings) => {
      setTimezone(String(settings.crm_timezone || localStorage.getItem('crm_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone));
      setEmailAlerts(String(settings.crm_email_alerts ?? localStorage.getItem('crm_email_alerts') ?? 'true') !== 'false');
      setPushAlerts(String(settings.crm_push_alerts ?? localStorage.getItem('crm_push_alerts') ?? 'true') !== 'false');
      const leadConfigs = settings.lead_platform_configs || localStorage.getItem('lead_platform_configs') || {};
      setLeadPlatformConfigs(
        typeof leadConfigs === 'string'
          ? JSON.parse(leadConfigs || '{}')
          : (leadConfigs as Record<string, LeadPlatformConfig>),
      );
      setAppSettingsLoaded(true);
    }).catch(() => {
      setTimezone(localStorage.getItem('crm_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone);
      setEmailAlerts(localStorage.getItem('crm_email_alerts') !== 'false');
      setPushAlerts(localStorage.getItem('crm_push_alerts') !== 'false');
      try {
        setLeadPlatformConfigs(JSON.parse(localStorage.getItem('lead_platform_configs') || '{}'));
      } catch (e) {
        setLeadPlatformConfigs({});
      }
      setAppSettingsLoaded(true);
    });
    setReceiveProfiles(getReceiveProfiles());
    setSendProfiles(getSendProfiles());
    setEmailMappings(getEmailMappings());
    setEmailSignatures(getEmailSignatures());
    loadEmailConfigurationFromServer()
      .then(data => {
        setReceiveProfiles(data.receiveProfiles);
        setSendProfiles(data.sendProfiles);
        setEmailMappings(data.mappings);
        setEmailSignatures(data.signatures);
      })
      .catch(console.error);
    setModelProfiles(getModelProfiles());
    setAgents(getAgents());
    
    fetch('/api/config/vector')
      .then(res => res.json())
      .then(data => setVectorStatus(data))
      .catch(err => setVectorStatus({ configured: false, status: 'Error', details: err.message }));
  }, []);

  useEffect(() => {
    if (!appSettingsLoaded) return;
    saveAppSetting('crm_timezone', timezone);
  }, [appSettingsLoaded, timezone]);

  useEffect(() => {
    if (!appSettingsLoaded) return;
    saveAppSetting('crm_email_alerts', String(emailAlerts));
  }, [appSettingsLoaded, emailAlerts]);

  useEffect(() => {
    if (!appSettingsLoaded) return;
    saveAppSetting('crm_push_alerts', String(pushAlerts));
  }, [appSettingsLoaded, pushAlerts]);

  const saveLeadPlatformConfigs = (configs: Record<string, LeadPlatformConfig>) => {
    setLeadPlatformConfigs(configs);
    saveAppSetting('lead_platform_configs', configs);
  };

  const openLeadPlatformModal = (platform: LeadPlatform) => {
    const existing = leadPlatformConfigs[platform.id];
    setEditingLeadPlatform(platform);
    setLeadPlatformDraft({
      enabled: existing?.enabled || false,
      apiKey: existing?.apiKey || '',
      baseUrl: existing?.baseUrl || platform.defaultBaseUrl,
      endpointPath: existing?.endpointPath || '',
      method: existing?.method || (platform.id === 'outscraper' ? 'GET' : 'POST'),
      actorId: existing?.actorId || '',
      agentId: existing?.agentId || '',
      requestJson: existing?.requestJson || '',
      authHeaderName: existing?.authHeaderName || 'Authorization',
      authScheme: existing?.authScheme || 'Bearer',
      notes: existing?.notes || '',
      updatedAt: existing?.updatedAt,
    });
  };

  const handleSaveLeadPlatform = () => {
    if (!editingLeadPlatform) return;
    saveLeadPlatformConfigs({
      ...leadPlatformConfigs,
      [editingLeadPlatform.id]: {
        ...leadPlatformDraft,
        updatedAt: new Date().toISOString(),
      },
    });
    setEditingLeadPlatform(null);
  };

  const handleClearLeadPlatform = () => {
    if (!editingLeadPlatform) return;
    const next = { ...leadPlatformConfigs };
    delete next[editingLeadPlatform.id];
    saveLeadPlatformConfigs(next);
    setEditingLeadPlatform(null);
  };

  const handleInitVector = async () => {
    try {
      const res = await fetch('/api/vector/init', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        notify(data.message, 'success', 'Vector database initialized');
        // recheck status
        const statusRes = await fetch('/api/config/vector');
        const statusData = await statusRes.json();
        setVectorStatus(statusData);
      } else {
        notify('Error: ' + data.error, 'error', 'Vector setup failed');
      }
    } catch(e: any) {
      notify('Error: ' + e.message, 'error', 'Vector setup failed');
    }
  };

  const handleSaveEmailConfig = async () => {
    saveReceiveProfiles(receiveProfiles);
    saveSendProfiles(sendProfiles);
    saveEmailMappings(emailMappings);
    saveEmailSignatures(emailSignatures);
    await saveEmailConfigurationToServer({
      receiveProfiles,
      sendProfiles,
      mappings: emailMappings,
      signatures: emailSignatures,
    });
    notify('Saved Email configuration', 'success', 'Email settings saved');
  };

  const testReceiveProfile = async (profile: ReceiveProfile) => {
    const key = `imap:${profile.id}`;
    setTestingEmailKey(key);
    try {
      const res = await fetch('/api/email/test-imap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `IMAP test failed with HTTP ${res.status}.`);
      notify(data.message || 'IMAP connection test passed.', 'success', 'IMAP connected');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'IMAP connection test failed.', 'error', 'IMAP test failed');
    } finally {
      setTestingEmailKey(null);
    }
  };

  const testSendProfile = async (profile: SendProfile) => {
    const key = `smtp:${profile.id}`;
    setTestingEmailKey(key);
    try {
      const res = await fetch('/api/email/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `SMTP test failed with HTTP ${res.status}.`);
      notify(data.message || 'SMTP connection test passed.', 'success', 'SMTP connected');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'SMTP connection test failed.', 'error', 'SMTP test failed');
    } finally {
      setTestingEmailKey(null);
    }
  };

  const testWaHubConnection = async () => {
    const url = ((document.getElementById('hub_url') as HTMLInputElement | null)?.value || '').replace(/\/+$/, '');
    const token = (document.getElementById('hub_token') as HTMLInputElement | null)?.value || '';
    if (!url || !token) {
      notify('Please enter Hub URL and API Token first.', 'warning', 'WhatsApp Hub configuration required');
      return;
    }

    setIsTestingWaHub(true);
    try {
      const res = await fetch(`${url}/api/clients`, {
        headers: { 'x-hub-token': token },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || `Hub returned HTTP ${res.status}.`);
      }
      const clients = Array.isArray(data.clients) ? data.clients : [];
      const onlineCount = clients.filter((client: any) => client.status === 'online').length;
      notify(`Connected to WhatsApp Hub. ${clients.length} client(s), ${onlineCount} online.`, 'success', 'WhatsApp Hub connected');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to connect to WhatsApp Hub.', 'error', 'WhatsApp Hub test failed');
    } finally {
      setIsTestingWaHub(false);
    }
  };

  const handleSaveModelProfiles = () => {
    saveModelProfiles(modelProfiles);
    notify('Saved Model Profiles', 'success', 'Model profiles saved');
  };

  const addModelProfile = () => {
    setModelProfiles([
      ...modelProfiles,
      {
        id: Math.random().toString(36).substr(2, 9),
        name: 'New Model Profile',
        provider: 'google',
        model: 'gemini-1.5-flash',
        temperature: 0.4,
      },
    ]);
  };

  const updateModelProfile = (id: string, updates: Partial<ModelProfile>) => {
    setModelProfiles(modelProfiles.map(profile => profile.id === id ? { ...profile, ...updates } : profile));
  };

  const deleteModelProfile = (id: string) => {
    if (modelProfiles.length <= 1) {
      notify('At least one model profile is required.', 'warning', 'Cannot delete profile');
      return;
    }
    setModelProfiles(modelProfiles.filter(profile => profile.id !== id));
  };

  const assignAgentModelProfile = (agentId: string, modelProfileId: string) => {
    updateAgent(agentId, { modelProfileId });
    setAgents(getAgents());
  };

  const addReceiveProfile = () => {
    setReceiveProfiles([...receiveProfiles, {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New IMAP Profile',
      imapHost: '',
      imapPort: '993',
      imapSecurity: 'ssl',
      imapRejectUnauthorized: true,
      imapUser: '',
      imapPass: ''
    }]);
  };

  const addSendProfile = () => {
    setSendProfiles([...sendProfiles, {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Send Profile',
      sendProvider: 'smtp',
      smtpHost: '',
      smtpPort: '465',
      smtpSecurity: 'ssl',
      smtpRejectUnauthorized: true,
      smtpUser: '',
      smtpPass: '',
      resendApiKey: '',
      fromAddress: ''
    }]);
  };

  const updateReceiveSecurity = (profileId: string, security: NonNullable<ReceiveProfile['imapSecurity']>) => {
    setReceiveProfiles(receiveProfiles.map(profile =>
      profile.id === profileId
        ? { ...profile, imapSecurity: security, imapPort: defaultImapPortBySecurity[security] }
        : profile,
    ));
  };

  const updateSendSecurity = (profileId: string, security: NonNullable<SendProfile['smtpSecurity']>) => {
    setSendProfiles(sendProfiles.map(profile =>
      profile.id === profileId
        ? { ...profile, smtpSecurity: security, smtpPort: defaultSmtpPortBySecurity[security] }
        : profile,
    ));
  };

  const addEmailMapping = () => {
    setEmailMappings([...emailMappings, {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Account',
      receiveProfileId: '',
      sendProfileId: '',
      signatureId: ''
    }]);
  };

  const addEmailSignature = () => {
    setEmailSignatures([...emailSignatures, {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Signature',
      html: '<p>Best regards,<br>Your Name</p>',
    }]);
  };

  const tabs = [
    { id: 'general', label: t('set.tab.general'), icon: Sliders },
    { id: 'agents', label: t('set.tab.agents'), icon: Cpu },
    { id: 'integrations', label: t('set.tab.integrations'), icon: GitMerge },
  ];

  return (
    <div className="w-full p-4 md:p-6 lg:p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">{t('set.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-light">{t('set.subtitle')}</p>
        </div>
      </div>

      <div className="flex border-b border-slate-200 dark:border-white/5 mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 border-b-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-12">
        {activeTab === 'general' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <section>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">{t('set.gen.appearance')}</h2>
              <div className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-6">
                
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('set.gen.theme')}</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-light mt-1">Light / Dark toggle via switch.</p>
                  </div>
                  <button 
                    onClick={toggleTheme}
                    className="relative w-12 h-6 rounded-full bg-slate-200 dark:bg-white/10 transition-colors duration-200 outline-none"
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200",
                      theme === 'dark' ? "left-7" : "left-1"
                    )} />
                  </button>
                </div>

                <div className="h-px bg-slate-200 dark:bg-white/5" />

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Timezone</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-light mt-1">Default timezone for scheduled actions.</p>
                  </div>
                  <div className="flex">
                    <select
                      value={timezone}
                      onChange={e => setTimezone(e.target.value)}
                      className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 min-w-[150px]"
                    >
                      {Intl.supportedValuesOf('timeZone').map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="h-px bg-slate-200 dark:bg-white/5" />

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('set.gen.language')}</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-light mt-1">English or 中文.</p>
                  </div>
                  <div className="flex bg-slate-100 dark:bg-black/20 p-1 rounded-lg border border-slate-200 dark:border-white/5">
                    <button 
                      onClick={() => setLanguage('en')}
                      className={cn(
                        "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                        language === 'en' ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                      )}
                    >
                      English
                    </button>
                    <button 
                      onClick={() => setLanguage('zh')}
                      className={cn(
                        "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                        language === 'zh' ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                      )}
                    >
                      中文
                    </button>
                  </div>
                </div>

              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">{t('set.gen.notifications')}</h2>
              <div className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-6">
                
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('set.gen.emailAlerts')}</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-light mt-1">Daily digests and critical agent alerts.</p>
                  </div>
                  <button 
                    onClick={() => setEmailAlerts(!emailAlerts)}
                    className={cn(
                      "relative w-12 h-6 rounded-full transition-colors duration-200 outline-none",
                      emailAlerts ? "bg-blue-600" : "bg-slate-200 dark:bg-white/10"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200",
                      emailAlerts ? "left-7" : "left-1"
                    )} />
                  </button>
                </div>

                <div className="h-px bg-slate-200 dark:bg-white/5" />

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('set.gen.pushAlerts')}</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-light mt-1">Real-time alerts via browser.</p>
                  </div>
                  <button 
                    onClick={() => setPushAlerts(!pushAlerts)}
                    className={cn(
                      "relative w-12 h-6 rounded-full transition-colors duration-200 outline-none",
                      pushAlerts ? "bg-blue-600" : "bg-slate-200 dark:bg-white/10"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200",
                      pushAlerts ? "left-7" : "left-1"
                    )} />
                  </button>
                </div>

              </div>
            </section>
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{t('set.tab.agents')}</h2>
                <button 
                  onClick={handleSaveModelProfiles}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition-colors shadow-sm"
                >
                  {t('set.gen.save') || 'Save Changes'}
                </button>
              </div>
              <div className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Model Profiles</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Create reusable model connections. Agents choose one of these profiles in Agent Center.</p>
                  </div>
                  <button onClick={addModelProfile} className="px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Profile
                  </button>
                </div>

                <div className="space-y-4">
                  {modelProfiles.map(profile => {
                    const presetModels = modelsByProvider[profile.provider] || [];
                    return (
                      <div key={profile.id} className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <input
                            value={profile.name}
                            onChange={e => updateModelProfile(profile.id, { name: e.target.value })}
                            placeholder="Profile name"
                            className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                          />
                          <select
                            value={profile.provider}
                            onChange={e => {
                              const provider = e.target.value as ModelProfile['provider'];
                              updateModelProfile(profile.id, {
                                provider,
                                model: provider === 'custom' || provider === 'openrouter' ? '' : (modelsByProvider[provider]?.[0] || ''),
                                baseUrl: defaultBaseUrlByProvider[provider] || '',
                              });
                            }}
                            className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                          >
                            {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          {profile.provider === 'custom' || profile.provider === 'openrouter' ? (
                            <input
                              value={profile.model}
                              onChange={e => updateModelProfile(profile.id, { model: e.target.value })}
                              placeholder={profile.provider === 'openrouter' ? 'openai/gpt-4o-mini' : 'Model name'}
                              className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                            />
                          ) : (
                            <select
                              value={profile.model}
                              onChange={e => updateModelProfile(profile.id, { model: e.target.value })}
                              className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                            >
                              {presetModels.map(model => <option key={model} value={model}>{model}</option>)}
                            </select>
                          )}
                          <button
                            onClick={() => deleteModelProfile(profile.id)}
                            className="px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 dark:border-red-500/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input
                            value={profile.baseUrl || ''}
                            onChange={e => updateModelProfile(profile.id, { baseUrl: e.target.value })}
                            placeholder="Base URL (optional for provider defaults)"
                            className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                          />
                          <div className="relative">
                            <PasswordInput
                              value={profile.apiKey || ''}
                              onChange={e => updateModelProfile(profile.id, { apiKey: e.target.value })}
                              placeholder="API Key (optional if configured on server)"
                              className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t('set.agt.temperature')}</label>
                            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{profile.temperature ?? 0.4}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={profile.temperature ?? 0.4}
                            onChange={e => updateModelProfile(profile.id, { temperature: parseFloat(e.target.value) })}
                            className="w-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            </section>

            <section>
              <div className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Agent Profile Assignments</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Choose which model profile each agent uses when it executes.</p>
                </div>
                <div className="space-y-3">
                  {agents.map(agent => (
                    <div key={agent.id} className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-3 items-center bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl p-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{agent.name}</div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">{agent.role}</p>
                      </div>
                      <select
                        value={agent.modelProfileId || modelProfiles[0]?.id || "default_google"}
                        onChange={e => assignAgentModelProfile(agent.id, e.target.value)}
                        className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                      >
                        {modelProfiles.map(profile => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name} ({profile.provider} / {profile.model})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col gap-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('set.int.email')}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Configure receive (IMAP) and send (SMTP/Resend) mechanisms independently, then map them into accounts.</p>
                </div>
                <button 
                  onClick={handleSaveEmailConfig}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition-colors shadow-sm shrink-0"
                >
                  {t('set.gen.save')} Config
                </button>
              </div>

              {/* Receive Profiles Section */}
              <div className="space-y-4 border border-slate-200 dark:border-white/10 rounded-xl p-4 bg-slate-50 dark:bg-black/10">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Receive Profiles (IMAP)</h4>
                  <button onClick={addReceiveProfile} className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:text-blue-500">
                    <Plus className="w-3 h-3" /> Add Receive Profile
                  </button>
                </div>
                {receiveProfiles.length === 0 && <p className="text-xs text-slate-400 italic">No receive profiles configured.</p>}
                {receiveProfiles.map(profile => (
                  <div key={profile.id} className="p-4 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg relative space-y-4">
                    <button onClick={() => setReceiveProfiles(receiveProfiles.filter(p => p.id !== profile.id))} className="absolute top-3 right-3 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 pr-8">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Profile Name</label>
                        <input value={profile.name} onChange={e => setReceiveProfiles(receiveProfiles.map(p => p.id === profile.id ? { ...p, name: e.target.value } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">IMAP Host</label>
                        <input value={profile.imapHost} onChange={e => setReceiveProfiles(receiveProfiles.map(p => p.id === profile.id ? { ...p, imapHost: e.target.value } : p))} placeholder="imap.gmail.com" className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Port</label>
                        <input value={profile.imapPort} onChange={e => setReceiveProfiles(receiveProfiles.map(p => p.id === profile.id ? { ...p, imapPort: e.target.value } : p))} placeholder="993" className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Security</label>
                        <select value={profile.imapSecurity || 'ssl'} onChange={e => updateReceiveSecurity(profile.id, e.target.value as NonNullable<ReceiveProfile['imapSecurity']>)} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500">
                          <option value="ssl">SSL / TLS</option>
                          <option value="starttls">STARTTLS</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Username</label>
                        <input value={profile.imapUser} onChange={e => setReceiveProfiles(receiveProfiles.map(p => p.id === profile.id ? { ...p, imapUser: e.target.value } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Password</label>
                        <div className="relative">
                          <PasswordInput value={profile.imapPass} onChange={e => setReceiveProfiles(receiveProfiles.map(p => p.id === profile.id ? { ...p, imapPass: e.target.value } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-white/5">
                      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={profile.imapRejectUnauthorized !== false}
                          onChange={e => setReceiveProfiles(receiveProfiles.map(p => p.id === profile.id ? { ...p, imapRejectUnauthorized: e.target.checked } : p))}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Verify TLS certificate
                      </label>
                      <button
                        type="button"
                        onClick={() => testReceiveProfile(profile)}
                        disabled={testingEmailKey === `imap:${profile.id}`}
                        className="flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/30 dark:text-blue-400 dark:hover:bg-blue-500/10"
                      >
                        {testingEmailKey === `imap:${profile.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                        Test IMAP
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Send Profiles Section */}
              <div className="space-y-4 border border-slate-200 dark:border-white/10 rounded-xl p-4 bg-slate-50 dark:bg-black/10">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Send Profiles (SMTP / Resend)</h4>
                  <button onClick={addSendProfile} className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:text-blue-500">
                    <Plus className="w-3 h-3" /> Add Send Profile
                  </button>
                </div>
                {sendProfiles.length === 0 && <p className="text-xs text-slate-400 italic">No send profiles configured.</p>}
                {sendProfiles.map(profile => (
                  <div key={profile.id} className="p-4 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg relative space-y-4">
                    <button onClick={() => setSendProfiles(sendProfiles.filter(p => p.id !== profile.id))} className="absolute top-3 right-3 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Profile Name</label>
                        <input value={profile.name} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, name: e.target.value } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">From Address</label>
                        <input value={profile.fromAddress} placeholder="agent@example.com" onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, fromAddress: e.target.value } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Delivery Method</label>
                        <select value={profile.sendProvider} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, sendProvider: e.target.value as 'smtp'|'resend' } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500">
                          <option value="smtp">SMTP</option>
                          <option value="resend">Resend API</option>
                        </select>
                      </div>
                    </div>

                    {profile.sendProvider === 'smtp' ? (
                      <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 dark:border-white/5">
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">SMTP Host</label>
                          <input value={profile.smtpHost} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, smtpHost: e.target.value } : p))} placeholder="smtp.gmail.com" className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Port</label>
                          <input value={profile.smtpPort} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, smtpPort: e.target.value } : p))} placeholder="465" className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Security</label>
                          <select value={profile.smtpSecurity || 'ssl'} onChange={e => updateSendSecurity(profile.id, e.target.value as NonNullable<SendProfile['smtpSecurity']>)} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500">
                            <option value="ssl">SSL / TLS</option>
                            <option value="starttls">STARTTLS</option>
                            <option value="none">None</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Username</label>
                          <input value={profile.smtpUser} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, smtpUser: e.target.value } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Password</label>
                          <div className="relative">
                            <PasswordInput value={profile.smtpPass} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, smtpPass: e.target.value } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                          <input
                            type="checkbox"
                            checked={profile.smtpRejectUnauthorized !== false}
                            onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, smtpRejectUnauthorized: e.target.checked } : p))}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          Verify TLS certificate
                        </label>
                        <button
                          type="button"
                          onClick={() => testSendProfile(profile)}
                          disabled={testingEmailKey === `smtp:${profile.id}`}
                          className="flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/30 dark:text-blue-400 dark:hover:bg-blue-500/10"
                        >
                          {testingEmailKey === `smtp:${profile.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                          Test SMTP
                        </button>
                      </div>
                      </div>
                    ) : (
                      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Resend API Key</label>
                        <div className="relative max-w-md">
                          <PasswordInput value={profile.resendApiKey} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, resendApiKey: e.target.value } : p))} placeholder="re_123456789" className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Email Signatures Section */}
              <div className="space-y-4 border border-slate-200 dark:border-white/10 rounded-xl p-4 bg-slate-50 dark:bg-black/10">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Email Signatures</h4>
                  <button onClick={addEmailSignature} className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:text-blue-500">
                    <Plus className="w-3 h-3" /> Add Signature
                  </button>
                </div>
                {emailSignatures.length === 0 && <p className="text-xs text-slate-400 italic">No signatures configured.</p>}
                {emailSignatures.map(signature => (
                  <div key={signature.id} className="p-4 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg relative space-y-3">
                    <button onClick={() => setEmailSignatures(emailSignatures.filter(item => item.id !== signature.id))} className="absolute top-3 right-3 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 pr-8">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Signature Name</label>
                        <input value={signature.name} onChange={e => setEmailSignatures(emailSignatures.map(item => item.id === signature.id ? { ...item, name: e.target.value } : item))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Signature HTML</label>
                        <textarea value={signature.html} onChange={e => setEmailSignatures(emailSignatures.map(item => item.id === signature.id ? { ...item, html: e.target.value } : item))} rows={3} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Account Mappings Section */}
              <div className="space-y-4 border border-slate-200 dark:border-white/10 rounded-xl p-4 bg-slate-50 dark:bg-black/10">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Account Mappings</h4>
                  <button onClick={addEmailMapping} className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:text-blue-500">
                    <Plus className="w-3 h-3" /> Add Account Mapping
                  </button>
                </div>
                {emailMappings.length === 0 && <p className="text-xs text-slate-400 italic">No accounts configured.</p>}
                {emailMappings.map(mapping => (
                  <div key={mapping.id} className="p-4 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg relative grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <button onClick={() => setEmailMappings(emailMappings.filter(m => m.id !== mapping.id))} className="absolute top-3 right-3 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Account Display Name</label>
                      <input value={mapping.name} onChange={e => setEmailMappings(emailMappings.map(m => m.id === mapping.id ? { ...m, name: e.target.value } : m))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Receive With</label>
                      <select value={mapping.receiveProfileId} onChange={e => setEmailMappings(emailMappings.map(m => m.id === mapping.id ? { ...m, receiveProfileId: e.target.value } : m))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500">
                        <option value="">-- Select Receive Profile --</option>
                        {receiveProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Send With</label>
                      <select value={mapping.sendProfileId} onChange={e => setEmailMappings(emailMappings.map(m => m.id === mapping.id ? { ...m, sendProfileId: e.target.value } : m))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500">
                        <option value="">-- Select Send Profile --</option>
                        {sendProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Default Signature</label>
                      <select value={mapping.signatureId || ''} onChange={e => setEmailMappings(emailMappings.map(m => m.id === mapping.id ? { ...m, signatureId: e.target.value } : m))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500">
                        <option value="">-- No Signature --</option>
                        {emailSignatures.map(signature => <option key={signature.id} value={signature.id}>{signature.name}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

            </div>

            <div className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('set.int.whatsapp')}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Official Meta messaging integration.</p>
                </div>
                <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition-colors shadow-sm">
                  {t('set.int.connect')}
                </button>
              </div>
              <div className="h-px bg-slate-200 dark:bg-white/5" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('set.int.waHub')}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('set.int.waHubDesc')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={testWaHubConnection}
                      disabled={isTestingWaHub}
                      className="flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/30 dark:text-blue-400 dark:hover:bg-blue-500/10"
                    >
                      {isTestingWaHub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                      Test
                    </button>
                    <button
                      onClick={() => {
                        saveAppSetting('wa_hub_url', (document.getElementById('hub_url') as HTMLInputElement).value);
                        saveAppSetting('wa_hub_token', (document.getElementById('hub_token') as HTMLInputElement).value);
                        notify('Saved WhatsApp Actor Hub configuration', 'success', 'WhatsApp settings saved');
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition-colors shadow-sm"
                    >
                      {t('set.gen.save')}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">Hub URL</label>
                    <input 
                      id="hub_url"
                      defaultValue={localStorage.getItem('wa_hub_url') || ''}
                      placeholder="https://hub.example.com"
                      className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" 
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">API Token</label>
                    <div className="relative">
                    <PasswordInput
                      id="hub_token"
                      defaultValue={localStorage.getItem('wa_hub_token') || ''}
                      placeholder="Enter access token"
                      className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" 
                    />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={cn("shadow-sm dark:shadow-none border rounded-2xl p-6 flex flex-col justify-between gap-4", vectorStatus.configured ? "bg-white dark:bg-white/5 border-emerald-600/30 dark:border-emerald-500/30" : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10")}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className={cn("text-sm font-medium", vectorStatus.configured ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-200")}>{t('set.int.vectordb')}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Status: {vectorStatus.status}. Used for Semantic Memory.</p>
                  {vectorStatus.details && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{vectorStatus.details}</p>}
                </div>
                <div className="flex items-center gap-4">
                  {vectorStatus.configured && vectorStatus.status === 'Operational' ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-600/20 border border-emerald-200 dark:border-emerald-500/30 rounded-md shrink-0">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{t('set.int.connected')}</span>
                    </div>
                  ) : vectorStatus.status === 'Not Configured' ? (
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">Needs configuration in Secrets</span>
                    </div>
                  ) : (
                    <button 
                      onClick={handleInitVector}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition-colors shadow-sm"
                    >
                      Initialize DB
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Lead Generation Platforms</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Manage platform connections for automated lead scraping and enrichment.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {leadGenerationPlatforms.map(platform => {
                  const config = leadPlatformConfigs[platform.id];
                  const isConfigured = Boolean(config?.apiKey);
                  const isEnabled = Boolean(config?.enabled);

                  return (
                  <div key={platform.id} className={cn(
                    "p-4 rounded-xl border bg-slate-50 dark:bg-black/20 flex flex-col justify-between gap-4 transition-colors",
                    isEnabled
                      ? "border-emerald-200 dark:border-emerald-500/30"
                      : "border-slate-200 dark:border-slate-700"
                  )}>
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200">{platform.name}</h4>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                          isEnabled
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : isConfigured
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {isEnabled ? "Enabled" : isConfigured ? "Saved" : "Not set"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{platform.desc}</p>
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                          <Link2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{config?.baseUrl || platform.defaultBaseUrl}</span>
                        </div>
                        {config?.updatedAt && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            Updated {new Date(config.updatedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openLeadPlatformModal(platform)}
                      className="w-full text-center py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-300"
                    >
                      {isConfigured ? "Edit Connection" : "Set Up Connection"}
                    </button>
                  </div>
                )})}
              </div>
            </div>
          </div>
        )}
      </div>

      {editingLeadPlatform && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6 dark:border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Configure {editingLeadPlatform.name}
                  </h3>
                </div>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {editingLeadPlatform.helpText}
                </p>
              </div>
              <button
                onClick={() => setEditingLeadPlatform(null)}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 space-y-5 overflow-y-auto p-6">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Enable connection</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Allow Lead Generation Agent to use this platform.</p>
                </div>
                <button
                  onClick={() => setLeadPlatformDraft({ ...leadPlatformDraft, enabled: !leadPlatformDraft.enabled })}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                    leadPlatformDraft.enabled
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  )}
                >
                  {leadPlatformDraft.enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                  {leadPlatformDraft.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">API Key</label>
                <div className="relative">
                  <PasswordInput
                    value={leadPlatformDraft.apiKey}
                    onChange={e => setLeadPlatformDraft({ ...leadPlatformDraft, apiKey: e.target.value })}
                    placeholder={`Enter ${editingLeadPlatform.name} API key`}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Auth Header</label>
                  <input
                    value={leadPlatformDraft.authHeaderName || 'Authorization'}
                    onChange={e => setLeadPlatformDraft({ ...leadPlatformDraft, authHeaderName: e.target.value })}
                    placeholder="Authorization or x-api-key"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Auth Scheme</label>
                  <input
                    value={leadPlatformDraft.authScheme || 'Bearer'}
                    onChange={e => setLeadPlatformDraft({ ...leadPlatformDraft, authScheme: e.target.value })}
                    placeholder="Bearer"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Only used when Auth Header is Authorization.</p>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Base URL</label>
                <input
                  value={leadPlatformDraft.baseUrl}
                  onChange={e => setLeadPlatformDraft({ ...leadPlatformDraft, baseUrl: e.target.value })}
                  placeholder={editingLeadPlatform.defaultBaseUrl}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Method</label>
                  <select
                    value={leadPlatformDraft.method || 'POST'}
                    onChange={e => setLeadPlatformDraft({ ...leadPlatformDraft, method: e.target.value as 'GET' | 'POST' })}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Endpoint Path</label>
                  <input
                    value={leadPlatformDraft.endpointPath || ''}
                    onChange={e => setLeadPlatformDraft({ ...leadPlatformDraft, endpointPath: e.target.value })}
                    placeholder={editingLeadPlatform.id === 'apify' ? 'acts/owner~actor/run-sync-get-dataset-items' : editingLeadPlatform.id === 'outscraper' ? 'google-maps-search' : 'Custom endpoint path'}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </div>
              </div>

              {(editingLeadPlatform.id === 'apify' || editingLeadPlatform.id === 'phantombuster') && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {editingLeadPlatform.id === 'apify' && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Apify Actor ID</label>
                      <input
                        value={leadPlatformDraft.actorId || ''}
                        onChange={e => setLeadPlatformDraft({ ...leadPlatformDraft, actorId: e.target.value })}
                        placeholder="owner~actor-name"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                      />
                    </div>
                  )}
                  {editingLeadPlatform.id === 'phantombuster' && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">PhantomBuster Agent ID</label>
                      <input
                        value={leadPlatformDraft.agentId || ''}
                        onChange={e => setLeadPlatformDraft({ ...leadPlatformDraft, agentId: e.target.value })}
                        placeholder="Agent ID"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Request JSON</label>
                <textarea
                  rows={5}
                  value={leadPlatformDraft.requestJson || ''}
                  onChange={e => setLeadPlatformDraft({ ...leadPlatformDraft, requestJson: e.target.value })}
                  placeholder={'Optional JSON body schema. Agents fill {{query}}, {{location}}, and {{limit}} at runtime.'}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Configure only the API shape here. The Lead Generation Agent decides the actual search query from RAG, products, customers, and lead context when it runs.</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
                <textarea
                  rows={3}
                  value={leadPlatformDraft.notes}
                  onChange={e => setLeadPlatformDraft({ ...leadPlatformDraft, notes: e.target.value })}
                  placeholder="Optional: usage limits, workspace ID, actor name, target market, or routing notes."
                  className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-between gap-3 border-t border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-black/20">
              <button
                onClick={handleClearLeadPlatform}
                className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                Clear
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingLeadPlatform(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLeadPlatform}
                  disabled={!leadPlatformDraft.apiKey.trim() || !leadPlatformDraft.baseUrl.trim()}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  Save Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
