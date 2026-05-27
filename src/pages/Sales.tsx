import React, { useState, useEffect } from 'react';
import { Plus, Tag, Receipt, Search, Edit2, Trash2, X, Save, Check, Image as ImageIcon } from 'lucide-react';
import { cn } from '../Layout';
import { useLanguage } from '../i18n';
import MediaLibraryModal from '../components/MediaLibraryModal';
import ConfirmModal from '../components/ConfirmModal';
import {
  Product, getProducts, addProduct, updateProduct, deleteProduct,
  Quote, getQuotes, addQuote, updateQuote, deleteQuote,
  getCustomers, Customer
} from '../services/db';

export default function Sales() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'products' | 'quotes'>('products');
  
  const [products, setProducts] = useState<Product[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals for Create/Edit
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Partial<Quote> | null>(null);

  // Deletion modals
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [deletingQuoteId, setDeletingQuoteId] = useState<string | null>(null);

  // Media picker modal
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);

  useEffect(() => {
    setProducts(getProducts());
    setQuotes(getQuotes());
    setCustomers(getCustomers());
  }, []);

  const calculateQuoteTotals = (quote: Partial<Quote>) => {
    const items = quote.items || [];
    const feeLines = quote.feeLines || [];
    const subtotal = items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
    const lineTotal = items.reduce((acc, it) => acc + Math.max(it.total, 0), 0);
    const fees = feeLines.reduce((acc, f) => acc + f.amount, 0);
    return {
      subtotal,
      totalDiscount: Math.max(subtotal - lineTotal, 0),
      total: lineTotal + fees,
    };
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    
    if (editingProduct.id) {
      updateProduct(editingProduct.id, editingProduct);
    } else {
      addProduct({
        name: editingProduct.name || '',
        description: editingProduct.description || '',
        sku: editingProduct.sku || '',
        price: editingProduct.price || 0,
        currency: editingProduct.currency || 'USD',
        status: editingProduct.status || 'Active',
        image: editingProduct.image
      });
    }
    setProducts(getProducts());
    setIsProductModalOpen(false);
    setEditingProduct(null);
  };

  const handleDeleteProduct = (id: string) => {
    setDeletingProductId(id);
  };

  const confirmDeleteProduct = () => {
    if (deletingProductId) {
      deleteProduct(deletingProductId);
      setProducts(getProducts());
      setDeletingProductId(null);
    }
  };

  const handleSaveQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuote) return;
    const totals = calculateQuoteTotals(editingQuote);
    const quoteToSave = { ...editingQuote, ...totals };

    if (editingQuote.id) {
      updateQuote(editingQuote.id, quoteToSave);
    } else {
      addQuote({
        customerId: quoteToSave.customerId || '',
        date: quoteToSave.date || new Date().toISOString().split('T')[0],
        validUntil: quoteToSave.validUntil || '',
        items: quoteToSave.items || [],
        feeLines: quoteToSave.feeLines || [],
        paymentTerms: quoteToSave.paymentTerms || '',
        subtotal: quoteToSave.subtotal || 0,
        totalDiscount: quoteToSave.totalDiscount || 0,
        total: quoteToSave.total || 0,
        status: quoteToSave.status || 'Draft',
        notes: quoteToSave.notes || ''
      });
    }
    setQuotes(getQuotes());
    setIsQuoteModalOpen(false);
    setEditingQuote(null);
  };

  const handleDeleteQuote = (id: string) => {
    setDeletingQuoteId(id);
  };

  const confirmDeleteQuote = () => {
    if (deletingQuoteId) {
      deleteQuote(deletingQuoteId);
      setQuotes(getQuotes());
      setDeletingQuoteId(null);
    }
  };

  return (
    <div className="p-4 md:p-8 h-full flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-6 md:flex-row md:items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Sales &amp; Quotes</h1>
          <p className="text-slate-400 dark:text-slate-500 mt-1 text-sm font-light">Manage product catalog and quotes</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-lg flex items-center gap-1 border border-slate-200 dark:border-white/10 shadow-inner">
            <button
              onClick={() => setActiveTab('products')}
              className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2", activeTab === 'products' ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300")}
            >
              <Tag className="w-4 h-4" /> Products
            </button>
            <button
              onClick={() => setActiveTab('quotes')}
              className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2", activeTab === 'quotes' ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300")}
            >
              <Receipt className="w-4 h-4" /> Quotes
            </button>
          </div>
          <button 
            onClick={() => {
               if (activeTab === 'products') {
                 setEditingProduct({ currency: 'USD', status: 'Active' });
                 setIsProductModalOpen(true);
               } else {
                 setEditingQuote({ 
                   date: new Date().toISOString().split('T')[0], 
                   items: [],
                   status: 'Draft' 
                 });
                 setIsQuoteModalOpen(true);
               }
            }} 
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'products' ? 'Add Product' : 'Create Quote'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
         {/* Search Bar */}
         <div className="p-4 border-b border-slate-200 dark:border-white/10 shrink-0">
           <div className="relative max-w-md">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input
               type="text"
               placeholder={`Search ${activeTab}...`}
               value={searchQuery}
               onChange={e => setSearchQuery(e.target.value)}
               className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
             />
           </div>
         </div>

         <div className="overflow-auto flex-1">
           {activeTab === 'products' ? (
             <table className="w-full text-left text-sm whitespace-nowrap">
               <thead className="bg-slate-50 dark:bg-black/40 border-b border-slate-200 dark:border-white/5 sticky top-0 z-10">
                 <tr>
                   <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-500">Product Name</th>
                   <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-500">SKU</th>
                   <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-500">Price</th>
                   <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-500">Status</th>
                   <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-500 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                 {products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.toLowerCase().includes(searchQuery.toLowerCase())).map(product => (
                   <tr key={product.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                     <td className="px-6 py-4">
                       <div className="flex items-center gap-3">
                         {product.image ? (
                           <img src={product.image} alt={product.name} className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-white/10 shrink-0" />
                         ) : (
                           <div className="w-8 h-8 rounded bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0 border border-slate-200 dark:border-white/10">
                             <Tag className="w-4 h-4 text-slate-400" />
                           </div>
                         )}
                         <div>
                           <span className="font-medium text-slate-900 dark:text-white">{product.name}</span>
                           <p className="text-xs text-slate-500 truncate max-w-[200px] mt-0.5">{product.description}</p>
                         </div>
                       </div>
                     </td>
                     <td className="px-6 py-4 text-slate-500 font-mono text-xs">{product.sku}</td>
                     <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{product.price.toLocaleString()} {product.currency}</td>
                     <td className="px-6 py-4">
                       <span className={cn("px-2 py-1 rounded text-[10px] font-medium", product.status === 'Active' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400")}>
                         {product.status}
                       </span>
                     </td>
                     <td className="px-6 py-4 text-right">
                       <button onClick={() => { setEditingProduct(product); setIsProductModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-500 transition-colors">
                         <Edit2 className="w-4 h-4" />
                       </button>
                       <button onClick={() => handleDeleteProduct(product.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                         <Trash2 className="w-4 h-4" />
                       </button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           ) : (
             <table className="w-full text-left text-sm whitespace-nowrap">
               <thead className="bg-slate-50 dark:bg-black/40 border-b border-slate-200 dark:border-white/5 sticky top-0 z-10">
                 <tr>
                   <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-500">Quote ID</th>
                   <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-500">Customer</th>
                   <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-500">Date</th>
                   <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-500">Total</th>
                   <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-500">Status</th>
                   <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-500 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                 {quotes.filter(q => (q.id.toLowerCase().includes(searchQuery.toLowerCase()))).map(quote => (
                   <tr key={quote.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                     <td className="px-6 py-4 font-mono text-xs text-slate-500">{quote.id}</td>
                     <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                       {customers.find(c => c.id === quote.customerId)?.name || 'Unknown'}
                     </td>
                     <td className="px-6 py-4 text-slate-500">{quote.date}</td>
                     <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">${quote.total.toLocaleString()}</td>
                     <td className="px-6 py-4">
                       <span className={cn("px-2 py-1 rounded text-[10px] font-medium", 
                         quote.status === 'Approved' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : 
                         quote.status === 'Sent' ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" :
                         quote.status === 'Rejected' ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" :
                         "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                       )}>
                         {quote.status}
                       </span>
                     </td>
                     <td className="px-6 py-4 text-right">
                       <button onClick={() => { setEditingQuote(quote); setIsQuoteModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-500 transition-colors">
                         <Edit2 className="w-4 h-4" />
                       </button>
                       <button onClick={() => handleDeleteQuote(quote.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                         <Trash2 className="w-4 h-4" />
                       </button>
                     </td>
                   </tr>
                 ))}
                 {quotes.length === 0 && (
                   <tr>
                     <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                       No quotes found. Create a quote to get started.
                     </td>
                   </tr>
                 )}
               </tbody>
             </table>
           )}
         </div>
      </div>

      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/10">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-white">
                {editingProduct?.id ? 'Edit Product' : 'Add Product'}
              </h2>
              <button onClick={() => setIsProductModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                  <input required type="text" value={editingProduct?.name || ''} onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                  <textarea rows={3} value={editingProduct?.description || ''} onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Image URL</label>
                  <div className="flex gap-4 items-center">
                    {editingProduct?.image ? (
                      <img src={editingProduct.image} alt="Preview" className="w-10 h-10 object-cover rounded border border-slate-200 dark:border-white/10 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 shrink-0 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded flex items-center justify-center">
                         <ImageIcon className="w-4 h-4 text-slate-400" />
                      </div>
                    )}
                    <input type="text" placeholder="https://..." value={editingProduct?.image || ''} onChange={e => setEditingProduct({ ...editingProduct, image: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
                    <button type="button" onClick={() => setIsMediaPickerOpen(true)} className="shrink-0 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-white/10">
                      Choose
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">SKU</label>
                    <input required type="text" value={editingProduct?.sku || ''} onChange={e => setEditingProduct({ ...editingProduct, sku: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Price</label>
                    <input required type="number" step="0.01" value={editingProduct?.price || ''} onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Currency</label>
                    <select value={editingProduct?.currency || 'USD'} onChange={e => setEditingProduct({ ...editingProduct, currency: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none">
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="CNY">CNY</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                    <select value={editingProduct?.status || 'Active'} onChange={e => setEditingProduct({ ...editingProduct, status: e.target.value as any })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none">
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="pt-6 flex justify-end gap-3 border-t border-slate-200 dark:border-white/10 mt-6">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isQuoteModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/10">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-white">
                {editingQuote?.id ? 'Edit Quote' : 'Create Quote'}
              </h2>
              <button type="button" onClick={() => setIsQuoteModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveQuote} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Customer</label>
                  <select required value={editingQuote?.customerId || ''} onChange={e => setEditingQuote({ ...editingQuote, customerId: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none">
                    <option value="" disabled>Select a customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select value={editingQuote?.status || 'Draft'} onChange={e => setEditingQuote({ ...editingQuote, status: e.target.value as any })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none">
                    <option value="Draft">Draft</option>
                    <option value="Sent">Sent</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
                  <input type="date" value={editingQuote?.date || ''} onChange={e => setEditingQuote({ ...editingQuote, date: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Valid Until</label>
                  <input type="date" value={editingQuote?.validUntil || ''} onChange={e => setEditingQuote({ ...editingQuote, validUntil: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Quote Items</label>
                  <button type="button" onClick={() => {
                    const newItems = [...(editingQuote?.items || []), { productId: '', name: '', quantity: 1, unitPrice: 0, discount: 0, total: 0 }];
                    setEditingQuote({ ...editingQuote, items: newItems });
                  }} className="text-xs text-blue-600 hover:text-blue-500 font-medium">
                    + Add Item
                  </button>
                </div>
                <div className="space-y-3">
                  {editingQuote?.items?.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-slate-50 dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-white/5">
                      <div className="flex-1 space-y-2">
                         <div className="grid grid-cols-[2fr_0.8fr_1fr_1fr_1fr] gap-2">
                           <select 
                             value={item.productId} 
                             onChange={e => {
                               const prodId = e.target.value;
                               const prod = products.find(p => p.id === prodId);
                               if (prod) {
                                 const newItems = [...(editingQuote.items || [])];
                                 newItems[idx] = { ...item, productId: prod.id, name: prod.name, unitPrice: prod.price, total: Math.max(prod.price * item.quantity - item.discount, 0) };
                                 setEditingQuote({ ...editingQuote, items: newItems });
                               }
                             }}
                             className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none"
                           >
                             <option value="" disabled>Select Product</option>
                             {products.map(p => <option key={p.id} value={p.id}>{p.name} - ${p.price}</option>)}
                           </select>
                           <input type="number" min="1" placeholder="Qty" value={item.quantity} onChange={e => {
                             const q = parseInt(e.target.value) || 0;
                             const newItems = [...(editingQuote.items || [])];
                             newItems[idx] = { ...item, quantity: q, total: Math.max(item.unitPrice * q - item.discount, 0) };
                             setEditingQuote({ ...editingQuote, items: newItems });
                           }} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none" />
                           <input type="number" step="0.01" placeholder="Price" value={item.unitPrice} onChange={e => {
                             const p = parseFloat(e.target.value) || 0;
                             const newItems = [...(editingQuote.items || [])];
                             newItems[idx] = { ...item, unitPrice: p, total: Math.max(p * item.quantity - item.discount, 0) };
                             setEditingQuote({ ...editingQuote, items: newItems });
                           }} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none" />
                           <input type="number" step="0.01" min="0" placeholder="Discount" value={item.discount} onChange={e => {
                             const discount = parseFloat(e.target.value) || 0;
                             const newItems = [...(editingQuote.items || [])];
                             newItems[idx] = { ...item, discount, total: Math.max(item.unitPrice * item.quantity - discount, 0) };
                             setEditingQuote({ ...editingQuote, items: newItems });
                           }} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none" />
                           <div className="flex items-center px-2 py-1.5 bg-slate-100 dark:bg-white/10 rounded text-xs font-medium text-slate-800 dark:text-slate-200">
                              ${item.total.toLocaleString()}
                           </div>
                         </div>
                      </div>
                      <button type="button" onClick={() => {
                        const newItems = [...(editingQuote.items || [])];
                        newItems.splice(idx, 1);
                        setEditingQuote({ ...editingQuote, items: newItems });
                      }} className="mt-1 text-slate-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {(!editingQuote?.items || editingQuote.items.length === 0) && (
                    <div className="text-center py-6 text-sm text-slate-500 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10">
                      No items added to quote.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Additional Fees</label>
                  <button type="button" onClick={() => {
                    const newFees = [...(editingQuote?.feeLines || []), { name: '', amount: 0 }];
                    setEditingQuote({ ...editingQuote, feeLines: newFees });
                  }} className="text-xs text-blue-600 hover:text-blue-500 font-medium">
                    + Add Fee
                  </button>
                </div>
                <div className="space-y-3">
                  {editingQuote?.feeLines?.map((fee, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input type="text" placeholder="Fee Description (e.g. Shipping)" value={fee.name} onChange={e => {
                        const newFees = [...(editingQuote.feeLines || [])];
                        newFees[idx].name = e.target.value;
                        setEditingQuote({ ...editingQuote, feeLines: newFees });
                      }} className="flex-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 outline-none" />
                      <div className="relative w-32 shrink-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                        <input type="number" step="0.01" value={fee.amount} onChange={e => {
                          const newFees = [...(editingQuote.feeLines || [])];
                          newFees[idx].amount = parseFloat(e.target.value) || 0;
                          setEditingQuote({ ...editingQuote, feeLines: newFees });
                        }} className="w-full pl-6 pr-3 py-1.5 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded text-sm text-slate-800 dark:text-slate-200 outline-none" />
                      </div>
                      <button type="button" onClick={() => {
                        const newFees = [...(editingQuote.feeLines || [])];
                        newFees.splice(idx, 1);
                        setEditingQuote({ ...editingQuote, feeLines: newFees });
                      }} className="p-1.5 text-slate-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Payment Terms</label>
                  <select value={editingQuote?.paymentTerms || ''} onChange={e => setEditingQuote({ ...editingQuote, paymentTerms: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none">
                    <option value="">Select terms...</option>
                    <option value="Net 15">Net 15</option>
                    <option value="Net 30">Net 30</option>
                    <option value="Net 60">Net 60</option>
                    <option value="Due on Receipt">Due on Receipt</option>
                    <option value="50% Deposit">50% Deposit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                  <textarea rows={1} value={editingQuote?.notes || ''} onChange={e => setEditingQuote({ ...editingQuote, notes: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none" />
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-white/10 pt-4 font-mono text-sm">
                 <div className="flex justify-between text-slate-600 dark:text-slate-400 mb-1">
                   <span>Subtotal:</span>
                   <span>${editingQuote?.items?.reduce((acc, it) => acc + (it.unitPrice * it.quantity), 0).toLocaleString() || '0'}</span>
                 </div>
                 {editingQuote?.feeLines?.map((fee, idx) => (
                   <div key={idx} className="flex justify-between text-slate-600 dark:text-slate-400 mb-1">
                     <span>{fee.name || 'Fee'}:</span>
                     <span>${fee.amount.toLocaleString()}</span>
                   </div>
                 ))}
                 <div className="flex justify-between font-semibold text-lg text-slate-900 dark:text-white mt-2">
                   <span>Total:</span>
                   <span>${(
                     (editingQuote?.items?.reduce((acc, it) => acc + (it.unitPrice * it.quantity), 0) || 0) + 
                     (editingQuote?.feeLines?.reduce((acc, fee) => acc + fee.amount, 0) || 0)
                   ).toLocaleString()}</span>
                 </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setIsQuoteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors">Cancel</button>
                <button type="submit" onClick={() => {
                  setEditingQuote(prev => prev ? { ...prev, ...calculateQuoteTotals(prev) } : null);
                }} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm">Save Quote</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMediaPickerOpen && (
        <MediaLibraryModal 
          onClose={() => setIsMediaPickerOpen(false)} 
          onSelect={(media) => {
            if (media.type === 'image') {
              setEditingProduct(prev => prev ? { ...prev, image: media.url } : null);
              setIsMediaPickerOpen(false);
            } else {
              alert('Please select an image file.');
            }
          }} 
        />
      )}

      {/* Delete Confirmation Modals */}
      <ConfirmModal
        isOpen={deletingProductId !== null}
        title="Delete Product"
        message="Are you sure you want to delete this product? This action cannot be undone."
        onConfirm={confirmDeleteProduct}
        onCancel={() => setDeletingProductId(null)}
      />

      <ConfirmModal
        isOpen={deletingQuoteId !== null}
        title="Delete Quote"
        message="Are you sure you want to delete this quote? This action cannot be undone."
        onConfirm={confirmDeleteQuote}
        onCancel={() => setDeletingQuoteId(null)}
      />
    </div>
  );
}
