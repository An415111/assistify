
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, MessageSquare, Calendar, ShieldAlert, 
  Send, Bot, Clock, CheckCircle2, AlertCircle, 
  Settings, Wifi, WifiOff, Globe, Loader2, LogOut, Menu, X, ChevronLeft,
  Activity, Zap, BarChart3, ArrowUpRight, BrainCircuit, Target, Check, Trash2, KeyRound, ExternalLink, Info, RefreshCw, Server, Sparkles, Rocket, Users,
  MessageCircle
} from 'lucide-react';
import { ChatSession, Message, ChatAction, Schedule, AIResponse } from './types';
import { analyzeMessage } from './services/geminiService';
import { getTelegramUpdates, sendTelegramMessage, TelegramUpdate, getBotInfo, clearWebhook, BotInfo, sanitizeToken } from './services/telegramService';

const App: React.FC = () => {
  // Persistence & Config
  const envToken = (process.env as any).TELEGRAM_BOT_TOKEN;
  const [botToken, setBotToken] = useState<string>(() => localStorage.getItem('tg_bot_token') || envToken || '');
  const [inputToken, setInputToken] = useState<string>(() => localStorage.getItem('tg_bot_token') || envToken || '');
  const [activeTab, setActiveTab] = useState<'live' | 'dashboard' | 'schedules' | 'help' | 'settings'>('live');
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  
  // App State
  const [sessions, setSessions] = useState<Record<string, ChatSession>>({});
  const [schedules, setSchedules] = useState<Schedule[]>(() => {
    const saved = localStorage.getItem('tg_schedules');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isTerminalError, setIsTerminalError] = useState(false);
  const [errorType, setErrorType] = useState<'TOKEN' | 'PROXY' | 'NETWORK' | null>(null);
  
  // Dashboard specific logs
  const [aiLogs, setAiLogs] = useState<{timestamp: number, chatName: string, action: string, reasoning: string}[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const lastUpdateIdRef = useRef<number>(0);
  const pollingTimeoutRef = useRef<number | null>(null);
  const backoffRef = useRef<number>(3000);
  const initRef = useRef<boolean>(false);

  const initBot = useCallback(async (token: string) => {
    if (!token || token.trim().length < 10) return;
    
    setIsConnecting(true);
    setLastError("Waking up engine...");
    initRef.current = false;

    try {
      const info = await getBotInfo(token);
      setBotInfo(info);
      
      // deleteWebhook is mandatory to receive messages via getUpdates
      // Some bots get "stuck" if a webhook was previously set by another app
      await clearWebhook(token); 
      
      setLastError(null);
      setErrorType(null);
      setIsTerminalError(false);
      setIsConnected(true);
      initRef.current = true;
    } catch (err: any) {
      console.error("Bot init failed:", err.message);
      setIsConnected(false);
      if (err.message.includes("TOKEN_INVALID")) {
        setIsTerminalError(true);
        setErrorType('TOKEN');
        setLastError("Access Denied: The Telegram API says this token is invalid.");
      } else {
        setLastError(err.message || "Connection failed. Retrying...");
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (botToken) {
      initBot(botToken);
    }
  }, [botToken, initBot]);

  useEffect(() => {
    if (botToken) localStorage.setItem('tg_bot_token', botToken);
    else localStorage.removeItem('tg_bot_token');
  }, [botToken]);

  useEffect(() => {
    localStorage.setItem('tg_schedules', JSON.stringify(schedules));
  }, [schedules]);

  const processUpdates = useCallback(async (updates: TelegramUpdate[]) => {
    if (updates.length === 0) return;

    for (const update of updates) {
      // Offset must always be the highest update_id + 1 to confirm messages
      if (update.update_id >= lastUpdateIdRef.current) {
        lastUpdateIdRef.current = update.update_id + 1;
      }

      const msg = update.message;
      if (!msg || !msg.text) continue;

      const chatId = msg.chat.id.toString();
      const userName = msg.from.username || msg.from.first_name || 'User';
      const text = msg.text;

      setSessions(prev => {
        const existing = prev[chatId] || {
          chat_id: chatId,
          user_name: userName,
          status: 'active',
          isBotEnabled: true,
          lastActivity: Date.now(),
          messages: []
        };

        const newMessage: Message = {
          id: msg.message_id.toString(),
          chat_id: chatId,
          user_name: userName,
          text: text,
          is_bot: false,
          timestamp: msg.date * 1000
        };

        // De-duplicate in case of proxy retry overlap
        if (existing.messages.some(m => m.id === newMessage.id)) return prev;

        const updatedSession = {
          ...existing,
          messages: [...existing.messages, newMessage],
          lastActivity: Date.now()
        };

        // Automated Logic Trigger
        if (updatedSession.isBotEnabled && updatedSession.status !== 'needs_help') {
          handleBotAutoReply(chatId, text, updatedSession.messages, userName);
        }

        return { ...prev, [chatId]: updatedSession };
      });
    }
  }, [botToken]); 

  // Polling Loop
  useEffect(() => {
    if (!botToken || botToken.trim() === '' || isTerminalError || !isConnected) {
      return;
    }

    const poll = async () => {
      // Critical: Don't start polling until webhook is confirmed clear
      if (!initRef.current) {
        pollingTimeoutRef.current = window.setTimeout(poll, 1000);
        return;
      }

      setIsPolling(true);
      try {
        const updates = await getTelegramUpdates(botToken, lastUpdateIdRef.current);
        if (updates.length > 0) {
          await processUpdates(updates);
        }
        setIsConnected(true);
        setLastError(null);
        setErrorType(null);
        backoffRef.current = 2000; // Reset backoff on success
      } catch (err: any) {
        console.warn("Sync warning:", err.message);
        
        if (err.message.includes("TOKEN_INVALID")) {
           setIsConnected(false);
           setIsPolling(false);
           setIsTerminalError(true);
           setErrorType('TOKEN');
           return; 
        } else if (err.message.includes("PROXY_BLOCKED")) {
           setErrorType('PROXY');
           backoffRef.current = 10000; 
        } else {
          // General connection failure - increase wait time
          backoffRef.current = Math.min(backoffRef.current * 1.5, 30000);
        }
      } finally {
        setIsPolling(false);
        pollingTimeoutRef.current = window.setTimeout(poll, backoffRef.current); 
      }
    };

    poll();
    return () => {
      if (pollingTimeoutRef.current) window.clearTimeout(pollingTimeoutRef.current);
    };
  }, [botToken, processUpdates, isTerminalError, isConnected]);

  const handleBotAutoReply = async (chatId: string, userText: string, history: Message[], userName: string) => {
    try {
      const historyText = history.slice(-5).map(m => `${m.user_name}: ${m.text}`).join('\n');
      const aiRes = await analyzeMessage(userText, historyText);

      setAiLogs(prev => [{
        timestamp: Date.now(),
        chatName: userName,
        action: aiRes.action,
        reasoning: aiRes.reasoning || 'No explanation provided.'
      }, ...prev].slice(0, 50));

      const sent = await sendTelegramMessage(botToken, chatId, aiRes.reply_text);
      if (sent) {
        setSessions(prev => {
          const session = prev[chatId];
          if (!session) return prev;
          const botMsg: Message = {
            id: 'bot-' + Date.now(),
            chat_id: chatId,
            user_name: 'Bot',
            text: aiRes.reply_text,
            is_bot: true,
            action: aiRes.action,
            timestamp: Date.now()
          };
          let newStatus = session.status;
          let botEnabled = session.isBotEnabled;
          if (aiRes.action === ChatAction.SCHEDULE) {
            const proposedTime = aiRes.schedule_times?.[0];
            const isValidDate = proposedTime && !isNaN(new Date(proposedTime).getTime());
            setSchedules(prevS => {
              if (prevS.some(s => s.chat_id === chatId && s.status === 'pending')) return prevS;
              return [...prevS, {
                id: Math.random().toString(36).substr(2, 9),
                chat_id: chatId,
                user_name: session.user_name,
                proposed_time: isValidDate ? proposedTime : new Date(Date.now() + 86400000).toISOString(),
                status: 'pending'
              }];
            });
          } else if (aiRes.action === ChatAction.HELP) {
            newStatus = 'needs_help';
            botEnabled = false;
          }
          return {
            ...prev,
            [chatId]: { ...session, status: newStatus, isBotEnabled: botEnabled, messages: [...session.messages, botMsg] }
          };
        });
      }
    } catch (e) { console.error("Auto-reply failed", e); }
  };

  const handleManualSend = async () => {
    if (!currentChatId || !inputText.trim() || !botToken) return;
    setIsSending(true);
    const success = await sendTelegramMessage(botToken, currentChatId, inputText);
    if (success) {
      const manualMsg: Message = {
        id: 'man-' + Date.now(),
        chat_id: currentChatId,
        user_name: 'Admin',
        text: inputText,
        is_bot: true,
        is_manual: true,
        timestamp: Date.now()
      };
      setSessions(prev => ({
        ...prev,
        [currentChatId]: { ...prev[currentChatId], messages: [...prev[currentChatId].messages, manualMsg] }
      }));
      setInputText('');
    } else {
      setLastError("Message failed. Possible gateway timeout.");
    }
    setIsSending(false);
  };

  const handleConnectClick = () => {
    const clean = sanitizeToken(inputToken);
    if (!clean || !clean.includes(':')) {
      setLastError("Format Error: Token must look like 12345:ABCDE...");
      setErrorType('TOKEN');
      setIsTerminalError(true);
      return;
    }
    setBotToken(clean);
  };

  const disconnectBot = () => {
    setBotToken('');
    setInputToken('');
    setBotInfo(null);
    initRef.current = false;
    localStorage.removeItem('tg_bot_token');
    setIsConnected(false);
    setIsTerminalError(false);
    setErrorType(null);
    setSessions({});
    setAiLogs([]);
    setCurrentChatId(null);
  };

  const handleForceRefresh = () => {
    if (botToken) {
      lastUpdateIdRef.current = 0; // Reset offset to get recent missed messages
      initBot(botToken);
    }
  };

  const toggleBot = (chatId: string) => {
    setSessions(prev => ({ ...prev, [chatId]: { ...prev[chatId], isBotEnabled: !prev[chatId].isBotEnabled } }));
  };

  const resolveHelp = (chatId: string) => {
    setSessions(prev => ({ ...prev, [chatId]: { ...prev[chatId], status: 'active', isBotEnabled: true } }));
  };

  const deleteSchedule = (id: string) => setSchedules(prev => prev.filter(s => s.id !== id));
  const toggleScheduleStatus = (id: string) => setSchedules(prev => prev.map(s => s.id === id ? { ...s, status: s.status === 'pending' ? 'done' : 'pending' } : s));

  const activeSession = currentChatId ? sessions[currentChatId] : null;
  const stats = useMemo(() => {
    const allSessions = Object.values(sessions) as ChatSession[];
    const allMessages = allSessions.flatMap(s => s.messages);
    return {
      totalMessages: allMessages.length,
      autoReplied: allMessages.filter(m => m.is_bot && !m.is_manual).length,
      helpNeeded: allSessions.filter(s => s.status === 'needs_help').length,
      pendingSchedules: schedules.filter(s => s.status === 'pending').length,
      activeChats: allSessions.length
    };
  }, [sessions, schedules]);

  const navToTab = (tab: typeof activeTab) => { setActiveTab(tab); setIsSidebarOpen(false); };
  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? "Upcoming" : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 relative">
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}

      <nav className={`
        fixed inset-y-0 left-0 w-64 bg-slate-900 text-white flex flex-col p-4 shadow-2xl z-40 transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0 shrink-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between mb-10 px-2">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
              <Globe size={24} className="text-white" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight block">Assistify</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Telegram Care</span>
            </div>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setIsSidebarOpen(false)}><X size={24} /></button>
        </div>
        
        <div className="flex flex-col gap-1 flex-1 overflow-y-auto custom-scrollbar">
          <NavItem active={activeTab === 'dashboard'} icon={<LayoutDashboard size={18} />} label="Overview" onClick={() => navToTab('dashboard')} />
          {/* Fix: Removed duplicate onClick attribute from line 368 */}
          <NavItem active={activeTab === 'live'} icon={<MessageSquare size={18} />} label="Live Inbox" badge={Object.keys(sessions).length > 0 ? Object.keys(sessions).length : undefined} badgeColor="bg-blue-600" onClick={() => navToTab('live')} />
          <div className="mt-6 mb-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Workflow</div>
          <NavItem 
            active={activeTab === 'help'} 
            icon={<ShieldAlert size={18} />} 
            label="Escalations" 
            badge={stats.helpNeeded > 0 ? stats.helpNeeded : undefined} 
            badgeColor="bg-red-500" 
            onClick={() => navToTab('help')} 
          />
          <NavItem active={activeTab === 'schedules'} icon={<Calendar size={18} />} label="Schedules" badge={stats.pendingSchedules > 0 ? stats.pendingSchedules : undefined} badgeColor="bg-emerald-500" onClick={() => navToTab('schedules')} />
          <div className="mt-6 mb-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">System</div>
          <NavItem active={activeTab === 'settings'} icon={<Settings size={18} />} label="Settings" onClick={() => navToTab('settings')} />
        </div>

        <div className="mt-auto pt-4 border-t border-slate-800 flex flex-col gap-3 px-2">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></div>
            <div className="text-xs">
              <p className="font-semibold text-slate-200">{isConnected ? 'Engine Live' : 'Offline'}</p>
              <p className="text-slate-500">{isPolling ? 'Syncing...' : 'Disconnected'}</p>
            </div>
          </div>
          {botToken && (
            <button onClick={disconnectBot} className="flex items-center gap-2 text-[10px] font-bold text-slate-500 hover:text-red-400 transition-colors uppercase tracking-widest">
              <LogOut size={12} /> Reset Connection
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        <header className="h-14 sm:h-16 bg-white border-b flex items-center justify-between px-4 sm:px-6 shrink-0 z-20">
          <div className="flex items-center gap-4">
            <button className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg" onClick={() => setIsSidebarOpen(true)}><Menu size={24} /></button>
            {botInfo && (
              <div className="flex items-center gap-2 sm:gap-3 bg-blue-50/50 px-3 py-1.5 rounded-full border border-blue-100 animate-in fade-in slide-in-from-left-2">
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] text-white font-black">@</div>
                <div className="hidden sm:block">
                  <span className="text-xs font-black text-slate-800">{botInfo.first_name}</span>
                  <span className="text-[10px] text-blue-500 ml-2 font-bold uppercase tracking-widest">@{botInfo.username}</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleForceRefresh}
              className={`p-2 rounded-lg transition-all ${isPolling ? 'animate-spin text-blue-500' : 'text-slate-400 hover:text-blue-500 hover:bg-blue-50'}`}
              title="Force Engine Refresh"
            >
              <RefreshCw size={18} />
            </button>
            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {isConnected ? 'Sync Active' : 'Offline'}
            </span>
          </div>
        </header>

        {lastError && !isTerminalError && (
          <div className="absolute top-20 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className={`border px-4 py-3 rounded-xl flex items-center gap-3 shadow-xl max-w-md ${errorType === 'PROXY' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              {errorType === 'PROXY' ? <Server size={20} className="shrink-0" /> : <AlertCircle size={20} className="shrink-0" />}
              <div className="text-sm">
                <p className="font-bold">{errorType === 'PROXY' ? 'Gateway Warning' : 'Sync Status'}</p>
                <p className="text-xs opacity-90">{lastError}</p>
              </div>
              <button onClick={() => setLastError(null)} className="ml-auto hover:opacity-70 font-black">×</button>
            </div>
          </div>
        )}

        {(!isConnected || isTerminalError) ? (
          <div className="flex-1 flex flex-col lg:flex-row items-center justify-center p-6 bg-slate-100/50 overflow-y-auto gap-8">
            <div className="max-w-md w-full bg-white p-6 sm:p-10 rounded-3xl shadow-2xl border border-slate-200 text-center animate-in zoom-in duration-500">
              <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-inner ${isTerminalError ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                {isTerminalError ? <ShieldAlert size={32} className="sm:size-10" /> : <KeyRound size={32} className="sm:size-10" />}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black mb-3 text-slate-800 tracking-tight">{isTerminalError ? 'Token Rejected' : 'Assistify'}</h2>
              <p className="text-slate-500 mb-6 sm:mb-8 text-sm leading-relaxed">
                {isTerminalError ? (
                  <>The Telegram API says this token is <b>invalid</b>. Ensure you copied it exactly from @BotFather and it hasn't been revoked.</>
                ) : "Enter your Telegram Bot API Token to begin automated care."}
              </p>
              <div className="space-y-6">
                <div className="text-left">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase ml-1 mb-2 tracking-widest">Bot API Token</label>
                  <input 
                    type="password" 
                    placeholder="123456789:ABCDefgh..." 
                    className={`w-full bg-slate-50 border rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm font-mono ${isTerminalError ? 'border-red-200' : 'border-slate-200'}`} 
                    onChange={(e) => { 
                      setInputToken(e.target.value); 
                      setIsTerminalError(false); 
                      setLastError(null); 
                      setErrorType(null); 
                    }} 
                    value={inputToken} 
                  />
                </div>
                <button 
                  onClick={handleConnectClick} 
                  disabled={isConnecting || !inputToken.trim()} 
                  className={`w-full text-white font-black py-4 rounded-2xl disabled:opacity-50 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 ${isTerminalError ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'}`}
                >
                  {isConnecting ? <Loader2 size={20} className="animate-spin" /> : <Zap size={20} />}
                  {isConnecting ? 'Verifying...' : isTerminalError ? 'Try New Token' : 'Connect Securely'}
                </button>
                <div className="flex flex-col gap-2">
                  <a href="https://t.me/botfather" target="_blank" className="text-[10px] text-blue-600 font-bold hover:underline flex items-center justify-center gap-1">Manage bots via @BotFather <ExternalLink size={10} /></a>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <div className="p-4 sm:p-8 lg:p-10 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
                <div className="max-w-7xl mx-auto space-y-8">
                  <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter">Performance Hub Hub</h1>
                      <p className="text-slate-500 font-medium flex items-center gap-2"><Activity size={16} className="text-blue-500" /> Neural Core Status: Stable</p>
                    </div>
                  </header>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    <StatCard title="Active Streams" value={stats.activeChats} icon={<Globe className="text-blue-600" />} subtitle="Total Sessions" color="blue" />
                    <StatCard title="Automation Rate" value={`${((stats.autoReplied/stats.totalMessages)*100 || 0).toFixed(0)}%`} icon={<BrainCircuit className="text-indigo-600" />} subtitle="Neural Resolution" color="indigo" />
                    <StatCard title="Priority Escapes" value={stats.helpNeeded} icon={<ShieldAlert className="text-red-600" />} subtitle="Escalations" color="red" />
                    <StatCard title="Retained Leads" value={stats.pendingSchedules} icon={<Target className="text-emerald-600" />} subtitle="Booked Actions" color="emerald" />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                    <div className="lg:col-span-2 bg-white rounded-[32px] p-6 sm:p-8 shadow-sm border border-slate-100 space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black text-slate-900 flex items-center gap-2"><BarChart3 className="text-blue-600" /> Recent Interaction</h3>
                        <button onClick={() => setActiveTab('live')} className="text-xs font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest flex items-center gap-1 group">Full Inbox <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" /></button>
                      </div>
                      <div className="space-y-4">
                        {(Object.values(sessions) as ChatSession[]).length === 0 ? (
                          <div className="p-10 text-center bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                             <p className="text-slate-400 font-bold text-sm">No neural interactions logged yet.</p>
                             <button onClick={handleForceRefresh} className="mt-4 text-[10px] font-black text-blue-500 uppercase flex items-center gap-2 mx-auto"><RefreshCw size={12} /> Sync missed messages</button>
                          </div>
                        ) : (
                          (Object.values(sessions) as ChatSession[]).slice(0, 5).map(session => (
                            <div key={session.chat_id} onClick={() => { setCurrentChatId(session.chat_id); setActiveTab('live'); }} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-[20px] border border-transparent hover:border-blue-100 transition-all cursor-pointer group">
                              <div className="flex items-center gap-4 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center font-black text-blue-600 shadow-sm shrink-0">{session.user_name[0]}</div>
                                <div className="min-w-0">
                                  <p className="font-black text-slate-800 text-sm truncate">{session.user_name}</p>
                                  <p className="text-[10px] text-slate-400 font-bold truncate">Last: {session.messages[session.messages.length-1]?.text}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0"><StatusBadge status={session.status} /><p className="text-[9px] text-slate-400 mt-1 font-bold">{new Date(session.lastActivity).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p></div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="bg-slate-900 text-white rounded-[32px] p-6 sm:p-8 shadow-2xl flex flex-col h-full max-h-[500px]">
                      <h3 className="text-lg font-black mb-6 flex items-center gap-2"><BrainCircuit size={20} className="text-blue-400" /> Neural Trace</h3>
                      <div className="flex-1 overflow-y-auto custom-scrollbar-dark space-y-5 pr-2">
                        {aiLogs.length === 0 && <p className="text-slate-600 text-xs italic">System waiting for neural events...</p>}
                        {aiLogs.map((log, idx) => (
                          <div key={idx} className="border-l-2 border-slate-700 pl-4 space-y-1">
                            <div className="flex items-center justify-between"><span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{log.chatName}</span><span className="text-[9px] text-slate-500 font-mono">{new Date(log.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span></div>
                            <p className="text-[11px] text-slate-400 italic line-clamp-2">{log.reasoning}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'live' && (
              <div className="flex-1 flex flex-col sm:flex-row overflow-hidden bg-slate-50/50">
                <div className={`${currentChatId && 'hidden sm:flex'} w-full sm:w-80 border-r bg-white flex flex-col shrink-0 shadow-xl`}>
                  <div className="p-4 sm:p-5 border-b flex items-center justify-between bg-slate-50/50">
                    <h2 className="font-black text-slate-800 tracking-tight">Direct Access</h2>
                    <span className="text-[10px] font-black bg-blue-600 text-white px-2.5 py-1 rounded-lg">{(Object.values(sessions) as ChatSession[]).length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {(Object.values(sessions) as ChatSession[]).length === 0 ? (
                       <div className="p-8 text-center">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100 text-slate-400"><MessageCircle size={24} /></div>
                          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Inbox Empty</p>
                          <button onClick={handleForceRefresh} className="text-[9px] font-black text-blue-500 uppercase hover:underline">Re-sync Engine</button>
                       </div>
                    ) : (
                      (Object.values(sessions) as ChatSession[]).sort((a,b) => b.lastActivity - a.lastActivity).map(session => (
                        <div key={session.chat_id} onClick={() => setCurrentChatId(session.chat_id)} className={`p-4 sm:p-5 border-b cursor-pointer transition-all hover:bg-slate-50 relative group ${currentChatId === session.chat_id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}>
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-sm truncate pr-2 text-slate-800">{session.user_name}</span>
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{new Date(session.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-xs text-slate-500 truncate mb-3 leading-relaxed">{session.messages[session.messages.length - 1]?.text}</p>
                          <div className="flex gap-2"><StatusBadge status={session.status} />{session.isBotEnabled && <span className="text-[8px] bg-indigo-50 text-indigo-600 font-black px-2 py-0.5 rounded border border-indigo-100 uppercase tracking-widest">Neural Mode</span>}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className={`${!currentChatId && 'hidden sm:flex'} flex-1 flex flex-col bg-white shadow-2xl`}>
                  {activeSession ? (
                    <>
                      <div className="h-16 sm:h-20 border-b px-4 sm:px-8 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20 shadow-sm">
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                          <button className="sm:hidden p-2 -ml-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" onClick={() => setCurrentChatId(null)}><ChevronLeft size={24} /></button>
                          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-base sm:text-lg shadow-lg shadow-blue-500/20 shrink-0">{activeSession.user_name[0]}</div>
                          <div className="min-w-0">
                            <h3 className="font-black text-slate-800 text-sm sm:text-base tracking-tight truncate">{activeSession.user_name}</h3>
                            <p className="text-[10px] text-emerald-500 font-black flex items-center gap-1.5 uppercase tracking-widest"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> Link Active</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                           <button onClick={() => toggleBot(activeSession.chat_id)} className={`transition-all px-3 py-1.5 rounded-xl font-black text-[10px] ${activeSession.isBotEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                             {activeSession.isBotEnabled ? 'NEURAL ON' : 'NEURAL OFF'}
                           </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col gap-4 sm:gap-6 bg-slate-50/40 custom-scrollbar">
                        {activeSession.messages.map((msg) => (
                          <div key={msg.id} className={`flex ${msg.is_bot ? 'justify-start' : 'justify-end'} animate-in slide-in-from-bottom-2 duration-300`}>
                            <div className={`max-w-[85%] sm:max-w-[70%] shadow-md ${msg.is_bot ? 'bg-white text-slate-800 rounded-2xl sm:rounded-3xl rounded-bl-none border border-slate-100' : 'bg-blue-600 text-white rounded-2xl sm:rounded-3xl rounded-br-none shadow-blue-500/20'}`}>
                              <div className="p-3 sm:p-4"><p className="text-xs sm:text-sm leading-relaxed font-medium">{msg.text}</p></div>
                              <div className={`px-3 sm:px-4 pb-2 sm:pb-3 text-[9px] flex items-center gap-2 font-bold uppercase tracking-widest ${msg.is_bot ? 'text-slate-300' : 'text-blue-200'}`}>
                                <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                {msg.is_manual && <span className="text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">Human Assist</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="p-4 sm:p-6 bg-white border-t border-slate-100 flex gap-3 sm:gap-4 shadow-[0_-8px_30px_rgba(0,0,0,0.03)] items-end">
                        <textarea rows={1} value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleManualSend(); } }} placeholder="Respond manually..." className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all resize-none max-h-32" />
                        <button onClick={handleManualSend} disabled={isSending || !inputText.trim()} className="bg-blue-600 text-white p-3 sm:p-4 sm:px-8 rounded-2xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2 sm:gap-3 font-black text-sm shadow-xl shadow-blue-500/30 active:scale-95 shrink-0">{isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center bg-slate-50/20">
                      <div className="max-w-md space-y-8">
                         <div className="w-24 h-24 sm:w-32 sm:h-32 bg-white shadow-2xl shadow-slate-200/50 rounded-[32px] sm:rounded-[40px] flex items-center justify-center mx-auto border-4 border-blue-50/50">
                            <Bot size={56} className="text-blue-600 animate-bounce" />
                         </div>
                         <div className="space-y-4">
                            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Syncing Live Conversations</h3>
                            <p className="text-slate-500 text-sm leading-relaxed">
                               Your bot @{botInfo?.username} is now connected. Since bots cannot speak first, you must send a message to it on Telegram to see it here.
                            </p>
                            {botInfo && (
                               <div className="flex flex-col gap-3">
                                  <a href={`https://t.me/${botInfo.username}`} target="_blank" className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl shadow-blue-500/20 hover:scale-105 transition-all">
                                     <ExternalLink size={18} /> OPEN BOT ON TELEGRAM
                                  </a>
                                  <button onClick={handleForceRefresh} className="text-[10px] font-black text-slate-400 hover:text-blue-500 uppercase tracking-widest flex items-center justify-center gap-1"><RefreshCw size={12} /> Force Re-sync Engine</button>
                               </div>
                            )}
                         </div>
                         <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 text-left space-y-3">
                            <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2"><Info size={14} /> Critical Checkpoints</h4>
                            <ul className="text-[11px] text-amber-800 space-y-2 leading-relaxed list-disc ml-4">
                               <li><b>Privacy Mode:</b> If testing in a Group, the bot only sees messages starting with <b>/</b> unless you disable Privacy Mode in @BotFather.</li>
                               <li><b>Webhook Clearing:</b> We already cleared existing webhooks. If messages still aren't appearing, use the "Force Re-sync" button above.</li>
                               <li><b>Direct Messaging:</b> Try sending a DM to the bot directly instead of using a group first.</li>
                            </ul>
                         </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'help' && (
              <div className="p-4 sm:p-10 flex-1 overflow-y-auto bg-slate-50/50">
                <div className="max-w-4xl mx-auto space-y-6">
                  <header className="mb-10">
                    <h1 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tighter">Escalations</h1>
                    <p className="text-slate-500 font-medium">Clients requiring priority human intervention.</p>
                  </header>

                  <div className="space-y-4">
                    {(Object.values(sessions) as ChatSession[]).filter(s => s.status === 'needs_help').length === 0 ? (
                      <div className="bg-white p-12 sm:p-20 text-center rounded-[32px] sm:rounded-[40px] border border-dashed border-slate-300 flex flex-col items-center gap-6">
                        <CheckCircle2 size={40} className="text-emerald-500" />
                        <h3 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">Escalation Queue is Clear</h3>
                      </div>
                    ) : (
                      (Object.values(sessions) as ChatSession[]).filter(s => s.status === 'needs_help').map(session => (
                        <div key={session.chat_id} className="bg-white p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] shadow-lg border border-red-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in slide-in-from-bottom-4 duration-500">
                          <div className="flex items-center gap-4 sm:gap-6 min-w-0">
                            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[18px] sm:rounded-[24px] bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                              <AlertCircle size={28} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-black text-lg sm:text-xl text-slate-800 tracking-tight truncate">{session.user_name}</h3>
                              <p className="text-xs sm:text-sm text-slate-500 italic truncate max-w-xs sm:max-w-md">"{(session.messages[session.messages.length - 1]?.text || '')}"</p>
                            </div>
                          </div>
                          <div className="flex gap-3 w-full sm:w-auto">
                            <button 
                              onClick={() => { setCurrentChatId(session.chat_id); setActiveTab('live'); }}
                              className="flex-1 sm:flex-none px-6 sm:px-8 py-3 sm:py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 font-black text-xs sm:text-sm shadow-xl shadow-blue-500/20 transition-all"
                            >
                              INTERVENE
                            </button>
                            <button 
                              onClick={() => resolveHelp(session.chat_id)}
                              className="flex-1 sm:flex-none px-6 sm:px-8 py-3 sm:py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl hover:bg-slate-50 font-black text-xs sm:text-sm transition-all"
                            >
                              RESOLVE
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'schedules' && (
              <div className="p-4 sm:p-10 flex-1 overflow-y-auto bg-slate-50/50">
                <div className="max-w-6xl mx-auto">
                  <header className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h1 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tighter">Retained Tasks</h1>
                    {schedules.length > 0 && <button onClick={() => { if(confirm('Clear current history?')) setSchedules([]) }} className="text-xs font-black text-red-500 hover:text-red-700 uppercase tracking-widest flex items-center gap-2 px-4 py-2 bg-red-50 rounded-xl transition-all"><Trash2 size={14} /> Wipe All</button>}
                  </header>
                  <div className="bg-white rounded-[24px] sm:rounded-[32px] shadow-xl border border-slate-200/50 overflow-x-auto">
                    <table className="w-full text-left min-w-[600px]">
                        <thead className="bg-slate-50/80 border-b border-slate-100">
                          <tr>
                            <th className="px-6 sm:px-8 py-4 sm:py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client Name</th>
                            <th className="px-6 sm:px-8 py-4 sm:py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Proposed Time</th>
                            <th className="px-6 sm:px-8 py-4 sm:py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Outcome</th>
                            <th className="px-6 sm:px-8 py-4 sm:py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Utility</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {schedules.map(schedule => (
                            <tr key={schedule.id} className="hover:bg-slate-50/30 transition-colors group">
                              <td className="px-6 sm:px-8 py-4 sm:py-6"><p className="font-black text-slate-800 text-sm">{schedule.user_name}</p></td>
                              <td className="px-6 sm:px-8 py-4 sm:py-6 text-sm text-slate-600 font-black">{formatDate(schedule.proposed_time)}</td>
                              <td className="px-6 sm:px-8 py-4 sm:py-6"><span className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest border ${schedule.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>{schedule.status}</span></td>
                              <td className="px-6 sm:px-8 py-4 sm:py-6 text-right"><div className="flex items-center justify-end gap-4"><button onClick={() => toggleScheduleStatus(schedule.id)} className="text-blue-600 hover:text-blue-800 text-xs font-black uppercase tracking-widest">{schedule.status === 'pending' ? 'CLOSE' : 'REOPEN'}</button><button onClick={() => deleteSchedule(schedule.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button></div></td>
                            </tr>
                          ))}
                        </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="p-4 sm:p-10 flex-1 overflow-y-auto bg-slate-50/50">
                <div className="max-w-3xl mx-auto w-full bg-white shadow-2xl rounded-[32px] border border-slate-100 p-6 sm:p-10">
                  <header className="mb-12"><h1 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tighter mb-2">Core Config</h1></header>
                  <div className="space-y-10">
                    <section>
                      <h3 className="font-black text-slate-800 mb-6 flex items-center gap-3 text-lg uppercase tracking-tight"><Globe size={20} className="text-blue-600" /> Infrastructure</h3>
                      <div className="bg-slate-50/50 p-6 sm:p-8 rounded-[32px] border border-slate-100 space-y-6">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest">Telegram Link Token</label>
                          <div className="flex gap-2">
                             <input type="password" value={inputToken} onChange={(e) => setInputToken(e.target.value)} placeholder="REPLACE_TOKEN_IF_NEEDED" className="flex-1 bg-white border border-slate-200 rounded-2xl px-5 sm:px-6 py-4 text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-mono" />
                             <button onClick={handleConnectClick} className="px-6 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all">Update</button>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl shadow-sm gap-4">
                          <div className="flex items-center gap-3 text-xs font-bold text-slate-600">{isConnected ? <Wifi className="text-emerald-500" size={18} /> : <WifiOff className="text-red-500" size={18} />}<span className="uppercase tracking-widest font-black text-[10px]">{isConnected ? 'Link Stable' : 'Link Broken'}</span></div>
                          <div className="flex gap-4">
                             <button onClick={handleForceRefresh} className="text-[10px] font-black text-blue-500 hover:text-blue-700 uppercase tracking-widest flex items-center gap-1 transition-colors"><RefreshCw size={12} className={isPolling ? "animate-spin" : ""} /> Force Sync</button>
                             {botToken && <button onClick={disconnectBot} className="text-[10px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest transition-colors">Destroy Link</button>}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

const NavItem: React.FC<{ active: boolean; icon: React.ReactNode; label: string; badge?: number; badgeColor?: string; onClick: () => void }> = ({ active, icon, label, badge, badgeColor, onClick }) => (
  <button onClick={onClick} className={`flex items-center gap-4 p-4 px-5 rounded-2xl transition-all duration-300 group relative ${active ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/30 scale-[1.02]' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/40'}`}>
    <span className={`${active ? 'text-white' : 'text-slate-600 group-hover:text-slate-400'} transition-colors`}>{icon}</span>
    <span className="text-xs font-black uppercase tracking-widest">{label}</span>
    {badge !== undefined && <span className={`ml-auto text-[10px] font-black ${badgeColor || 'bg-blue-500'} text-white w-6 h-6 flex items-center justify-center rounded-xl shadow-lg border border-white/20`}>{badge}</span>}
  </button>
);

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; subtitle: string, color: 'blue' | 'indigo' | 'red' | 'emerald' }> = ({ title, value, icon, subtitle, color }) => {
  const colorMap = { blue: 'text-blue-600 bg-blue-50 hover:bg-blue-100', indigo: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100', red: 'text-red-600 bg-red-50 hover:bg-red-100', emerald: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' };
  return (
    <div className="bg-white p-6 sm:p-8 rounded-[32px] shadow-sm border border-slate-100 hover:shadow-xl hover:border-blue-100 transition-all group relative overflow-hidden text-left">
      <div className="flex items-center justify-between mb-4 sm:mb-6 relative z-10"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</span><div className={`p-2.5 sm:p-3 rounded-2xl transition-colors duration-500 ${colorMap[color]}`}>{icon}</div></div>
      <div className="text-3xl sm:text-4xl font-black text-slate-800 mb-2 tracking-tighter relative z-10">{value}</div>
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-tighter opacity-60 relative z-10">{subtitle}</div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles = { active: 'bg-emerald-50 text-emerald-600 border-emerald-100', needs_help: 'bg-red-50 text-red-600 border-red-100', resolved: 'bg-blue-50 text-blue-600 border-blue-100' };
  return <span className={`text-[8px] font-black px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border uppercase tracking-widest whitespace-nowrap ${styles[status as keyof typeof styles]}`}>{status === 'needs_help' ? 'Priority' : status}</span>;
};

export default App;
