import React, { useState, useEffect } from 'react';
import { Book, FileText, Upload, MoreVertical, RefreshCw, X, File, Plus } from 'lucide-react';
import { useLanguage } from '../i18n';
import ConfirmModal from '../components/ConfirmModal';
import { getDocuments, saveDocuments, deleteDocument, addDocument, Document } from '../services/db';

export default function KnowledgeBase() {
  const { t } = useLanguage();

  const [documents, setDocuments] = useState<Document[]>([]);

  useEffect(() => {
    setDocuments(getDocuments());
  }, []);

  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadProgress(10);
    
    try {
      // Simulate reading and call our vectorization ai endpoint
      setUploadProgress(30);
      const res = await fetch('/api/ai/vectorize-doc', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ filename: selectedFile.name, content: '' })
      });
      const data = await res.json();
      setUploadProgress(70);
      
      setTimeout(() => {
        setUploadProgress(100);
        setTimeout(() => {
          addDocument({
            title: selectedFile.name,
            pieces: data.pieces || Math.floor(Math.random() * 50) + 10,
            status: 'Active (Vectorized)',
            date: 'Just now',
          });
          
          setDocuments(getDocuments());
          setIsUploading(false);
          setSelectedFile(null);
          setUploadProgress(0);
        }, 300);
      }, 500);
    } catch(err) {
      console.error(err);
      alert('Failed to upload and vectorize');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = (id: string) => {
    setDeletingDocumentId(id);
  };

  const confirmDelete = () => {
    if (deletingDocumentId) {
      deleteDocument(deletingDocumentId);
      setDocuments(getDocuments());
      setDeletingDocumentId(null);
    }
  };

  const totalPieces = documents.reduce((sum, doc) => sum + doc.pieces, 0);

  return (
    <div className="p-4 md:p-8 h-full flex flex-col w-full">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">{t('kb.title')}</h1>
          <p className="text-slate-400 dark:text-slate-500 mt-1 text-sm font-light">{t('kb.subtitle')}</p>
        </div>
        <button 
          onClick={() => setIsUploading(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm"
        >
          <Upload className="w-4 h-4" />
          {t('kb.upload')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 flex-1 min-h-0">
        {/* Main List */}
        <div className="lg:col-span-3 bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-xl flex flex-col min-h-0 overflow-hidden">
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white dark:bg-black/40 border-b border-slate-200 dark:border-white/5 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400">{t('kb.table.title')}</th>
                  <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400">{t('kb.table.chunks')}</th>
                  <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400">{t('kb.table.status')}</th>
                  <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400">{t('kb.table.updated')}</th>
                  <th className="px-6 py-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg">
                          <FileText className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{doc.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">{doc.pieces}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded text-[9px] font-mono uppercase tracking-widest">{doc.status}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-light text-xs">{doc.date}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDelete(doc.id)} 
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {documents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      No documents in Knowledge Base. Click Upload to add one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6 relative overflow-hidden flex flex-col shadow-sm dark:shadow-none">
             <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
             <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-4">{t('kb.sync')}</h2>
             <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-light text-slate-900 dark:text-white">100<span className="text-sm ml-1 text-emerald-600 dark:text-emerald-400">%</span></p>
                  <p className="text-[10px] font-mono text-slate-500">{t('kb.uptodate')}</p>
                </div>
             </div>
             <p className="text-xs text-slate-500 font-light leading-relaxed">
               System is synced and vectorized. <strong className="text-slate-800 dark:text-slate-200">{totalPieces}</strong> knowledge fragments are indexing your business data.
             </p>
          </div>
        </div>
      </div>

      {isUploading && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-white/10 flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-white/5">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Upload to Knowledge Base
              </h2>
              <button 
                onClick={() => { setIsUploading(false); setSelectedFile(null); setUploadProgress(0); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {!selectedFile ? (
                <div className="border-2 border-dashed border-slate-300 dark:border-white/20 rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-500/10 transition-colors relative">
                  <input 
                    type="file" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                    onChange={handleFileChange}
                    accept=".pdf,.txt,.doc,.docx,.csv"
                  />
                  <div className="p-3 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-full mb-4">
                    <File className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">Click to upload or drag and drop</p>
                  <p className="text-xs text-slate-500">PDF, TXT, DOCX, CSV (max. 10MB)</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-black/20">
                    <div className="p-2 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{selectedFile.name}</p>
                      <p className="text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  
                  {uploadProgress > 0 && (
                    <div className="space-y-2">
                       <div className="flex justify-between text-xs font-mono">
                         <span className="text-slate-500">Processing & Vectorizing...</span>
                         <span className="text-blue-600 dark:text-blue-400">{uploadProgress}%</span>
                       </div>
                       <div className="h-2 w-full bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                         <div 
                           className="h-full bg-blue-600 rounded-full transition-all duration-200 ease-out" 
                           style={{ width: `${uploadProgress}%` }}
                         />
                       </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 flex justify-end gap-3 flex-shrink-0">
               <button 
                 onClick={() => { setIsUploading(false); setSelectedFile(null); setUploadProgress(0); }}
                 className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors border border-slate-300 dark:border-transparent"
               >
                 Cancel
               </button>
               <button 
                 onClick={handleUpload}
                 disabled={!selectedFile || uploadProgress > 0}
                 className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm"
               >
                 {uploadProgress > 0 ? 'Uploading...' : 'Confirm Upload'}
               </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deletingDocumentId !== null}
        title="Delete Document"
        message="Are you sure you want to delete this document? This action cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeletingDocumentId(null)}
      />
    </div>
  );
}
