import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageCircle, Search, Bot, Send, CornerDownRight, Loader2, User, X, Paperclip, Sparkles, Clock, Calendar } from 'lucide-react';
import { cn } from '../Layout';
import { useLanguage } from '../i18n';
import { fetchClients, sendMessage, WaClient } from '../services/waHub';
import { fetchEmails, sendEmail } from '../services/emailSync';
import { getInboxMessages, addDraftToThread, markMessageRead, MessagePreview, ThreadMessage, saveInboxMessages, getCustomers, Customer, updateInboxMessage, Attachment, UniversalComment, getCurrentUser } from '../services/db';
import { CommentSection } from '../components/CommentSection';

export default function Inbox() {
  const { t } = useLanguage();
  const [waClients, setWaClients] = useState<WaClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [replyText, setReplyText] = useState('');
  const [replyTo, setReplyTo] = useState<string[]>([]);
  const [replyCc, setReplyCc] = useState<string[]>([]);
  const [replyBcc, setReplyBcc] = useState<string[]>([]);
  const [replyShowCc, setReplyShowCc] = useState(false);
  const [replyShowBcc, setReplyShowBcc] = useState(false);

  const [composeScheduleDate, setComposeScheduleDate] = useState('');
  const [composeScheduleTime, setComposeScheduleTime] = useState('');
  const [showComposeSchedule, setShowComposeSchedule] = useState(false);

  const [replyScheduleDate, setReplyScheduleDate] = useState('');
  const [replyScheduleTime, setReplyScheduleTime] = useState('');
  const [showReplySchedule, setShowReplySchedule] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAIGenerateSubject = () => {
    if (!composeBody.trim()) {
      alert("Please enter some message content first.");
      return;
    }
    setComposeSubject(`Re: ` + composeBody.substring(0, 30) + (composeBody.length > 30 ? '...' : ''));
  };

  const handleAIGenerateBody = () => {
    if (!composeSubject && !composeTo.length) {
      setComposeBody("Hi,\n\nI hope this email finds you well.\n\nBest regards,\nSales Team");
      return;
    }
    setComposeBody(`Hi ${composeTo.length > 0 ? composeTo[0].split('<')[0].trim() : 'there'},\n\nRegarding: ${composeSubject || 'our recent discussion'}\n${composeBody ? '\n' + composeBody + '\n' : ''}\nPlease let me know if you need any further information.\n\nBest regards,\nSales Team\n`);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
       const newFiles = Array.from(e.target.files).map(f => ({ name: f.name, size: f.size }));
       setComposeAttachments(prev => [...prev, ...newFiles]);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [messages, setMessages] = useState<MessagePreview[]>([]);
  const [activeMessageId, setActiveMessageId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeTab, setActiveTab] = useState<'inbox' | 'compose'>('inbox');
  const [composeTo, setComposeTo] = useState<string[]>([]);
  const [composeCc, setComposeCc] = useState<string[]>([]);
  const [composeBcc, setComposeBcc] = useState<string[]>([]);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [composeAttachments, setComposeAttachments] = useState<{name: string, size: number}[]>([]);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);

  useEffect(() => {
    fetchClients().then(clients => {
      setWaClients(clients);
      const onlineClient = clients.find(c => c.status === 'online');
      if (onlineClient) setSelectedClientId(onlineClient.id);
      else if (clients.length > 0) setSelectedClientId(clients[0].id);
    }).catch(console.error);

    const initialMessages = getInboxMessages();
    setMessages(initialMessages);
    if (initialMessages.length > 0) {
      setActiveMessageId(initialMessages[0].id);
    }
    
    setCustomers(getCustomers());
  }, []);

  const activeMessage = messages.find(m => m.id === activeMessageId) || messages[0] || null;

  // Load draft when switching messages
  useEffect(() => {
    setReplyText(drafts[activeMessageId] || '');
    if (activeMessage && activeMessage.channel === 'Email') {
      const emailToUse = activeMessage.userId ? customers.find(c => c.id === activeMessage.userId)?.contacts?.find(c => c.type === 'Email')?.value || activeMessage.target : activeMessage.target;
      setReplyTo(emailToUse ? [emailToUse] : []);
      setReplyCc([]);
      setReplyBcc([]);
      setReplyShowCc(false);
      setReplyShowBcc(false);
      setReplyScheduleDate('');
      setReplyScheduleTime('');
      setShowReplySchedule(false);
    } else {
      setReplyScheduleDate('');
      setReplyScheduleTime('');
      setShowReplySchedule(false);
    }
  }, [activeMessageId]);

  // Scroll to bottom when thread changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeMessage?.thread]);

  const setScheduleDefaults = () => {
    setReplyScheduleDate('');
    setReplyScheduleTime('');
    setShowReplySchedule(false);
  };

  const handleSend = async () => {
    if (!replyText.trim() || !activeMessage) return;
    setIsSending(true);

    const isScheduled = showReplySchedule && replyScheduleDate && replyScheduleTime;

    try {
      if (isScheduled) {
        await new Promise(r => setTimeout(r, 800)); // simulate
        alert(`Reply scheduled for ${replyScheduleDate} ${replyScheduleTime}`);
        setIsSending(false);
        setReplyText('');
        setScheduleDefaults();
        return;
      }

      if (activeMessage.channel === 'WhatsApp') {
        await sendMessage(activeMessage.target, replyText, selectedClientId);
      } else {
        await sendEmail(replyTo.length > 0 ? replyTo[0] : activeMessage.target, activeMessage.sender, `Re: ${activeMessage.subject}`, replyText);
      }

      addDraftToThread(activeMessage.id, replyText);
      setMessages(getInboxMessages());

      setReplyText('');
      setDrafts(prev => {
        const newDrafts = { ...prev };
        delete newDrafts[activeMessage.id];
        return newDrafts;
      });
      setScheduleDefaults();
    } catch (e: any) {
      alert(`Error sending: ${e.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleAddComment = (content: string, attachments: Attachment[], parentId?: string) => {
    if (!activeMessage) return;
    const currentUser = getCurrentUser();
    
    const newComment: UniversalComment = {
      id: Math.random().toString(36).substr(2, 9),
      authorId: currentUser.id,
      authorName: currentUser.name,
      content,
      createdAt: new Date().toISOString(),
      attachments,
      replies: []
    };

    let newComments = [...(activeMessage.comments || [])];
    if (parentId) {
      const addReply = (commentsList: UniversalComment[]): boolean => {
        for (let c of commentsList) {
          if (c.id === parentId) {
            c.replies = [...(c.replies || []), newComment];
            return true;
          }
          if (c.replies && addReply(c.replies)) {
            return true;
          }
        }
        return false;
      };
      addReply(newComments);
    } else {
      newComments.push(newComment);
    }

    updateInboxMessage(activeMessage.id, { comments: newComments });
    setMessages(getInboxMessages());
  };

  const activeMessageIdRef = useRef(activeMessageId);
  useEffect(() => {
    activeMessageIdRef.current = activeMessageId;
  }, [activeMessageId]);

  const handleDraftAIReply = async () => {
    if (!activeMessage) return;
    const msgId = activeMessage.id;
    setIsDrafting(true);
    // Don't clear to empty, instead clear current if it's the active one
    if (activeMessageIdRef.current === msgId) {
      setReplyText('');
    }
    
    try {
      const res = await fetch('/api/ai/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: activeMessage.summary, 
          intent: activeMessage.intent 
        })
      });
      const data = await res.json();
      const reply = data.reply || 'Failed to generate reply.';
      
      setDrafts(prev => ({ ...prev, [msgId]: reply }));
      if (activeMessageIdRef.current === msgId) {
        setReplyText(reply);
      }
    } catch(err) {
       console.error(err);
       const errorMsg = 'Error reaching AI endpoint.';
       setDrafts(prev => ({ ...prev, [msgId]: errorMsg }));
       if (activeMessageIdRef.current === msgId) {
         setReplyText(errorMsg);
       }
    } finally {
      setIsDrafting(false);
    }
  };

  const filteredMessages = messages.filter(msg => {
    const q = searchQuery.toLowerCase();
    return msg.subject.toLowerCase().includes(q) || 
           msg.summary.toLowerCase().includes(q) || 
           (msg.tags || []).some(t => t.toLowerCase().includes(q));
  });

  return (
    <div className="flex h-full flex-col lg:flex-row bg-white dark:bg-black/20">
      {/* List */}
      <div className="w-full lg:w-[400px] border-r border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 flex flex-col h-full shrink-0">
        <div className="p-6 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#050608]">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{t('inbox.title')}</h1>
          </div>
          <div className="flex bg-slate-200/50 dark:bg-white/5 p-1 rounded-lg mb-4">
            <button 
              onClick={() => setActiveTab('inbox')} 
              className={cn("flex-1 py-1.5 text-sm font-medium rounded-md transition-all", activeTab === 'inbox' ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white")}
            >
              {t('inbox.tab.inbox')}
            </button>
            <button 
              onClick={() => setActiveTab('compose')} 
              className={cn("flex-1 py-1.5 text-sm font-medium rounded-md transition-all", activeTab === 'compose' ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white")}
            >
              {t('inbox.tab.compose')}
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={t('inbox.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500/50 focus:bg-white dark:focus:bg-white/10 outline-none transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredMessages.map((msg) => (
            <div 
              key={msg.id} 
              onClick={() => {
                if (!msg.read) {
                  markMessageRead(msg.id);
                  setMessages(getInboxMessages());
                }
                setActiveMessageId(msg.id);
              }}
              className={cn("p-5 border-b border-slate-200 dark:border-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors relative", 
                            activeMessageId === msg.id && "bg-blue-50/50 dark:bg-white/[0.06]")}
            >
              {activeMessageId === msg.id && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
              )}
              {!msg.read && (
                <div className="absolute right-4 top-5 w-2 h-2 rounded-full bg-blue-500"></div>
              )}
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 max-w-[80%]">
                  {msg.channel === 'Email' ? <Mail className="w-4 h-4 text-slate-400" /> : <MessageCircle className="w-4 h-4 text-emerald-500" />}
                  <span className={cn("text-sm truncate", !msg.read ? "font-semibold text-slate-900 dark:text-white" : "font-medium text-slate-600 dark:text-slate-300")}>
                    {customers.find(c => c.contacts?.some(contact => contact.value.toLowerCase() === msg.sender.toLowerCase()))?.name || msg.sender}
                  </span>
                </div>
              </div>
              <h3 className={cn("text-sm line-clamp-1 mb-1.5", !msg.read ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-700 dark:text-slate-300")}>{msg.subject}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2">{msg.summary}</p>
              
              {msg.tags && msg.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {msg.tags.map(t => <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400">{t}</span>)}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20 rounded text-[10px] font-mono tracking-widest uppercase">{msg.intent}</span>
                  {msg.assignee && (
                    <span className="px-2 py-1 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 rounded text-[10px] font-mono">{msg.assignee.split(' ')[0]}</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-slate-400">{msg.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail View / Compose View */}
      <div className="flex-1 bg-white dark:bg-[#050608] flex flex-col h-full min-w-0">
        {activeTab === 'compose' ? (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Compose Mail</h2>
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-4">
                  <label className="w-16 shrink-0 mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">To</label>
                  <div className="flex-1">
                    <TaggedEmailInput value={composeTo} onChange={setComposeTo} customers={customers} placeholder="Type @name or email..." />
                  </div>
                  <div className="flex gap-2 shrink-0 mt-2">
                    <button className={cn("text-xs font-medium hover:text-blue-500", showCc ? "text-blue-500" : "text-slate-500 dark:text-slate-400")} onClick={() => setShowCc(!showCc)}>Cc</button>
                    <button className={cn("text-xs font-medium hover:text-blue-500", showBcc ? "text-blue-500" : "text-slate-500 dark:text-slate-400")} onClick={() => setShowBcc(!showBcc)}>Bcc</button>
                  </div>
                </div>
                {showCc && (
                  <div className="flex items-start gap-4">
                    <label className="w-16 shrink-0 mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">Cc</label>
                    <div className="flex-1">
                      <TaggedEmailInput value={composeCc} onChange={setComposeCc} customers={customers} placeholder="Type @name or email..." />
                    </div>
                    <div className="w-[52px]"></div>
                  </div>
                )}
                {showBcc && (
                  <div className="flex items-start gap-4">
                    <label className="w-16 shrink-0 mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">Bcc</label>
                    <div className="flex-1">
                      <TaggedEmailInput value={composeBcc} onChange={setComposeBcc} customers={customers} placeholder="Type @name or email..." />
                    </div>
                    <div className="w-[52px]"></div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <label className="w-16 shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">Subject</label>
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={composeSubject}
                    onChange={e => setComposeSubject(e.target.value)}
                    placeholder="Email Subject"
                    className="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                  />
                  <button 
                    onClick={handleAIGenerateSubject}
                    title="Generate Subject"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-full transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                </div>
                <div className="w-[52px]"></div>
              </div>
              <div className="flex-1 flex flex-col min-h-[300px] mt-4 relative">
                 <button 
                    onClick={handleAIGenerateBody}
                    title="Generate Content"
                    className="absolute top-3 right-3 p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors z-10 shadow-sm border border-blue-200 dark:border-blue-800"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                <textarea 
                  value={composeBody}
                  onChange={e => setComposeBody(e.target.value)}
                  className="flex-1 w-full px-4 py-3 pb-16 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none resize-none"
                  placeholder="Type your message here..."
                ></textarea>
                
                {/* Attachments Area */}
                {composeAttachments.length > 0 && (
                  <div className="absolute bottom-16 left-4 right-4 flex flex-wrap gap-2">
                    {composeAttachments.map((file, idx) => (
                      <span key={idx} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs shadow-sm">
                        <Paperclip className="w-3 h-3 text-slate-400" />
                        <span className="max-w-[120px] truncate">{file.name}</span>
                        <span className="text-slate-400 text-[10px]">({Math.round(file.size/1024)}kb)</span>
                        <button onClick={() => setComposeAttachments(composeAttachments.filter((_, i) => i !== idx))} className="ml-1 text-slate-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                
                <div className="absolute bottom-3 left-3">
                   <button 
                     onClick={() => fileInputRef.current?.click()}
                     className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                     title="Attach File"
                   >
                     <Paperclip className="w-5 h-5" />
                   </button>
                   <input 
                     type="file" 
                     multiple 
                     className="hidden" 
                     ref={fileInputRef} 
                     onChange={handleFileSelect} 
                   />
                </div>
              </div>
              <div className="pt-4 flex justify-between items-center border-t border-slate-200 dark:border-white/10 mt-6">
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setShowComposeSchedule(!showComposeSchedule)}
                    className={cn("p-2 rounded-lg transition-colors", showComposeSchedule ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5")}
                    title="Schedule Send"
                  >
                    <Calendar className="w-5 h-5" />
                  </button>
                  {showComposeSchedule && (
                    <div className="flex gap-2">
                       <input type="date" value={composeScheduleDate} onChange={e => setComposeScheduleDate(e.target.value)} className="px-3 py-1.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200" />
                       <input type="time" value={composeScheduleTime} onChange={e => setComposeScheduleTime(e.target.value)} className="px-3 py-1.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200" />
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setComposeTo([]);
                      setComposeCc([]);
                      setComposeBcc([]);
                      setComposeSubject('');
                      setComposeBody('');
                      setComposeAttachments([]);
                      setComposeScheduleDate('');
                      setComposeScheduleTime('');
                      setShowComposeSchedule(false);
                    }}
                    className="px-6 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors border border-transparent"
                  >
                    Clear
                  </button>
                  <button 
                    onClick={() => {
                       const isScheduled = showComposeSchedule && composeScheduleDate && composeScheduleTime;
                       if (isScheduled) {
                         alert(`Message scheduled for ${composeScheduleDate} ${composeScheduleTime}`);
                       }
                       setComposeTo([]);
                       setComposeCc([]);
                       setComposeBcc([]);
                       setComposeSubject('');
                       setComposeBody('');
                       setComposeAttachments([]);
                       setComposeScheduleDate('');
                       setComposeScheduleTime('');
                       setShowComposeSchedule(false);
                       setActiveTab('inbox');
                    }}
                    className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md transition-colors flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : activeMessage ? (
          <>
            {/* Detail Header */}
            <div className="p-6 border-b border-slate-200 dark:border-white/10 flex justify-between items-start shrink-0 bg-slate-50/50 dark:bg-black/20">
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight truncate">{activeMessage.subject}</h2>
                  <span className="px-2 py-1 bg-white dark:bg-white/10 shadow-sm border border-slate-200 dark:border-white/20 text-slate-700 dark:text-slate-300 rounded text-[10px] font-mono tracking-widest uppercase shrink-0">{activeMessage.intent}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>From:</span>
                  {(() => {
                    const c = customers.find(c => c.contacts?.some(contact => contact.value.toLowerCase() === activeMessage.sender.toLowerCase()));
                    return c ? (
                      <Link to={`/customers/${c.id}`} className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {c.name} <span className="text-slate-400 dark:text-slate-500 no-underline text-xs">({activeMessage.sender})</span>
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-800 dark:text-slate-200">{activeMessage.sender}</span>
                    )
                  })()}
                  {activeMessage.target && <span className="ml-2">To: <span className="font-medium text-slate-800 dark:text-slate-200">{activeMessage.target}</span></span>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  {(activeMessage.tags || []).map((tag, idx) => (
                    <span key={idx} className="px-2 py-1 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 rounded text-[10px] font-medium flex items-center gap-1">
                      {tag}
                      <button 
                        onClick={() => {
                          const newTags = activeMessage.tags?.filter((_, i) => i !== idx);
                          updateInboxMessage(activeMessage.id, { tags: newTags });
                          setMessages(getInboxMessages());
                        }}
                        className="hover:text-amber-500 ml-1"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  <input
                    placeholder="Add tag..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val && !(activeMessage.tags || []).includes(val)) {
                          const newTags = [...(activeMessage.tags || []), val];
                          updateInboxMessage(activeMessage.id, { tags: newTags });
                          setMessages(getInboxMessages());
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                    className="w-32 px-2 py-1 bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded text-[10px] outline-none focus:border-blue-500 transition-colors placeholder:text-slate-400 dark:text-slate-200"
                  />
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button 
                  onClick={() => setIsCommentsOpen(!isCommentsOpen)}
                  className={cn(
                    "px-3 py-2 border rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors",
                    isCommentsOpen 
                      ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                  )}
                >
                  <MessageCircle className="w-4 h-4" />
                  Internal ({activeMessage.comments?.length || 0})
                </button>
                {activeMessage.channel === 'WhatsApp' && waClients.length > 0 && (
                  <select 
                    value={selectedClientId} 
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg outline-none shadow-sm cursor-pointer"
                  >
                    {waClients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                    ))}
                  </select>
                )}
                <div className="relative">
                  <select 
                    value={activeMessage.assignee || ''}
                    onChange={(e) => {
                      const newAssignee = e.target.value;
                      const updatedMsgs = messages.map(m => 
                        m.id === activeMessage.id ? { ...m, assignee: newAssignee } : m
                      );
                      setMessages(updatedMsgs);
                      updateInboxMessage(activeMessage.id, { assignee: newAssignee });
                    }}
                    className="appearance-none pr-8 px-4 py-2 bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 border border-slate-200 dark:border-white/20 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer outline-none w-[160px]"
                  >
                    <option value="" disabled>{t('inbox.assign')}</option>
                    <option value="Alice Chen">Alice Chen (Sales)</option>
                    <option value="Bob Smith">Bob Smith (Sales)</option>
                    <option value="Charlie Davis">Charlie Davis (Support)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex">
              <div className="flex-1 flex flex-col min-w-0">
                {/* Conversation Area */}
                <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-6">
                  {activeMessage.thread.map((tMsg) => (
                    <div key={tMsg.id} className={cn("flex flex-col max-w-[85%]", tMsg.sender === 'agent' ? "ml-auto" : "")}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-slate-500">
                          {tMsg.sender === 'agent' ? 'You' : activeMessage.sender}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{tMsg.time}</span>
                      </div>
                      <div className={cn(
                        "p-4 rounded-2xl text-sm leading-relaxed",
                        tMsg.sender === 'agent' 
                          ? "bg-blue-600 text-white rounded-tr-sm" 
                          : "bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 rounded-tl-sm border border-slate-200 dark:border-white/5"
                      )}>
                        {tMsg.content.split('\n').map((line, i) => (
                          <span key={i}>{line}<br /></span>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  {/* AI Insights Card (injecting inline if latest message is from user) */}
                  {activeMessage.thread[activeMessage.thread.length - 1].sender === 'user' && (
                    <div className="max-w-[85%] mt-6">
                      <div className="bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/20 rounded-xl p-5 shadow-sm">
                        <h3 className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                          <Bot className="w-4 h-4 text-blue-500" />
                          {t('inbox.aiInsights')} & Options
                        </h3>
                        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                          <li className="flex gap-2">
                             <CornerDownRight className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                             <span>Intent analyzed as <strong className="font-semibold text-blue-600 dark:text-blue-300">{activeMessage.intent}</strong></span>
                          </li>
                          <li className="flex gap-2">
                             <CornerDownRight className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                             <span>Relevant snippet found in <strong className="font-mono text-xs">Pricing.pdf</strong>.</span>
                          </li>
                        </ul>
                        <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-500/10">
                          <button 
                            onClick={handleDraftAIReply}
                            disabled={isDrafting}
                            className="px-4 py-2 bg-white dark:bg-white/5 border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                          >
                             {isDrafting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                             {isDrafting ? 'Drafting...' : 'Draft AI Reply'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Reply Area */}
                <div className="p-4 md:p-6 border-t border-slate-200 dark:border-white/10 shrink-0 bg-slate-50 dark:bg-black/20">
                  <div className="bg-white dark:bg-white/5 shadow-sm border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden focus-within:border-blue-500/50 focus-within:shadow-[0_0_0_1px_rgba(59,130,246,0.3)] transition-all">
                    
                    {activeMessage.channel === 'Email' && (
                      <div className="border-b border-slate-200 dark:border-white/10 p-3 bg-slate-50/50 dark:bg-black/40 flex flex-col gap-2">
                        <div className="flex items-start gap-3">
                          <label className="text-xs font-semibold text-slate-500 w-8 mt-1.5 shrink-0">To:</label>
                          <div className="flex-1">
                            <TaggedEmailInput value={replyTo} onChange={setReplyTo} customers={customers} placeholder="Add recipient..." />
                          </div>
                          <div className="flex gap-2 text-xs shrink-0 mt-1.5">
                            <button className={cn("font-medium hover:text-blue-500", replyShowCc ? "text-blue-500" : "text-slate-500")} onClick={() => setReplyShowCc(!replyShowCc)}>Cc</button>
                            <button className={cn("font-medium hover:text-blue-500", replyShowBcc ? "text-blue-500" : "text-slate-500")} onClick={() => setReplyShowBcc(!replyShowBcc)}>Bcc</button>
                          </div>
                        </div>
                        {replyShowCc && (
                          <div className="flex items-start gap-3">
                            <label className="text-xs font-semibold text-slate-500 w-8 mt-1.5 shrink-0">Cc:</label>
                            <div className="flex-1">
                              <TaggedEmailInput value={replyCc} onChange={setReplyCc} customers={customers} placeholder="Add cc..." />
                            </div>
                            <div className="w-[52px]" />
                          </div>
                        )}
                        {replyShowBcc && (
                          <div className="flex items-start gap-3">
                            <label className="text-xs font-semibold text-slate-500 w-8 mt-1.5 shrink-0">Bcc:</label>
                            <div className="flex-1">
                              <TaggedEmailInput value={replyBcc} onChange={setReplyBcc} customers={customers} placeholder="Add bcc..." />
                            </div>
                            <div className="w-[52px]" />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="relative">
                      <button 
                        onClick={() => {
                           if (!activeMessage) return;
                           const threadCtx = activeMessage.thread?.map(m => m.content).join("\n") || "";
                           const promptText = `Please help draft a professional reply to the client based on this context: ${activeMessage.content}\n${threadCtx}\nDraft notes: ${replyText}`;
                           setReplyText(`Thank you for your message.\nRegarding your inquiry:\n${replyText ? 'Note: ' + replyText : 'We are looking into it.'}\nLet us know if you need anything else.\nBest,\nSupport Team`);
                        }}
                        title="AI Assist Generate Reply"
                        className="absolute right-3 top-3 p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors z-10 shadow-sm border border-blue-200 dark:border-blue-800"
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>
                      <textarea 
                        rows={4} 
                        value={replyText}
                        onChange={e => {
                          const text = e.target.value;
                          setReplyText(text);
                          if (activeMessage) {
                            setDrafts(prev => ({ ...prev, [activeMessage.id]: text }));
                          }
                        }}
                        className="w-full p-4 pr-14 text-sm bg-transparent outline-none resize-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-800 dark:text-slate-200"
                        placeholder={t('inbox.placeholder')}
                      />
                    </div>
                    <div className="bg-slate-50/50 dark:bg-black/40 p-3 px-4 flex justify-between items-center border-t border-slate-200 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        {activeMessage.channel === 'WhatsApp' ? (
                          <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
                            <MessageCircle className="w-4 h-4 text-emerald-500" />
                            Reply via WhatsApp
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
                            <Mail className="w-4 h-4 text-slate-400" />
                            Reply via Email
                          </span>
                        )}
                        <div className="h-4 w-px bg-slate-300 dark:bg-white/10 mx-2" />
                        <button
                          onClick={() => setShowReplySchedule(!showReplySchedule)}
                          className={cn("p-1.5 rounded transition-colors text-slate-500", showReplySchedule ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "hover:bg-slate-200 dark:hover:bg-white/10")}
                          title="Schedule Send"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                        {showReplySchedule && (
                          <div className="flex items-center gap-2">
                            <input type="date" value={replyScheduleDate} onChange={e => setReplyScheduleDate(e.target.value)} className="px-2 py-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded pt-0.5 pb-0.5 text-xs outline-none focus:border-blue-500" />
                            <input type="time" value={replyScheduleTime} onChange={e => setReplyScheduleTime(e.target.value)} className="px-2 py-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded pt-0.5 pb-0.5 text-xs outline-none focus:border-blue-500" />
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={handleSend}
                        disabled={isSending || !replyText.trim()}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
                      >
                        {isSending ? (
                          <span className="flex items-center gap-2">Sending...</span>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            {t('inbox.send')}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Internal Comments Sidebar */}
              {isCommentsOpen && (
                <div className="w-[350px] border-l border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 flex flex-col overflow-hidden shrink-0">
                  <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" /> Internal Discussion
                    </h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <CommentSection 
                      comments={activeMessage.comments || []}
                      onAddComment={handleAddComment}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Select a conversation to view details
          </div>
        )}
      </div>
    </div>
  );
}

function TaggedEmailInput({ 
  value, 
  onChange, 
  customers, 
  placeholder 
}: { 
  value: string[], 
  onChange: (val: string[]) => void, 
  customers: Customer[], 
  placeholder: string 
}) {
  const [inputVal, setInputVal] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCustomers = customers.filter(c => 
    inputVal.startsWith('@') && 
    c.name.toLowerCase().includes(inputVal.slice(1).toLowerCase())
  );

  useEffect(() => {
    if (inputVal.startsWith('@')) {
      setShowDropdown(true);
      setActiveIndex(0);
    } else {
      setShowDropdown(false);
    }
  }, [inputVal]);

  const handleAdd = (email: string) => {
    if (email && !value.includes(email)) {
      onChange([...value, email]);
    }
    setInputVal('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && filteredCustomers.length > 0) {
        const selected = filteredCustomers[activeIndex];
        const emailToUse = selected.contacts?.find(c => c.type === 'Email')?.value || `${selected.name.toLowerCase().replace(' ', '.')}@example.com`;
        handleAdd(`${selected.name} <${emailToUse}>`);
      } else if (inputVal.trim()) {
        handleAdd(inputVal.trim());
      }
    } else if (e.key === 'Backspace' && !inputVal) {
      if (value.length > 0) {
        onChange(value.slice(0, -1));
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (showDropdown) {
        setActiveIndex(prev => Math.min(prev + 1, filteredCustomers.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showDropdown) {
        setActiveIndex(prev => Math.max(prev - 1, 0));
      }
    }
  };

  return (
    <div className="relative w-full">
      <div className="flex flex-wrap gap-2 items-center w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus-within:border-blue-500 transition-colors cursor-text min-h-[42px]" onClick={() => inputRef.current?.focus()}>
        {value.map((tag, idx) => (
          <span key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded text-sm whitespace-nowrap">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((_, i) => i !== idx))} className="hover:text-blue-500 focus:outline-none">
               <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input 
          ref={inputRef}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-slate-900 dark:text-white"
        />
      </div>
      {showDropdown && filteredCustomers.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10 py-1">
          {filteredCustomers.map((c, idx) => {
            const emailToUse = c.contacts?.find(contact => contact.type === 'Email')?.value || `${c.name.toLowerCase().replace(' ', '.')}@example.com`;
            return (
              <div 
                key={c.id} 
                className={cn("px-4 py-2 cursor-pointer text-sm flex justify-between items-center group", activeIndex === idx ? "bg-slate-100 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700/50")}
                onClick={() => handleAdd(`${c.name} <${emailToUse}>`)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-slate-900 dark:text-white">{c.name}</span>
                  <span className="text-slate-500 text-xs">{emailToUse}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
