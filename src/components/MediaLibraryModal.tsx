import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, UploadCloud, Image as ImageIcon, Video, File, Trash2, Check, Search } from 'lucide-react';
import { cn } from '../Layout';
import ConfirmModal from './ConfirmModal';
import { MediaItem, getMedias, addMedia, deleteMedia } from '../services/media';

interface MediaLibraryModalProps {
  onClose: () => void;
  onSelect?: (media: MediaItem) => void;
}

export default function MediaLibraryModal({ onClose, onSelect }: MediaLibraryModalProps) {
  const [medias, setMedias] = useState<MediaItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const typeStr = file.type.split('/')[0];
      const type = typeStr === 'image' ? 'image' : typeStr === 'video' ? 'video' : 'file';
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          const item: MediaItem = {
            id: `media_${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            type,
            url: e.target.result,
            size: file.size,
            createdAt: new Date().toISOString()
          };
          await addMedia(item);
          setMedias(prev => [item, ...prev]);
        }
      };
      reader.readAsDataURL(file);
    }
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
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
  };

  const confirmDelete = async () => {
    if (deletingId) {
      await deleteMedia(deletingId);
      setMedias(prev => prev.filter(m => m.id !== deletingId));
      setDeletingId(null);
    }
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
    <div className="fixed inset-0 z-50 flex justify-center items-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col border border-slate-200 dark:border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-200 dark:border-white/10 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Media Library</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Upload and manage your assets</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row gap-4 justify-between items-center shrink-0">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search media..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:border-blue-500 outline-none text-slate-900 dark:text-white"
              />
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <UploadCloud className="w-4 h-4" /> Upload Files
            </button>
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef} 
              onChange={e => e.target.files && handleFiles(e.target.files)} 
              accept="image/*,video/*,application/pdf" 
            />
          </div>

          {/* Grid Area with Dropzone */}
          <div 
            className={cn(
              "flex-1 overflow-auto p-4 md:p-6 transition-colors duration-200 relative",
              isDragging ? "bg-blue-50/50 dark:bg-blue-500/5" : ""
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {isDragging && (
              <div className="absolute inset-0 z-10 border-2 border-blue-500 border-dashed bg-blue-500/10 m-4 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <div className="text-center p-6 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-blue-200 dark:border-blue-500/20">
                  <UploadCloud className="w-12 h-12 text-blue-500 mx-auto mb-3" />
                  <p className="text-lg font-medium text-slate-900 dark:text-white mb-1">Drop files here</p>
                  <p className="text-sm text-slate-500">to upload them to the library</p>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="h-full flex items-center justify-center text-slate-400">Loading...</div>
            ) : filteredMedias.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                  <ImageIcon className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No media files</h3>
                <p className="text-sm max-w-sm mb-6">Upload images, videos, or documents to use them across your projects and products.</p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                >
                  Browse Files
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredMedias.map(media => (
                  <div 
                    key={media.id} 
                    className="group relative bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 transition-colors shadow-sm"
                    onClick={() => onSelect && onSelect(media)}
                  >
                    <div className="aspect-square bg-slate-100 dark:bg-slate-900 relative overflow-hidden flex items-center justify-center">
                      {media.type === 'image' ? (
                        <img src={media.url} alt={media.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : media.type === 'video' ? (
                        <video src={media.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" muted />
                      ) : (
                        <File className="w-8 h-8 text-slate-400" />
                      )}

                      {/* Video indicator */}
                      {media.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white">
                            <Video className="w-4 h-4" />
                          </div>
                        </div>
                      )}

                      {/* Selection Overlay */}
                      {onSelect && (
                        <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                          <span className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm">
                            Select
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-3">
                      <p className="text-xs font-medium text-slate-900 dark:text-white truncate" title={media.name}>{media.name}</p>
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-[10px] text-slate-500">{formatSize(media.size)}</p>
                        <button 
                          onClick={(e) => handleDeleteClick(e, media.id)}
                          className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
      <ConfirmModal
        isOpen={deletingId !== null}
        title="Delete Media"
        message="Are you sure you want to delete this media? This action cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
