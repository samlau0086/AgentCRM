import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n';
import { useTheme } from '../theme';
import { Sliders, Cpu, GitMerge, Check, Plus, Trash2, X, Save, KeyRound, Link2, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '../Layout';
import { ReceiveProfile, SendProfile, EmailMapping, getReceiveProfiles, saveReceiveProfiles, getSendProfiles, saveSendProfiles, getEmailMappings, saveEmailMappings } from '../services/emailSync';

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
  notes: string;
  updatedAt?: string;
};

const providers = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google' },
  { id: 'custom', name: 'Custom (OpenAI API)' }
];

const modelsByProvider: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku'],
  google: ['gemini-1.5-pro', 'gemini-1.5-flash']
};

const embeddingsByProvider: Record<string, string[]> = {
  openai: ['text-embedding-3-small', 'text-embedding-3-large'],
  google: ['text-embedding-004']
};

const leadGenerationPlatforms: LeadPlatform[] = [
  { id: 'outscraper', name: 'Outscraper', desc: 'Google Maps scraping', defaultBaseUrl: 'https://api.app.outscraper.com', helpText: 'Use an OutScraper API key with Google Maps Search or Places endpoints.' },
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

  const [agentConfigs, setAgentConfigs] = useState({
    orchestrator: { provider: 'openai', model: 'gpt-4o', customBaseUrl: '', temperature: 0.2, systemPrompt: 'You are the core orchestrator. Route requests to specialized agents and summarize results.' },
    sdr: { provider: 'anthropic', model: 'claude-3-5-sonnet', customBaseUrl: '', temperature: 0.6, systemPrompt: 'You are a proactive Sales Development Representative. Identify high-intent leads and schedule meetings.' },
    support: { provider: 'google', model: 'gemini-1.5-flash', customBaseUrl: '', temperature: 0.1, systemPrompt: 'You are a helpful Support Agent. Resolve customer inquiries quickly and politely using the provided documentation.' },
    rag: { provider: 'openai', model: 'text-embedding-3-small', customBaseUrl: '', temperature: 0, systemPrompt: '' }
  });

  const [receiveProfiles, setReceiveProfiles] = useState<ReceiveProfile[]>([]);
  const [sendProfiles, setSendProfiles] = useState<SendProfile[]>([]);
  const [emailMappings, setEmailMappings] = useState<EmailMapping[]>([]);

  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const [vectorStatus, setVectorStatus] = useState({ configured: false, status: 'Checking...', details: '' });
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [leadPlatformConfigs, setLeadPlatformConfigs] = useState<Record<string, LeadPlatformConfig>>({});
  const [editingLeadPlatform, setEditingLeadPlatform] = useState<LeadPlatform | null>(null);
  const [leadPlatformDraft, setLeadPlatformDraft] = useState<LeadPlatformConfig>({
    enabled: false,
    apiKey: '',
    baseUrl: '',
    notes: ''
  });

  useEffect(() => {
    const savedAgentConfigs = localStorage.getItem('agent_configs');
    if (savedAgentConfigs) {
      try {
        setAgentConfigs(prev => ({ ...prev, ...JSON.parse(savedAgentConfigs) }));
      } catch (e) {}
    }
    setTimezone(localStorage.getItem('crm_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone);
    setEmailAlerts(localStorage.getItem('crm_email_alerts') !== 'false');
    setPushAlerts(localStorage.getItem('crm_push_alerts') !== 'false');
    try {
      setLeadPlatformConfigs(JSON.parse(localStorage.getItem('lead_platform_configs') || '{}'));
    } catch (e) {
      setLeadPlatformConfigs({});
    }
    setReceiveProfiles(getReceiveProfiles());
    setSendProfiles(getSendProfiles());
    setEmailMappings(getEmailMappings());
    
    fetch('/api/config/vector')
      .then(res => res.json())
      .then(data => setVectorStatus(data))
      .catch(err => setVectorStatus({ configured: false, status: 'Error', details: err.message }));
  }, []);

  useEffect(() => {
    localStorage.setItem('crm_timezone', timezone);
  }, [timezone]);

  useEffect(() => {
    localStorage.setItem('crm_email_alerts', String(emailAlerts));
  }, [emailAlerts]);

  useEffect(() => {
    localStorage.setItem('crm_push_alerts', String(pushAlerts));
  }, [pushAlerts]);

  const saveLeadPlatformConfigs = (configs: Record<string, LeadPlatformConfig>) => {
    setLeadPlatformConfigs(configs);
    localStorage.setItem('lead_platform_configs', JSON.stringify(configs));
  };

  const openLeadPlatformModal = (platform: LeadPlatform) => {
    const existing = leadPlatformConfigs[platform.id];
    setEditingLeadPlatform(platform);
    setLeadPlatformDraft({
      enabled: existing?.enabled || false,
      apiKey: existing?.apiKey || '',
      baseUrl: existing?.baseUrl || platform.defaultBaseUrl,
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
        alert(data.message);
        // recheck status
        const statusRes = await fetch('/api/config/vector');
        const statusData = await statusRes.json();
        setVectorStatus(statusData);
      } else {
        alert('Error: ' + data.error);
      }
    } catch(e: any) {
      alert('Error: ' + e.message);
    }
  };

  const handleSaveEmailConfig = () => {
    saveReceiveProfiles(receiveProfiles);
    saveSendProfiles(sendProfiles);
    saveEmailMappings(emailMappings);
    alert('Saved Email configuration');
  };

  const addReceiveProfile = () => {
    setReceiveProfiles([...receiveProfiles, {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New IMAP Profile',
      imapHost: '',
      imapPort: '993',
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
      smtpUser: '',
      smtpPass: '',
      resendApiKey: '',
      fromAddress: ''
    }]);
  };

  const addEmailMapping = () => {
    setEmailMappings([...emailMappings, {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Account',
      receiveProfileId: '',
      sendProfileId: ''
    }]);
  };

  const agents = [
    { id: 'orchestrator', label: t('set.agt.orchestrator') },
    { id: 'sdr', label: t('set.agt.sdr') },
    { id: 'support', label: t('set.agt.support') },
    { id: 'rag', label: t('set.agt.rag'), isRag: true }
  ];

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
                  onClick={() => {
                    localStorage.setItem('agent_configs', JSON.stringify(agentConfigs));
                    alert('Saved Agent Configurations');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition-colors shadow-sm"
                >
                  {t('set.gen.save') || 'Save Changes'}
                </button>
              </div>
              <div className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-6">
                
                <div>
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">{t('set.agt.model')}</h3>
                  <div className="space-y-4">
                    {agents.map(agent => {
                      const config = agentConfigs[agent.id as keyof typeof agentConfigs];
                      const availableModels = agent.isRag 
                        ? (embeddingsByProvider[config.provider] || [])
                        : (modelsByProvider[config.provider] || []);

                      return (
                        <div key={agent.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-start bg-slate-50 dark:bg-black/20 p-4 rounded-xl border border-slate-200 dark:border-white/5">
                          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-2">
                            {agent.label}
                          </div>
                          <div>
                            <select 
                              value={config.provider}
                              onChange={e => {
                                const newProvider = e.target.value;
                                const defaultModel = newProvider === 'custom' ? '' : ((agent.isRag ? embeddingsByProvider[newProvider] : modelsByProvider[newProvider])?.[0] || '');
                                setAgentConfigs({...agentConfigs, [agent.id]: { ...config, provider: newProvider, model: defaultModel }})
                              }}
                              className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                            >
                              {providers.filter(p => !agent.isRag || p.id === 'custom' || embeddingsByProvider[p.id]).map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            {config.provider === 'custom' ? (
                              <div className="flex flex-col gap-2">
                                <input 
                                  placeholder="Model Name (e.g. llama-3-70b)"
                                  value={config.model}
                                  onChange={e => setAgentConfigs({...agentConfigs, [agent.id]: { ...config, model: e.target.value }})}
                                  className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                                />
                                <input 
                                  placeholder="Base URL (e.g. https://api.groq...)"
                                  value={config.customBaseUrl || ''}
                                  onChange={e => setAgentConfigs({...agentConfigs, [agent.id]: { ...config, customBaseUrl: e.target.value }})}
                                  className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                                />
                                <input 
                                  type="password"
                                  placeholder="API Key (Optional)"
                                  value={(config as any).customApiKey || ''}
                                  onChange={e => setAgentConfigs({...agentConfigs, [agent.id]: { ...config, customApiKey: e.target.value }})}
                                  className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                                />
                              </div>
                            ) : (
                              <select 
                                value={config.model}
                                onChange={e => setAgentConfigs({...agentConfigs, [agent.id]: { ...config, model: e.target.value }})}
                                className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2.5 text-xs focus:border-blue-500 outline-none"
                              >
                                {availableModels.map(m => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          {!agent.isRag && (
                            <div className="md:col-span-3 mt-2 space-y-4 border-t border-slate-200 dark:border-white/5 pt-4">
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t('set.agt.temperature')}</label>
                                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{(config as any).temperature}</span>
                                </div>
                                <input 
                                  type="range" min="0" max="1" step="0.1" 
                                  value={(config as any).temperature} 
                                  onChange={e => setAgentConfigs({...agentConfigs, [agent.id]: { ...config, temperature: parseFloat(e.target.value) }})}
                                  className="w-full" 
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-2">{t('set.agt.systemPrompt')}</label>
                                <textarea 
                                  rows={3}
                                  value={(config as any).systemPrompt}
                                  onChange={e => setAgentConfigs({...agentConfigs, [agent.id]: { ...config, systemPrompt: e.target.value }})}
                                  className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2 text-xs focus:border-blue-500 outline-none font-mono resize-none"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
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
                  <div key={profile.id} className="p-4 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg relative">
                    <button onClick={() => setReceiveProfiles(receiveProfiles.filter(p => p.id !== profile.id))} className="absolute top-3 right-3 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Username</label>
                        <input value={profile.imapUser} onChange={e => setReceiveProfiles(receiveProfiles.map(p => p.id === profile.id ? { ...p, imapUser: e.target.value } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Password</label>
                        <input type="password" value={profile.imapPass} onChange={e => setReceiveProfiles(receiveProfiles.map(p => p.id === profile.id ? { ...p, imapPass: e.target.value } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                      </div>
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
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">SMTP Host</label>
                          <input value={profile.smtpHost} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, smtpHost: e.target.value } : p))} placeholder="smtp.gmail.com" className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Port</label>
                          <input value={profile.smtpPort} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, smtpPort: e.target.value } : p))} placeholder="465" className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Username</label>
                          <input value={profile.smtpUser} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, smtpUser: e.target.value } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Password</label>
                          <input type="password" value={profile.smtpPass} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, smtpPass: e.target.value } : p))} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">Resend API Key</label>
                        <input type="password" value={profile.resendApiKey} onChange={e => setSendProfiles(sendProfiles.map(p => p.id === profile.id ? { ...p, resendApiKey: e.target.value } : p))} placeholder="re_123456789" className="w-full max-w-md bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500" />
                      </div>
                    )}
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
                  <div key={mapping.id} className="p-4 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg relative flex items-end gap-4">
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
                    <div className="w-4"></div>{/* Spacer for trash button */}
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
                  <button 
                    onClick={() => {
                      localStorage.setItem('wa_hub_url', (document.getElementById('hub_url') as HTMLInputElement).value);
                      localStorage.setItem('wa_hub_token', (document.getElementById('hub_token') as HTMLInputElement).value);
                      alert('Saved WhatsApp Actor Hub configuration');
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition-colors shadow-sm"
                  >
                    {t('set.gen.save')}
                  </button>
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
                    <input 
                      id="hub_token"
                      type="password"
                      defaultValue={localStorage.getItem('wa_hub_token') || ''}
                      placeholder="Enter access token"
                      className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" 
                    />
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
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
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

            <div className="space-y-5 p-6">
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
                <input
                  type="password"
                  value={leadPlatformDraft.apiKey}
                  onChange={e => setLeadPlatformDraft({ ...leadPlatformDraft, apiKey: e.target.value })}
                  placeholder={`Enter ${editingLeadPlatform.name} API key`}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
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
