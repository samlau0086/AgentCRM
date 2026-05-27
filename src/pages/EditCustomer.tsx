import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../i18n';
import { getCustomer, updateCustomer, Customer } from '../services/db';

export default function EditCustomer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [customer, setCustomer] = useState<Customer | undefined>(undefined);

  useEffect(() => {
    if (id) {
      setCustomer(getCustomer(id));
    }
  }, [id]);

  const handleSave = () => {
    if (customer && id) {
      updateCustomer(id, customer);
      alert('Customer updated successfully');
      navigate(`/customers/${id}`);
    }
  };

  const updateContact = (index: number, value: string) => {
    if (!customer) return;
    const newContacts = [...customer.contacts];
    newContacts[index] = { ...newContacts[index], value };
    setCustomer({ ...customer, contacts: newContacts });
  };

  const removeContact = (index: number) => {
    if (!customer) return;
    const newContacts = [...customer.contacts];
    newContacts.splice(index, 1);
    setCustomer({ ...customer, contacts: newContacts });
  };

  const addContact = () => {
    if (!customer) return;
    setCustomer({
      ...customer,
      contacts: [...(customer.contacts || []), { type: 'Email', value: '', id: Date.now().toString() }]
    });
  };

  if (!customer) return <div>Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to={`/customers/${id}`} className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors border border-transparent hover:border-slate-200 dark:border-white/5">
            <ArrowLeft className="w-5 h-5 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white" />
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Edit Customer</h1>
        </div>
        <button 
          onClick={handleSave}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex text-sm font-semibold items-center gap-2 transition-colors shadow-sm"
        >
          <Save className="w-4 h-4" /> Save Changes
        </button>
      </div>

      <div className="bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-2xl p-6 md:p-8 space-y-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Company Name</label>
            <input 
              value={customer.name}
              onChange={e => setCustomer({...customer, name: e.target.value})}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Primary Contact Name</label>
            <input 
              value={customer.contact}
              onChange={e => setCustomer({...customer, contact: e.target.value})}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Stage</label>
            <select 
              value={customer.stage}
              onChange={e => setCustomer({...customer, stage: e.target.value})}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm appearance-none"
            >
              <option>Lead</option>
              <option>Qualified</option>
              <option>Negotiation</option>
              <option>Closed Won</option>
              <option>Closed Lost</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Industry</label>
            <input 
              value={customer.industry}
              onChange={e => setCustomer({...customer, industry: e.target.value})}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
            />
          </div>
        </div>

        <hr className="border-slate-200 dark:border-white/10" />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contact Methods</label>
            <button 
              onClick={addContact}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Contact
            </button>
          </div>
          <div className="space-y-3">
            {customer.contacts.map((c, i) => (
              <div key={c.id} className="flex gap-3">
                <input 
                  value={c.value}
                  onChange={e => updateContact(i, e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm bg-transparent"
                  placeholder="name@company.com"
                />
                <button 
                  onClick={() => removeContact(i)}
                  className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-50 hover:bg-rose-50 dark:bg-white/5 dark:hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent dark:border-white/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <hr className="border-slate-200 dark:border-white/10" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Office Address</label>
            <input 
              value={customer.address || ''}
              onChange={e => setCustomer({...customer, address: e.target.value})}
              placeholder="123 Corporate Blvd"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">City</label>
              <input 
                value={customer.city || ''}
                onChange={e => setCustomer({...customer, city: e.target.value})}
                placeholder="San Francisco"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Province / State</label>
              <input 
                value={customer.province || ''}
                onChange={e => setCustomer({...customer, province: e.target.value})}
                placeholder="CA"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
          <textarea 
            rows={3}
            value={customer.description || ''}
            onChange={e => setCustomer({...customer, description: e.target.value})}
            placeholder="A brief description of this customer's business..."
            className="w-full px-4 py-3 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm resize-y"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Internal Notes</label>
          <textarea 
            rows={4}
            value={customer.notes}
            onChange={e => setCustomer({...customer, notes: e.target.value})}
            className="w-full px-4 py-3 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm resize-y"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tags</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(customer.tags || []).map((tag, idx) => (
              <span key={idx} className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium flex items-center gap-1 border border-blue-200 dark:border-blue-800">
                {tag}
                <button
                  type="button"
                  onClick={() => setCustomer({ ...customer, tags: customer.tags?.filter((_, i) => i !== idx) })}
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
                if (val && !(customer.tags || []).includes(val)) {
                  setCustomer({ ...customer, tags: [...(customer.tags || []), val] });
                  e.currentTarget.value = '';
                }
              }
            }}
            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
          />
        </div>

      </div>
    </div>
  );
}
