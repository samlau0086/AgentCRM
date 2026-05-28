import { createContext, useState, useContext, ReactNode } from 'react';

const dictionaries = {
  en: {
    // Layout
    'nav.dashboard': 'Command Center',
    'nav.customers': 'Customers',
    'nav.sales': 'Sales & Quotes',
    'nav.media': 'Media Library',
    'nav.inbox': 'Inbox',
    'nav.agentCenter': 'Agent Center',
    'nav.knowledge': 'Knowledge Base',
    'nav.settings': 'Settings',
    'search.placeholder': 'Search customers, messages, tasks...',
    'sys.active': 'System Active',
    'db.status': 'PGVECTOR_READY',
    'llm.status': 'GPT-4O-AGENT-HOST',
    'sys.trace': 'Sys Diagnostic Trace',

    // Dashboard
    'dash.title': 'AI Command Center',
    'dash.subtitle': 'Overview of your automated pipeline and priority tasks.',
    'dash.activeDeals': 'Active Deals',
    'dash.highIntentLeads': 'High Intent Leads',
    'dash.pendingApprovals': 'Pending Approvals',
    'dash.churnRisk': 'Churn Risk Alerts',
    'dash.velocity': 'Lead & Deal Velocity',
    'dash.actionsReq': 'Agent Actions Req.',
    'dash.priority': 'PRIORITY',
    'dash.reviewAll': 'Review All Actions',

    // Customers
    'cust.title': 'Customers',
    'cust.subtitle': 'Manage accounts and monitor AI insights.',
    'cust.add': 'Add Customer',
    'cust.search': 'Filter customers by name, company...',
    'cust.filters': 'Filters',
    'cust.table.company': 'Company',
    'cust.table.contact': 'Contact',
    'cust.table.stage': 'Stage',
    'cust.table.score': 'AI Priority Score',
    'cust.table.intentRisk': 'Intent / Risk',
    'cust.table.actions': 'Actions',

    // Customer Detail
    'cd.aiSummary': 'AI Customer Summary',
    'cd.nextAction': 'Next Best Action',
    'cd.generateProposal': 'Generate Proposal Draft',
    'cd.dismiss': 'Dismiss',
    'cd.timeline': 'Episodic Memory (Timeline)',
    'cd.viewLog': 'View Full Log',
    'cd.pendingApproval': 'Pending My Approval',
    'cd.approveSend': 'Approve & Send',
    'cd.edit': 'Edit',
    'cd.profileMemory': 'Profile Memory',
    'cd.indSize': 'Industry & Size',
    'cd.budget': 'Target Budget',
    'cd.semanticMemory': 'Semantic Memory',

    // Inbox
    'inbox.title': 'Unified Inbox',
    'inbox.tab.inbox': 'Inbox',
    'inbox.tab.compose': 'Compose Mail',
    'inbox.search': 'Search all channels...',
    'inbox.assign': 'Assign to Sales',
    'inbox.aiInsights': 'Agent Context & Suggestions',
    'inbox.genReply': 'Generate Smart Reply',
    'inbox.placeholder': 'Type your reply, or use the AI generator above...',
    'inbox.send': 'Send Reply',

    // Agent Center
    'ac.title': 'Agent Center',
    'ac.subtitle': 'Orchestrate your multi-agent workforce and workflows.',
    'ac.createFlow': 'Create Workflow',
    'ac.fleet': 'Agent Fleet Status',
    'ac.workflows': 'Active Workflows',
    'ac.tasksProcessed': 'Tasks Processed:',
    'ac.viewLogs': 'View Workflow Logs',

    // Knowledge Base
    'kb.title': 'Structured Knowledge Base',
    'kb.subtitle': 'Upload documents to be vectorized and queried by the Agent fleet.',
    'kb.upload': 'Upload Document',
    'kb.table.title': 'Document Title',
    'kb.table.chunks': 'Vector Chunks',
    'kb.table.status': 'Status',
    'kb.table.updated': 'Last Updated',
    'kb.sync': 'Sync Status',
    'kb.uptodate': 'pgvector up-to-date',
    'kb.syncDesc': 'All knowledge collections are currently embedded and indexed within the memory system. Agents have immediate access to',
    'kb.fragments': 'semantic fragments.',

    // Settings
    'set.title': 'Settings & Configuration',
    'set.subtitle': 'Manage your system preferences, agent configurations, and integrations.',
    'set.tab.general': 'General',
    'set.tab.agents': 'Agents & LLM',
    'set.tab.integrations': 'Integrations',
    'set.gen.appearance': 'Appearance',
    'set.gen.theme': 'Theme',
    'set.gen.language': 'Language',
    'set.gen.notifications': 'Notifications',
    'set.gen.emailAlerts': 'Email Alerts',
    'set.gen.pushAlerts': 'Push Notifications',
    'set.gen.save': 'Save Changes',
    'set.agt.model': 'Agent Models Configuration',
    'set.agt.orchestrator': 'Orchestrator Agent',
    'set.agt.sdr': 'SDR Agent',
    'set.agt.support': 'Support Agent',
    'set.agt.rag': 'RAG & Embeddings',
    'set.agt.temperature': 'Creativity (Temperature)',
    'set.agt.systemPrompt': 'System Prompt',
    'set.agt.maxTokens': 'Max Tokens per Task',
    'set.int.email': 'Email Inbox sync (IMAP/SMTP)',
    'set.int.whatsapp': 'WhatsApp Business API',
    'set.int.waHub': 'WhatsApp Actor Hub',
    'set.int.waHubDesc': 'Manage multiple local WhatsApp clients dynamically.',
    'set.int.vectordb': 'Vector Database (pgvector)',
    'set.int.connect': 'Connect',
    'set.int.connected': 'Connected',
  },
  zh: {
    // Layout
    'nav.dashboard': '中枢控制台',
    'nav.customers': '客户管理',
    'nav.sales': '产品与报价',
    'nav.media': '媒体素材库',
    'nav.inbox': '统一收件箱',
    'nav.agentCenter': '智能体中心',
    'nav.knowledge': '知识库',
    'nav.settings': '设置',
    'search.placeholder': '搜索客户、消息、任务...',
    'sys.active': '系统运行中',
    'db.status': 'PGVECTOR已就绪',
    'llm.status': 'GPT-4O-AGENT-HOST',
    'sys.trace': '系统诊断追踪',

    // Dashboard
    'dash.title': 'AI 中枢控制台',
    'dash.subtitle': '自动化漏斗与优先级任务总览。',
    'dash.activeDeals': '活跃商机',
    'dash.highIntentLeads': '高意向线索',
    'dash.pendingApprovals': '待审批项',
    'dash.churnRisk': '流失预警',
    'dash.velocity': '线索与商机增速',
    'dash.actionsReq': '需 AI 智能体介入',
    'dash.priority': '高优先级',
    'dash.reviewAll': '查看所有动作',

    // Customers
    'cust.title': '客户管理',
    'cust.subtitle': '管理客户数据并监控 AI 洞察。',
    'cust.add': '添加客户',
    'cust.search': '按姓名、公司筛选...',
    'cust.filters': '筛选器',
    'cust.table.company': '公司',
    'cust.table.contact': '联系人',
    'cust.table.stage': '阶段',
    'cust.table.score': 'AI 优先级分数',
    'cust.table.intentRisk': '意向 / 风险',
    'cust.table.actions': '操作',

    // Customer Detail
    'cd.aiSummary': 'AI 客户摘要',
    'cd.nextAction': '最佳下一步推荐',
    'cd.generateProposal': '生成方案草稿',
    'cd.dismiss': '忽略',
    'cd.timeline': '事件记忆 (时间线)',
    'cd.viewLog': '查看完整日志',
    'cd.pendingApproval': '待我审批',
    'cd.approveSend': '批准并发送',
    'cd.edit': '编辑',
    'cd.profileMemory': '画像记忆',
    'cd.indSize': '行业与规模',
    'cd.budget': '目标预算',
    'cd.semanticMemory': '语义记忆',

    // Inbox
    'inbox.title': '统一收件箱',
    'inbox.tab.inbox': '收件',
    'inbox.tab.compose': '发件(邮件)',
    'inbox.search': '搜索全渠道...',
    'inbox.assign': '分配给销售',
    'inbox.aiInsights': '智能体上下文与建议',
    'inbox.genReply': '生成智能回复',
    'inbox.placeholder': '输入回复，或使用上方 AI 生成...',
    'inbox.send': '发送回复',

    // Agent Center
    'ac.title': '智能体中心',
    'ac.subtitle': '编排您的多智能体员工与工作流。',
    'ac.createFlow': '创建工作流',
    'ac.fleet': '智能体运行状态',
    'ac.workflows': '活跃工作流',
    'ac.tasksProcessed': '已处理任务:',
    'ac.viewLogs': '查看工作流日志',

    // Knowledge Base
    'kb.title': '结构化知识库',
    'kb.subtitle': '上传文档以供智能体集群将其向量化并进行检索。',
    'kb.upload': '上传文档',
    'kb.table.title': '文档标题',
    'kb.table.chunks': '向量切片 (Chunks)',
    'kb.table.status': '状态',
    'kb.table.updated': '最后更新',
    'kb.sync': '同步状态',
    'kb.uptodate': 'pgvector 已同步',
    'kb.syncDesc': '所有知识集目前已嵌入模型并在记忆系统中建立索引。智能体现在可直接访问',
    'kb.fragments': '个语义切片。',

    // Settings
    'set.title': '设置与配置',
    'set.subtitle': '管理您的系统偏好、智能体配置和集成。',
    'set.tab.general': '常规参数',
    'set.tab.agents': '智能体与模型',
    'set.tab.integrations': '系统集成',
    'set.gen.appearance': '外观',
    'set.gen.theme': '主题',
    'set.gen.language': '语言',
    'set.gen.notifications': '通知及提醒',
    'set.gen.emailAlerts': '邮件提醒',
    'set.gen.pushAlerts': '推送通知',
    'set.gen.save': '保存更改',
    'set.agt.model': '智能体模型配置',
    'set.agt.orchestrator': '中枢调度智能体',
    'set.agt.sdr': '销售/SDR智能体',
    'set.agt.support': '客服智能体',
    'set.agt.rag': 'RAG 向量检索模型',
    'set.agt.temperature': '创造力 (Temperature)',
    'set.agt.systemPrompt': '系统提示词',
    'set.agt.maxTokens': '单任务最大 Token',
    'set.int.email': '邮箱同步 (IMAP/SMTP)',
    'set.int.whatsapp': 'WhatsApp 商业 API',
    'set.int.waHub': 'WhatsApp 多开中枢 (Actor Hub)',
    'set.int.waHubDesc': '动态调度管理多个本地 WhatsApp 客户端。',
    'set.int.vectordb': '向量数据库 (pgvector)',
    'set.int.connect': '连接',
    'set.int.connected': '已连接',
  }
};

export type Language = 'en' | 'zh';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof dictionaries['en']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved === 'en' || saved === 'zh') ? saved : 'zh';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key: keyof typeof dictionaries['en']) => {
    return dictionaries[language][key] || dictionaries['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
