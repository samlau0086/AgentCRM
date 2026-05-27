import React, { useState } from 'react';
import { UniversalComment, Attachment, getCurrentUser } from '../services/db';
import { MessageSquare, Reply, Paperclip, MoreVertical, X, UploadCloud, File, Image as ImageIcon } from 'lucide-react';
import { cn } from '../Layout';

interface CommentSectionProps {
  comments: UniversalComment[];
  onAddComment: (content: string, attachments: Attachment[], parentId?: string) => void;
}

export function CommentSection({ comments, onAddComment }: CommentSectionProps) {
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined);
  
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {comments?.map(comment => (
          <CommentNode 
            key={comment.id} 
            comment={comment} 
            onReply={setReplyTo} 
            onAddComment={onAddComment}
          />
        ))}
        {(!comments || comments.length === 0) && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No comments yet.
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-white/10">
        <CommentInput 
          replyTo={replyTo} 
          onCancelReply={() => setReplyTo(undefined)}
          onSubmit={(content, attachments) => {
            onAddComment(content, attachments, replyTo);
            setReplyTo(undefined);
          }} 
        />
      </div>
    </div>
  );
}

function CommentNode({ comment, onReply, onAddComment }: { comment: UniversalComment, onReply: (id: string) => void, onAddComment: (content: string, attachments: Attachment[], parentId?: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0 text-sm">
          {comment.authorName.charAt(0)}
        </div>
        <div className="space-y-1.5 flex-1 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl rounded-tl-none relative group">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-900 dark:text-white text-sm">{comment.authorName}</span>
            <span className="text-xs text-slate-500">{new Date(comment.createdAt).toLocaleString()}</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{comment.content}</p>
          
          {comment.attachments && comment.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-white/10">
              {comment.attachments.map(att => (
                <AttachmentPreview key={att.id} attachment={att} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 mt-2">
            <button 
              onClick={() => onReply(comment.id)}
              className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors flex items-center gap-1"
            >
              <Reply className="w-3 h-3" /> Reply
            </button>
          </div>
        </div>
      </div>
      
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-12 pl-4 border-l-2 border-slate-200 dark:border-white/10 space-y-4">
          {comment.replies.map(reply => (
            <CommentNode 
              key={reply.id} 
              comment={reply} 
              onReply={onReply} 
              onAddComment={onAddComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.type.startsWith('image/');
  return (
    <div className="relative group overflow-hidden rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 shrink-0">
      {isImage ? (
        <a href={attachment.url} target="_blank" rel="noopener noreferrer">
          <img src={attachment.url} alt={attachment.name} className="h-20 w-auto max-w-[200px] object-cover" />
        </a>
      ) : (
        <div className="flex items-center gap-2 p-2 h-20 w-40">
          <File className="w-8 h-8 text-slate-400" />
          <div className="flex flex-col overflow-hidden">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{attachment.name}</span>
            <span className="text-[10px] text-slate-500">{(attachment.size / 1024).toFixed(1)} KB</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentInput({ replyTo, onCancelReply, onSubmit }: { replyTo?: string, onCancelReply: () => void, onSubmit: (content: string, attachments: Attachment[]) => void }) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const handleSubmit = () => {
    if (!content.trim() && attachments.length === 0) return;
    onSubmit(content, attachments);
    setContent('');
    setAttachments([]);
  };

  return (
    <div className="space-y-4">
      {replyTo && (
        <div className="flex items-center justify-between text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg">
          <span className="flex items-center gap-2"><Reply className="w-3 h-3" /> Replying to comment</span>
          <button onClick={onCancelReply} className="hover:text-amber-600"><X className="w-3 h-3" /></button>
        </div>
      )}
      
      <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 bg-white dark:bg-black/20 transition-all">
        <textarea 
          placeholder="Write a comment..."
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={3}
          className="w-full p-4 text-sm bg-transparent border-none outline-none resize-none text-slate-900 dark:text-white"
        />
        
        {attachments.length > 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {attachments.map(att => (
              <div key={att.id} className="relative">
                <AttachmentPreview attachment={att} />
                <button 
                  onClick={() => setAttachments(attachments.filter(a => a.id !== att.id))}
                  className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 border-2 border-white dark:border-slate-900 hover:bg-rose-600 shadow-sm"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between p-2 bg-slate-50 border-t border-slate-200 dark:bg-white/[0.02] dark:border-white/10">
          <button 
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleSubmit}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            Submit
          </button>
        </div>
      </div>

      {showUploadModal && (
        <UploadModal 
          onClose={() => setShowUploadModal(false)} 
          onUpload={(files) => {
            setAttachments([...attachments, ...files]);
            setShowUploadModal(false);
          }} 
        />
      )}
    </div>
  );
}

function UploadModal({ onClose, onUpload }: { onClose: () => void, onUpload: (files: Attachment[]) => void }) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = async (files: File[]) => {
    const newAttachments: Attachment[] = [];
    
    for (const file of files) {
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      
      newAttachments.push({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        url,
        type: file.type,
        size: file.size,
      });
    }

    onUpload(newAttachments);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-white/10">
          <h3 className="font-semibold text-slate-900 dark:text-white">Upload Files</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          <div 
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-colors relative",
              dragActive ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5"
            )}
          >
            <input 
              type="file" 
              multiple 
              onChange={handleChange} 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
            />
            <UploadCloud className="w-12 h-12 text-slate-400 mb-4" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Drag & drop files here</p>
            <p className="text-xs text-slate-500 mt-2">or click to browse from your computer</p>
          </div>
        </div>
      </div>
    </div>
  );
}
