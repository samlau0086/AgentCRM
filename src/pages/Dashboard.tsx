import { useState, useEffect } from 'react';
import { Users, TrendingUp, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n';
import { getCustomers, getInboxMessages, getAgents } from '../services/db';

const data = [
  { name: 'Mon', leads: 400, deals: 240 },
  { name: 'Tue', leads: 300, deals: 139 },
  { name: 'Wed', leads: 200, deals: 980 },
  { name: 'Thu', leads: 278, deals: 390 },
  { name: 'Fri', leads: 189, deals: 480 },
  { name: 'Sat', leads: 239, deals: 380 },
  { name: 'Sun', leads: 349, deals: 430 },
];

export default function Dashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    activeDeals: 0,
    highIntentLeads: 0,
    pendingApprovals: 0,
    churnRisk: 0,
  });

  useEffect(() => {
    const customers = getCustomers();
    const messages = getInboxMessages();

    setStats({
      activeDeals: customers.filter(c => c.stage === 'Negotiation' || c.stage === 'Qualified').length,
      highIntentLeads: customers.filter(c => c.intent === 'High').length,
      pendingApprovals: messages.filter(m => !m.read).length,
      churnRisk: customers.filter(c => c.risk > 50).length,
    });
  }, []);

  return (
    <div className="w-full p-4 md:p-8 space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">{t('dash.title')}</h1>
          <p className="text-slate-400 dark:text-slate-500 dark:text-slate-400 mt-1 text-sm font-light">{t('dash.subtitle')}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: t('dash.activeDeals'), value: stats.activeDeals, trend: '+12%', icon: TrendingUp, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-600/20 border-blue-500/30 text-emerald-600 dark:text-emerald-400', link: '/customers' },
          { label: t('dash.highIntentLeads'), value: stats.highIntentLeads, trend: '+5%', icon: Users, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-600/20 border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400', link: '/customers' },
          { label: t('dash.pendingApprovals'), value: stats.pendingApprovals, trend: '-2%', icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-600/20 border-amber-500/30 text-slate-400 dark:text-slate-500 dark:text-slate-400', link: '/inbox' },
          { label: t('dash.churnRisk'), value: stats.churnRisk, trend: '0%', icon: AlertCircle, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-950/20 border-rose-600/20 dark:border-rose-500/20 text-slate-400 dark:text-slate-500 dark:text-slate-400', link: '/customers' },
        ].map((stat, i) => (
          <div 
            key={i} 
            onClick={() => navigate(stat.link)}
            className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-xl p-6 flex flex-col cursor-pointer hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-slate-400 dark:text-slate-500 text-xs uppercase tracking-widest">{stat.label}</span>
              <div className={`p-2 rounded-lg border ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </div>
            <div className="mt-4 flex items-baseline">
              <span className="text-3xl font-light text-slate-900 dark:text-white">{stat.value}</span>
              <span className={`ml-2 text-sm font-medium ${stat.trend.startsWith('+') ? 'text-emerald-600 dark:text-emerald-400' : stat.trend === '0%' ? 'text-slate-400 dark:text-slate-500' : 'text-rose-600 dark:text-rose-500'}`}>
                {stat.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-wide mb-6">{t('dash.velocity')}</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDeals" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.8)', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '14px', fontWeight: 500 }}
                />
                <Area type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorLeads)" />
                <Area type="monotone" dataKey="deals" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorDeals)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Suggestions / Pending Actions */}
        <div className="bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-wide">{t('dash.actionsReq')}</h2>
            <span className="text-[10px] font-mono bg-rose-950/40 border border-rose-600/20 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 px-2 py-1 rounded">3 {t('dash.priority')}</span>
          </div>
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {[
              { title: 'Draft Quote for Global Tech', desc: 'AI drafted a response for 10k units volume discount.', customer: 'Global Tech', type: 'Approval', link: '/inbox' },
              { title: 'Churn Risk Warning', desc: 'Acme Corp has not replied in 7 days.', customer: 'Acme Corp', type: 'Alert', link: '/customers' },
              { title: 'Suggest Follow-up', desc: 'Oceanic Airlines opened pricing email 3 times.', customer: 'Oceanic Airlines', type: 'Task', link: '/inbox' }
            ].map((action, i) => (
              <div 
                key={i} 
                onClick={() => navigate(action.link)}
                className="group bg-white dark:bg-white/5 shadow-sm dark:shadow-none hover:bg-slate-50 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/5 p-4 rounded-xl transition-all cursor-pointer"
               >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                      action.type === 'Approval' ? 'bg-amber-600/20 border-amber-500/30 text-amber-600 dark:text-amber-400' :
                      action.type === 'Alert' ? 'bg-rose-950/40 border-rose-600/20 dark:border-rose-500/20 text-rose-600 dark:text-rose-400' :
                      'bg-blue-600/20 border-blue-500/30 text-blue-600 dark:text-blue-400'
                    }`}>
                      {action.type === 'Approval' && <CheckCircle2 className="w-4 h-4" />}
                      {action.type === 'Alert' && <AlertCircle className="w-4 h-4" />}
                      {action.type === 'Task' && <Clock className="w-4 h-4" />}
                    </div>
                    <div>
                      <h3 className="text-slate-900 dark:text-white text-sm font-medium">{action.title}</h3>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">{action.customer}</div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 italic line-clamp-2 mt-2">{action.desc}</p>
              </div>
            ))}
          </div>
          <div className="p-4 pt-0">
             <button 
               onClick={() => navigate('/agent-center')}
               className="w-full py-2 bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded text-xs font-semibold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
             >
               {t('dash.reviewAll') || 'Review All Agents'}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
