import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Filter, MoreHorizontal, ShieldAlert, Zap, Edit2, Trash2, X, Plus } from 'lucide-react';
import { cn } from '../Layout';
import { useLanguage } from '../i18n';
import { getCustomers, saveCustomers, deleteCustomer, addCustomer, updateCustomer, Customer, getPublicLeads, PublicLead, claimLead } from '../services/db';

const CONTACT_TYPES = ['Mobile', 'Phone', 'Email', 'WhatsApp', 'Messenger', 'WeChat', 'Other'];

function CustomerFormView({
  customer,
  onSave,
  onClose,
}: {
  key?: React.Key;
  customer: Customer | null;
  onSave: (c: Customer) => void;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<Customer["contacts"]>(
    customer?.contacts?.length ? customer.contacts : [{ id: Math.random().toString(36).substring(7), type: 'Mobile', value: '' }]
  );
  
  const [tags, setTags] = useState<string[]>(customer?.tags || []);

  const handleAddContact = () => {
    setContacts([...contacts, { id: Math.random().toString(36).substring(7), type: 'Mobile', value: '' }]);
  };

  const handleUpdateContact = (id: string, field: keyof Customer["contacts"][0], value: string) => {
    setContacts(contacts.map(c => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleDeleteContact = (id: string) => {
    setContacts(contacts.filter(c => c.id !== id));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);
    
    onSave({
      id: customer ? customer.id : `cus_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name as string,
      contact: data.contact as string,
      contacts: contacts.filter(c => c.value.trim() !== ''),
      address: data.address as string,
      city: data.city as string,
      province: data.province as string,
      description: data.description as string,
      stage: data.stage as string,
      score: parseInt(data.score as string, 10),
      risk: parseInt(data.risk as string, 10),
      intent: data.intent as string,
      tags: tags,
    } as any);
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
      <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-white/5 shrink-0 bg-slate-50 dark:bg-black/20">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          {customer ? 'Edit Customer' : 'Add New Customer'}
        </h2>
        <button 
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 bg-white dark:bg-transparent">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Company Name</label>
            <input required name="name" defaultValue={customer?.name} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Contact Name</label>
            <input required name="contact" defaultValue={customer?.contact} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
          </div>
        </div>
        
        <div className="border border-slate-200 dark:border-white/10 rounded-xl p-5 bg-slate-50/50 dark:bg-black/10 space-y-4">
          <div className="flex items-center justify-between">
             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contact Methods</label>
             <button type="button" onClick={handleAddContact} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors text-xs font-medium">
               <Plus className="w-3.5 h-3.5" />
               Add Method
             </button>
          </div>
          
          <div className="space-y-3">
            {contacts.map((contact, index) => (
              <div key={contact.id} className="flex items-center gap-3">
                <select 
                  value={contact.type}
                  onChange={(e) => handleUpdateContact(contact.id, 'type', e.target.value)}
                  className="w-1/3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
                >
                  {CONTACT_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <input 
                  value={contact.value}
                  onChange={(e) => handleUpdateContact(contact.id, 'value', e.target.value)}
                  placeholder={`Enter ${contact.type}`}
                  className="flex-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" 
                />
                <button 
                  type="button"
                  onClick={() => handleDeleteContact(contact.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {contacts.length === 0 && (
              <p className="text-xs text-slate-400 italic">No contact methods specified.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Address</label>
             <input name="address" defaultValue={customer?.address} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
          </div>
          <div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">City</label>
                <input name="city" defaultValue={customer?.city} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">State / Province</label>
                <input name="province" defaultValue={customer?.province} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
           <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description</label>
              <textarea name="description" defaultValue={customer?.description} rows={3} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none resize-y" />
           </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div>
             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Country</label>
             <input list="country-list" name="country" defaultValue={customer?.country} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
             <datalist id="country-list">
               <option value="United States" />
               <option value="Canada" />
               <option value="United Kingdom" />
               <option value="Australia" />
               <option value="Germany" />
               <option value="France" />
               <option value="Japan" />
               <option value="China" />
               <option value="India" />
               <option value="Brazil" />
               <option value="Mexico" />
               <option value="South Africa" />
               <option value="Spain" />
               <option value="Italy" />
               <option value="Netherlands" />
               <option value="New Zealand" />
               <option value="Singapore" />
               <option value="United Arab Emirates" />
             </datalist>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Stage</label>
            <select name="stage" defaultValue={customer?.stage || 'New Lead'} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none">
              <option value="New Lead">New Lead</option>
              <option value="Negotiation">Negotiation</option>
              <option value="Qualified">Qualified</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Score (0-100)</label>
            <input required name="score" type="number" min="0" max="100" defaultValue={customer?.score || 50} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Intent</label>
            <select name="intent" defaultValue={customer?.intent || 'Low'} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none">
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Risk</label>
            <select name="risk" defaultValue={customer?.risk || 'Low'} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none">
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag, idx) => (
                <span key={idx} className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium flex items-center gap-1 border border-blue-200 dark:border-blue-800">
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                    className="hover:text-amber-500 ml-1"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <input 
              placeholder="Add a tag and press Enter..."
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const val = e.currentTarget.value.trim();
                  if (val && !tags.includes(val)) {
                    setTags([...tags, val]);
                    e.currentTarget.value = '';
                  }
                }
              }}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-white/5">
          <button 
            type="button" 
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
          >
            Cancel
          </button>
          <button 
            type="submit"
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm"
          >
            Save Customer
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Customers() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'my-customers' | 'public-pool'>('my-customers');
  const [customers, setCustomers] = useState<Customer[]>(getCustomers());
  const [publicLeads, setPublicLeads] = useState<PublicLead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    setPublicLeads(getPublicLeads());
    const editId = searchParams.get('edit');
    if (editId) {
      const c = getCustomers().find(c => c.id === editId);
      if (c) {
        setEditingCustomer(c);
        setIsModalOpen(true);
      }
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const handleAdd = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    deleteCustomer(id);
    setCustomers(getCustomers());
  };

  const handleSaveCustomer = (newCustomer: Customer) => {
    if (editingCustomer) {
      updateCustomer(editingCustomer.id, newCustomer);
    } else {
      addCustomer(newCustomer as any);
    }
    setCustomers(getCustomers());
    setIsModalOpen(false);
  };

  const filteredCustomers = customers.filter(c => {
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.tags || []).some(t => t.toLowerCase().includes(q));
  });

  return (
    <div className="p-4 md:p-8 h-full flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-6 md:flex-row md:items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">{t('cust.title')}</h1>
          <p className="text-slate-400 dark:text-slate-500 mt-1 text-sm font-light">{t('cust.subtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-lg flex items-center gap-1 border border-slate-200 dark:border-white/10 shadow-inner">
            <button
              onClick={() => setActiveTab('my-customers')}
              className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all", activeTab === 'my-customers' ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300")}
            >
              My Customers
            </button>
            <button
              onClick={() => setActiveTab('public-pool')}
              className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2", activeTab === 'public-pool' ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300")}
            >
              Public Pool
              {publicLeads.length > 0 && (
                <span className="bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 px-1.5 py-0.5 rounded text-[10px]">
                  {publicLeads.length}
                </span>
              )}
            </button>
          </div>
          {!isModalOpen && activeTab === 'my-customers' && (
            <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {t('cust.add')}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        <div className={cn(
          "bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-xl flex flex-col overflow-hidden transition-all duration-300",
          isModalOpen ? "hidden lg:flex lg:w-1/3 shrink-0" : "flex-1"
        )}>
          <div className="p-4 border-b border-slate-200 dark:border-white/5 flex gap-4 shrink-0 bg-slate-50 dark:bg-black/20">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={t('cust.search') + " (or search by tags)"}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500/50 focus:bg-white dark:bg-white/5 shadow-sm dark:shadow-none outline-none transition-all"
              />
            </div>
            {!isModalOpen && (
              <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white dark:bg-white/5 shadow-sm dark:shadow-none transition-colors">
                <Filter className="h-4 w-4" />
                {t('cust.filters')}
              </button>
            )}
          </div>

          <div className="overflow-auto flex-1">
            {activeTab === 'my-customers' ? (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white dark:bg-black/40 border-b border-slate-200 dark:border-white/5 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">{t('cust.table.company')}</th>
                  {!isModalOpen && (
                    <>
                      <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">{t('cust.table.contact')}</th>
                      <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">{t('cust.table.stage')}</th>
                      <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">{t('cust.table.score')}</th>
                      <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">{t('cust.table.intentRisk')}</th>
                      <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500 text-right">{t('cust.table.actions')}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className={cn("hover:bg-white/[0.04] transition-colors cursor-pointer", editingCustomer?.id === c.id && isModalOpen ? "bg-blue-50/50 dark:bg-blue-900/10" : "")} onClick={() => isModalOpen && handleEdit(c)}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {!isModalOpen ? (
                           <Link to={`/customers/${c.id}`} className="font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:text-blue-400 transition-colors">
                             {c.name}
                           </Link>
                        ) : (
                          <span className="font-medium text-slate-900 dark:text-white">{c.name}</span>
                        )}
                        {!isModalOpen && c.tags && c.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {c.tags.map(t => (
                              <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400">{t}</span>
                            ))}
                          </div>
                        )}
                        {isModalOpen && <span className="text-xs text-slate-500">{c.contact}</span>}
                      </div>
                    </td>
                    {!isModalOpen && (
                      <>
                        <td className="px-6 py-4 text-slate-400 dark:text-slate-500 dark:text-slate-400">{c.contact}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded text-[10px] font-mono",
                            c.stage === 'Negotiation' ? 'bg-purple-900/40 text-purple-400 border border-purple-500/20' :
                            c.stage === 'Qualified' ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-500/30' :
                            'bg-white/10 text-slate-400 dark:text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10'
                          )}>
                            {c.stage}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 w-16 bg-white/10 rounded-full overflow-hidden">
                              <div 
                                className={cn("h-full rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]", c.score > 80 ? 'bg-emerald-500' : c.score > 50 ? 'bg-amber-500' : 'bg-rose-500')}
                                style={{ width: `${c.score}%` }} 
                              />
                            </div>
                            <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{c.score}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex gap-4">
                              <div className="flex items-center gap-1.5">
                                <Zap className={cn("w-3.5 h-3.5", c.intent === 'High' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600')} />
                                <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-400">{c.intent}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <ShieldAlert className={cn("w-3.5 h-3.5", c.risk === 'High' ? 'text-rose-600 dark:text-rose-500' : 'text-slate-600')} />
                                <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-400">{c.risk} risk</span>
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={(e) => { e.stopPropagation(); handleEdit(c); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors">
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white dark:bg-black/40 border-b border-slate-200 dark:border-white/5 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">Lead Info</th>
                  <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">Contact</th>
                  <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">Source</th>
                  <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">Location</th>
                  <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {publicLeads.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.source.toLowerCase().includes(searchQuery.toLowerCase())).map((lead) => (
                  <tr key={lead.id} className="hover:bg-white/[0.04] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-900 dark:text-white">{lead.name}</span>
                        {lead.industry && <span className="text-xs text-slate-500">{lead.industry}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400 dark:text-slate-500">{lead.contact}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded text-[10px] font-mono bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                        {lead.source}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 dark:text-slate-500">{lead.location || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => {
                          claimLead(lead.id, 'user');
                          setPublicLeads(getPublicLeads());
                          setCustomers(getCustomers());
                        }} 
                        className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors shadow-sm"
                      >
                        Claim Lead
                      </button>
                    </td>
                  </tr>
                ))}
                {publicLeads.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      No leads currently available in the public pool. Let your Lead Generation agents gather more!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>

        {isModalOpen && (
          <CustomerFormView 
            key={editingCustomer?.id || 'new'}
            customer={editingCustomer} 
            onSave={handleSaveCustomer} 
            onClose={() => setIsModalOpen(false)} 
          />
        )}
      </div>
    </div>
  );
}
