import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, Image as ImageIcon, Video, File, Trash2, Search, Film, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../Layout';
import { useLanguage } from '../i18n';
import { MediaItem, getMedias, addMedia, deleteMedia } from '../services/media';

interface UploadTask {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  file: File;
}

export default function Media() {
  const { t } = useLanguage();
  const [medias, setMedias] = useState<MediaItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [isUploadDragging, setIsUploadDragging] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const loadMedias = async () => {
    setIsLoading(true);
    try {
      const data = await getMedias();
      setMedias(data);
    } catch (e) {
      console.error('Failed to load media', e);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadMedias();
  }, []);

  const handleFiles = async (files: FileList | File[]) => {
    const newTasks: UploadTask[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'pending',
      file
    }));
    
    setUploadTasks(prev => [...prev, ...newTasks]);
    
    // Process queue sequentially
    for (const task of newTasks) {
      await processUploadTask(task);
    }
  };

  const processUploadTask = async (task: UploadTask) => {
    setUploadTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'uploading' } : t));
    
    return new Promise<void>((resolve) => {
      const typeStr = task.file.type.split('/')[0];
      const type = typeStr === 'image' ? 'image' : typeStr === 'video' ? 'video' : 'file';
      
      const reader = new FileReader();
      
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: progress === 100 ? 99 : progress } : t));
        }
      };
      
      reader.onload = async (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          const item: MediaItem = {
            id: `media_${Math.random().toString(36).substr(2, 9)}`,
            name: task.file.name,
            type,
            url: e.target.result,
            size: task.file.size,
            createdAt: new Date().toISOString()
          };
          await addMedia(item);
          setMedias(prev => [item, ...prev]);
          setUploadTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: 100, status: 'completed' } : t));
          resolve();
        } else {
          setUploadTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'error' } : t));
          resolve();
        }
      };
      
      reader.onerror = () => {
        setUploadTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'error' } : t));
        resolve();
      };
      
      setTimeout(() => {
        reader.readAsDataURL(task.file);
      }, 100); // small delay to make the uploading state visible
    });
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setIsUploadModalOpen(true);
      handleFiles(e.dataTransfer.files);
    }
  };

  const onUploadModalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsUploadDragging(true);
  };

  const onUploadModalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsUploadDragging(false);
  };

  const onUploadModalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsUploadDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteMedia(id);
    setMedias(prev => prev.filter(m => m.id !== id));
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredMedias = medias.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="p-4 md:p-8 h-full flex flex-col gap-6 w-full relative">
      <div className="flex flex-col gap-6 md:flex-row md:items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Media Library</h1>
          <p className="text-slate-400 dark:text-slate-500 mt-1 text-sm font-light">Upload, view, and manage all your assets</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm"
          >
            <UploadCloud className="w-4 h-4" />
            Upload Asset
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm relative">
        <div className="p-4 border-b border-slate-200 dark:border-white/10 shrink-0">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div 
          className={cn(
             "overflow-auto flex-1 p-6 relative transition-colors duration-200",
             isDragging ? "bg-blue-50/50 dark:bg-blue-500/5" : ""
          )}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {isDragging && (
            <div className="absolute inset-4 z-10 border-2 border-blue-500 border-dashed bg-blue-500/10 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <div className="text-center p-6 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-blue-200 dark:border-blue-500/20 pointer-events-none">
                <UploadCloud className="w-12 h-12 text-blue-500 mx-auto mb-3" />
                <p className="text-lg font-medium text-slate-900 dark:text-white mb-1">Drop files to upload</p>
              </div>
            </div>
          )}

          {isLoading ? (
             <div className="h-full flex items-center justify-center text-slate-400">Loading library...</div>
          ) : filteredMedias.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
               <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4 border border-slate-200 dark:border-white/10">
                 <Film className="w-8 h-8 text-slate-400" />
               </div>
               <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Your library is empty</h3>
               <p className="text-sm max-w-sm mb-6">Drag and drop images, videos, or documents here, or click to browse.</p>
             </div>
          ) : (
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
               {filteredMedias.map(media => (
                 <div key={media.id} className="group flex flex-col bg-slate-50 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 hover:border-blue-500 dark:hover:border-blue-500 transition-colors shadow-sm">
                   <div className="aspect-square relative bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden">
                      {media.type === 'image' ? (
                        <img src={media.url} alt={media.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : media.type === 'video' ? (
                        <video src={media.url} controls className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <File className="w-12 h-12 text-slate-400 group-hover:scale-110 transition-transform duration-300" />
                      )}
                      
                      {media.type === 'video' && !media.url.includes('blob') && (
                         <div className="absolute top-2 right-2 bg-black/60 text-white px-2 py-1 rounded-md text-[10px] font-medium backdrop-blur-sm pointer-events-none">
                           VIDEO
                         </div>
                      )}
                   </div>
                   <div className="p-3 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 flex-1 flex flex-col justify-between">
                     <p className="text-sm font-medium text-slate-900 dark:text-white truncate" title={media.name}>{media.name}</p>
                     <div className="flex justify-between items-center mt-2">
                       <p className="text-xs text-slate-500">{formatSize(media.size)}</p>
                       <button onClick={(e) => handleDelete(e, media.id)} className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-slate-100 dark:bg-white/5 rounded">
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                     </div>
                   </div>
                 </div>
               ))}
             </div>
          )}
        </div>
      </div>

      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col border border-slate-200 dark:border-white/10 overflow-hidden relative">
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-200 dark:border-white/10 shrink-0">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Upload Assets</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Drag and drop files to upload to your library.</p>
              </div>
              <button onClick={() => setIsUploadModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-white/5">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto flex flex-col relative w-full h-full p-6">
              <div 
                className={cn("w-full shrink-0 flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-2xl transition-colors cursor-pointer",
                  isUploadDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
                onDragOver={onUploadModalDragOver}
                onDragLeave={onUploadModalDragLeave}
                onDrop={onUploadModalDrop}
                onClick={() => uploadInputRef.current?.click()}
              >
                <UploadCloud className={cn("w-12 h-12 mb-4", isUploadDragging ? "text-blue-500" : "text-slate-400")} />
                <p className="text-slate-700 dark:text-slate-300 font-medium mb-1">Click or drag files to this area to upload</p>
                <p className="text-slate-500 text-sm">Supports images, videos, and documents.</p>
                <input 
                  type="file" 
                  multiple 
                  className="hidden" 
                  ref={uploadInputRef} 
                  onChange={e => e.target.files && handleFiles(e.target.files)} 
                  accept="image/*,video/*,application/pdf" 
                />
              </div>

              {uploadTasks.length > 0 && (
                <div className="mt-8 flex-1 w-full">
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-4">Uploading ({uploadTasks.filter(t => t.status === 'completed').length}/{uploadTasks.length})</h3>
                  <div className="space-y-3">
                    {uploadTasks.map(task => (
                      <div key={task.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl p-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 w-1/3 min-w-0">
                          <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-900 flex items-center justify-center shrink-0">
                            {task.file.type.startsWith('image') ? <ImageIcon className="w-4 h-4 text-slate-500" /> : task.file.type.startsWith('video') ? <Video className="w-4 h-4 text-slate-500" /> : <File className="w-4 h-4 text-slate-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{task.name}</p>
                            <p className="text-xs text-slate-500">{formatSize(task.size)}</p>
                          </div>
                        </div>
                        <div className="flex-1 max-w-[200px]">
                          {task.status === 'uploading' ? (
                            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${task.progress}%` }}></div>
                            </div>
                          ) : task.status === 'completed' ? (
                            <div className="flex items-center justify-end w-full text-green-500">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                          ) : task.status === 'error' ? (
                            <div className="flex items-center justify-end w-full text-red-500">
                              <AlertCircle className="w-5 h-5" />
                            </div>
                          ) : (
                            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5"></div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 md:p-6 border-t border-slate-200 dark:border-white/10 flex justify-end gap-3 shrink-0">
               <button onClick={() => setIsUploadModalOpen(false)} className="px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 rounded-lg transition-colors">
                 {uploadTasks.some(t => t.status === 'uploading') ? 'Close (continuing in background)' : uploadTasks.length > 0 ? 'Done' : 'Cancel'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
