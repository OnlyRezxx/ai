import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Paperclip, Bot, User as UserIcon, Cpu, Trash2, 
  FileText, Loader2, Microscope, Menu, X, Plus, MessageSquare, Zap, Settings, 
  CheckCircle2, Circle, PanelLeftClose, PanelLeft, Download, Code, Gamepad2, Layers, Database, Pencil, Edit2
} from 'lucide-react';
import { Message, Attachment, User, ChatSession } from './types';
import { fileToAttachment, generateId } from './utils';
import { sendMessageToGemini } from './services/gemini';
import { authService, dbService } from './services/storage';
import MarkdownRenderer from './components/MarkdownRenderer';

const App: React.FC = () => {
  // User State (Always Guest)
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Chat State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  // UI State
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // AI Feature Flags
  const [deepThink, setDeepThink] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState(false);
  const [optimizeMode, setOptimizeMode] = useState(false);
  
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Editing State
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize App (Auto-login as Guest)
  useEffect(() => {
    const initApp = async () => {
      const user = await authService.getCurrentUser();
      if (user) {
        setCurrentUser(user);
        loadSessions(user.id);
      }
    };
    initApp();
  }, []);

  // Persist current session changes
  useEffect(() => {
    if (currentUser && currentSessionId && messages.length > 0) {
      dbService.updateSession(currentSessionId, messages);
    }
  }, [messages, currentSessionId, currentUser]);

  // Auto-resize edit textarea
  useEffect(() => {
    if (editingMessageId && editInputRef.current) {
      editInputRef.current.style.height = 'auto';
      editInputRef.current.style.height = editInputRef.current.scrollHeight + 'px';
      editInputRef.current.focus();
    }
  }, [editingMessageId]);

  const loadSessions = async (userId: string) => {
    const loadedSessions = await dbService.getSessions(userId);
    setSessions(loadedSessions);
  };

  const startNewChat = () => {
    setMessages([]); // Start clean for quick prompts
    setCurrentSessionId(null);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const loadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (window.confirm('Delete this chat?')) {
      await dbService.deleteSession(sessionId);
      if (currentUser) {
        const remainingSessions = await dbService.getSessions(currentUser.id);
        setSessions(remainingSessions);
      }
      if (currentSessionId === sessionId) startNewChat();
    }
  };

  const handleExportChat = () => {
    if (messages.length === 0) return;
    
    const content = messages.map(m => `[${m.role.toUpperCase()} - ${new Date(m.timestamp).toLocaleString()}]\n${m.content}\n`).join('\n---\n\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roblox-architect-chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const files: File[] = Array.from(event.target.files);
      const newAttachments: Attachment[] = [];

      for (const file of files) {
        try {
          if (file.size > 5 * 1024 * 1024) {
            alert(`File ${file.name} is too large. Max 5MB.`);
            continue;
          }
          const att = await fileToAttachment(file);
          newAttachments.push(att);
        } catch (e) {
          console.error("Failed to upload file", e);
        }
      }
      setAttachments(prev => [...prev, ...newAttachments]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // --- EDITING LOGIC ---

  const handleEditClick = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
  };

  const handleEditCancel = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleEditSave = async () => {
    if (!editingMessageId || !editContent.trim()) return;

    const msgIndex = messages.findIndex(m => m.id === editingMessageId);
    if (msgIndex === -1) return;

    // Preserve original attachments
    const originalMsg = messages[msgIndex];
    const updatedMsg = { ...originalMsg, content: editContent };

    // Truncate history: Keep everything BEFORE the edited message, plus the edited message itself.
    // Discard everything AFTER (since the response is now invalid).
    const newHistory = messages.slice(0, msgIndex + 1);
    newHistory[msgIndex] = updatedMsg;

    setMessages(newHistory);
    setEditingMessageId(null);
    setIsLoading(true);

    // Prepare API Call
    try {
      // API needs context. Exclude the current updated message from 'history' param, 
      // because we pass it as the 'newMessage'.
      const apiHistory = newHistory.slice(0, -1).filter(m => m.id !== 'welcome');
      
      const responseText = await sendMessageToGemini(
        apiHistory,
        updatedMsg.content,
        updatedMsg.attachments || [],
        deepThink,
        analyzeMode,
        optimizeMode
      );

      const botMessage: Message = {
        id: generateId(),
        role: 'model',
        content: responseText,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: generateId(),
        role: 'model',
        content: "Error regenerating response after edit.",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- SENDING LOGIC ---

  const handleSend = async (manualInput?: string) => {
    const textToSend = typeof manualInput === 'string' ? manualInput : input;
    
    if ((!textToSend.trim() && attachments.length === 0) || isLoading) return;

    // Local update first for immediate feedback
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: textToSend,
      attachments: attachments,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    if (!manualInput) setInput('');
    setAttachments([]);
    setIsLoading(true);

    // Ensure session exists
    let activeSessionId = currentSessionId;
    if (!activeSessionId && currentUser) {
      const tempMsg: Message = { id: 'temp', role: 'user', content: textToSend, timestamp: Date.now() };
      try {
        const newSession = await dbService.createSession(currentUser.id, tempMsg);
        activeSessionId = newSession.id;
        setCurrentSessionId(activeSessionId);
        const updatedSessions = await dbService.getSessions(currentUser.id);
        setSessions(updatedSessions);
      } catch (err) {
        console.error("Failed to create session in storage", err);
      }
    }

    try {
      const history = messages.filter(m => m.id !== 'welcome'); // Filter out welcome msg if exists

      const responseText = await sendMessageToGemini(
        history, 
        userMessage.content, 
        userMessage.attachments || [], 
        deepThink,
        analyzeMode,
        optimizeMode
      );

      const botMessage: Message = {
        id: generateId(),
        role: 'model',
        content: responseText,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: generateId(),
        role: 'model',
        content: "I encountered a system error. Please check your API key.",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeAction = (action: string, code: string) => {
    if (action === 'explain') {
      handleSend(`Explain this code in detail:\n\n\`\`\`lua\n${code}\n\`\`\``);
    } else if (action === 'refactor') {
      if (!optimizeMode) setOptimizeMode(true);
      handleSend(`Refactor this code:\n\n\`\`\`lua\n${code}\n\`\`\``);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getLoadingText = () => {
    const modes = [];
    if (deepThink) modes.push("Thinking");
    if (optimizeMode) modes.push("Optimizing");
    if (analyzeMode) modes.push("Analyzing");
    
    if (modes.length > 0) return `${modes.join(' & ')}...`;
    return "Generating...";
  };

  // Quick Prompt Component
  const QuickPrompt = ({ icon: Icon, title, prompt, colorClass }: any) => (
    <button 
      onClick={() => handleSend(prompt)}
      className="flex flex-col items-start p-4 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 rounded-xl transition-all text-left group w-full"
    >
      <div className={`p-2 rounded-lg mb-3 ${colorClass} bg-opacity-10`}>
        <Icon size={20} className={colorClass.replace('bg-opacity-10', '')} />
      </div>
      <h3 className="font-semibold text-gray-200 text-sm mb-1">{title}</h3>
      <p className="text-xs text-neutral-500 line-clamp-2 group-hover:text-neutral-400">
        {prompt}
      </p>
    </button>
  );

  const FeatureToggle = ({ title, description, active, onToggle, icon: Icon, colorClass }: any) => (
    <div 
      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-4 ${active ? 'bg-neutral-800 border-orange-500/50' : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'}`}
      onClick={onToggle}
    >
      <div className={`p-2 rounded-lg bg-neutral-950 ${colorClass}`}>
        <Icon size={24} />
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-bold text-gray-200">{title}</h3>
          {active ? <CheckCircle2 className="text-orange-500" size={20} /> : <Circle className="text-neutral-600" size={20} />}
        </div>
        <p className="text-sm text-neutral-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );

  if (!currentUser) {
     return <div className="h-screen w-full flex items-center justify-center bg-black text-white"><Loader2 className="animate-spin mr-2"/> Loading Studio...</div>
  }

  return (
    <div className="flex h-screen bg-black text-gray-200 font-sans overflow-hidden">
      
      {/* Sidebar - Now collapsible on Desktop */}
      <div className={`
        fixed inset-y-0 left-0 z-40 bg-neutral-900/95 backdrop-blur-sm border-r border-neutral-800 transform transition-all duration-300 ease-in-out flex flex-col
        md:relative
        ${sidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-none'}
      `}>
        <div className={`flex flex-col h-full p-4 ${sidebarOpen ? 'opacity-100' : 'opacity-0 md:opacity-0'} transition-opacity duration-200`}>
          <div className="flex items-center justify-between mb-6 px-2">
            <div className="flex items-center gap-2">
              <Bot className="text-orange-500" />
              <span className="font-bold text-lg whitespace-nowrap">Architect AI</span>
            </div>
            {/* Mobile close button */}
            <button onClick={() => setSidebarOpen(false)} className="md:hidden text-neutral-400">
              <X size={20} />
            </button>
          </div>

          <button 
            onClick={startNewChat}
            className="flex items-center gap-2 w-full p-3 rounded-lg bg-orange-600/10 text-orange-400 border border-orange-600/20 hover:bg-orange-600/20 transition-all mb-4 whitespace-nowrap"
          >
            <Plus size={18} />
            <span className="text-sm font-medium">New Project</span>
          </button>

          <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2 scrollbar-hide">
            {sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => loadSession(session)}
                className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  currentSessionId === session.id 
                    ? 'bg-neutral-800 text-white' 
                    : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare size={16} className="min-w-[16px]" />
                  <span className="text-sm truncate">{session.title}</span>
                </div>
                <button 
                  onClick={(e) => deleteSession(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-700 rounded text-neutral-500 hover:text-red-400 transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-neutral-800 whitespace-nowrap">
            <button 
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 w-full p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
            >
              <Settings size={18} />
              <span className="text-sm">Settings</span>
            </button>
            <div className="flex items-center gap-2 mt-3 pl-2">
              <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-bold text-orange-500 border border-neutral-700">
                {currentUser.username.substring(0,2).toUpperCase()}
              </div>
              <div className="text-sm font-medium truncate max-w-[100px] text-neutral-500">{currentUser.username}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative min-w-0">
        
        {/* Header - Visible on both Mobile and Desktop now */}
        <header className="flex items-center justify-between p-4 bg-neutral-900/50 backdrop-blur-md border-b border-neutral-800 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)} 
              className="text-neutral-400 hover:text-white transition-colors"
              title={sidebarOpen ? "Close Sidebar" : "Open Sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose size={24}/> : <PanelLeft size={24}/>}
            </button>
            <span className="font-bold md:hidden">Roblox Architect</span>
            {!sidebarOpen && <span className="font-bold hidden md:block text-orange-500">Architect AI</span>}
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button 
                onClick={handleExportChat}
                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors flex items-center gap-2"
                title="Export Chat to Markdown"
              >
                <Download size={20} />
                <span className="hidden md:inline text-sm">Export</span>
              </button>
            )}
            <button 
              onClick={() => setShowSettings(true)} 
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors md:hidden"
            >
              <Settings size={20}/>
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth bg-black">
          <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 h-full flex flex-col">
            
            {messages.length === 0 && (
               <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
                 <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center mb-6 border border-neutral-800 shadow-xl shadow-orange-900/10">
                    <Bot size={32} className="text-orange-500" />
                 </div>
                 <h1 className="text-2xl font-bold mb-2">How can I help you build today?</h1>
                 <p className="text-neutral-500 mb-8 text-center max-w-md">
                   Roblox Architect AI specializes in efficient Luau scripting, UDim2 layouts, and game architecture.
                 </p>
                 
                 {/* Quick Starters Grid */}
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
                    <QuickPrompt 
                      title="DataStore System" 
                      icon={Database}
                      colorClass="text-blue-500 bg-blue-500"
                      prompt="Create a robust DataStore system with retries, pcall, and session locking for player data." 
                    />
                    <QuickPrompt 
                      title="UI Animation" 
                      icon={Layers} 
                      colorClass="text-purple-500 bg-purple-500"
                      prompt="Write a ModuleScript for clean UI animations using TweenService and spring physics." 
                    />
                    <QuickPrompt 
                      title="Game Loop" 
                      icon={Gamepad2} 
                      colorClass="text-green-500 bg-green-500"
                      prompt="Design a main game loop structure that handles round management, intermission, and player spawning." 
                    />
                    <QuickPrompt 
                      title="Debug Script" 
                      icon={Microscope} 
                      colorClass="text-red-500 bg-red-500"
                      prompt="I have a script that is causing lag. Help me find memory leaks and optimize it." 
                    />
                 </div>
               </div>
            )}

            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-4 group ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${
                  msg.role === 'model' 
                    ? 'bg-neutral-800 border border-neutral-700' 
                    : 'bg-neutral-800 border border-orange-500/30'
                }`}>
                  {msg.role === 'model' ? <Bot size={18} className="text-orange-500" /> : <UserIcon size={18} className="text-neutral-300" />}
                </div>

                <div className={`flex flex-col max-w-[90%] md:max-w-[80%] space-y-1`}>
                  
                  {/* Editing Mode */}
                  {editingMessageId === msg.id ? (
                    <div className="bg-neutral-900 border border-orange-500/50 rounded-xl p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                      <textarea
                        ref={editInputRef}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full bg-transparent text-white resize-none focus:outline-none text-sm md:text-base mb-2"
                        rows={1}
                        onInput={(e) => {
                          const t = e.target as HTMLTextAreaElement;
                          t.style.height = 'auto';
                          t.style.height = t.scrollHeight + 'px';
                        }}
                      />
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={handleEditCancel}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handleEditSave}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors"
                        >
                          Save & Regenerate
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Normal Display Mode
                    <div className="relative group/bubble">
                      <div className={`rounded-2xl px-4 py-3 md:px-5 md:py-4 shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-neutral-800 text-white border border-neutral-700 rounded-tr-sm' 
                          : 'bg-transparent border border-neutral-800/50 rounded-tl-sm w-full'
                      }`}>
                        {msg.attachments && msg.attachments.length > 0 && (
                           <div className="flex flex-wrap gap-2 mb-3">
                             {msg.attachments.map((att, idx) => (
                               <div key={idx} className="relative group overflow-hidden rounded-lg border border-neutral-600 bg-neutral-900">
                                 {att.mimeType.startsWith('image/') ? (
                                   <img src={`data:${att.mimeType};base64,${att.data}`} alt={att.name} className="h-20 md:h-24 w-auto object-cover opacity-80" />
                                 ) : (
                                   <div className="h-20 w-20 md:h-24 md:w-24 flex flex-col items-center justify-center text-neutral-400 p-2 text-center text-xs">
                                     <FileText size={20} className="mb-1"/>
                                     <span className="truncate w-full">{att.name}</span>
                                   </div>
                                 )}
                               </div>
                             ))}
                           </div>
                        )}

                        {msg.role === 'model' ? (
                          <MarkdownRenderer 
                            content={msg.content} 
                            onCodeAction={handleCodeAction}
                          />
                        ) : (
                          <p className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">{msg.content}</p>
                        )}
                      </div>
                      
                      {/* Edit Button for User Messages */}
                      {msg.role === 'user' && !isLoading && (
                        <button 
                          onClick={() => handleEditClick(msg)}
                          className="absolute top-1/2 -left-8 -translate-y-1/2 opacity-0 group-hover/bubble:opacity-100 p-1.5 bg-neutral-800 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-700 transition-all border border-neutral-700"
                          title="Edit message"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                  )}

                  <div className={`text-[10px] md:text-xs text-neutral-600 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                  <Bot size={20} className="text-orange-500 animate-pulse" />
                </div>
                <div className="bg-transparent border border-neutral-800 rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-3">
                   <Loader2 size={18} className="animate-spin text-orange-500" />
                   <span className="text-neutral-400 text-sm animate-pulse">
                     {getLoadingText()}
                   </span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input Footer */}
        <footer className="bg-neutral-900/80 backdrop-blur-md border-t border-neutral-800 p-4 pb-6 z-10">
          <div className="max-w-4xl mx-auto space-y-4">
            
            <div className="flex justify-between items-end">
              <div className="flex gap-2 overflow-x-auto pb-1 max-w-[50%] scrollbar-hide">
                {attachments.map((att, idx) => (
                  <div key={idx} className="relative group flex-shrink-0 bg-neutral-800 border border-neutral-700 rounded-md p-1">
                    {att.mimeType.startsWith('image/') ? (
                      <img src={`data:${att.mimeType};base64,${att.data}`} alt={att.name} className="h-8 w-8 object-cover rounded" />
                    ) : (
                      <div className="h-8 w-8 flex items-center justify-center bg-neutral-700 rounded text-neutral-300">
                        <FileText size={14} />
                      </div>
                    )}
                    <button 
                      onClick={() => removeAttachment(idx)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"
                    >
                      <Trash2 size={8} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Quick Toggles */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                 <button
                  onClick={() => setAnalyzeMode(!analyzeMode)}
                  className={`flex items-center gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-full text-[10px] md:text-xs font-semibold transition-all border whitespace-nowrap ${
                    analyzeMode
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/50' 
                      : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600'
                  }`}
                >
                  <Microscope size={12} />
                  Analyze
                </button>

                <button
                  onClick={() => setOptimizeMode(!optimizeMode)}
                  className={`flex items-center gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-full text-[10px] md:text-xs font-semibold transition-all border whitespace-nowrap ${
                    optimizeMode
                      ? 'bg-green-500/10 text-green-400 border-green-500/50' 
                      : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600'
                  }`}
                >
                  <Zap size={12} />
                  Optimize
                </button>

                <button
                  onClick={() => setDeepThink(!deepThink)}
                  className={`flex items-center gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-full text-[10px] md:text-xs font-semibold transition-all border whitespace-nowrap ${
                    deepThink 
                      ? 'bg-orange-500/10 text-orange-400 border-orange-500/50' 
                      : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600'
                  }`}
                >
                  <Cpu size={12} />
                  Deep Think
                </button>
              </div>
            </div>

            {/* Input Box */}
            <div className="relative group">
              <div className={`absolute -inset-0.5 bg-gradient-to-r rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500 ${isLoading ? 'opacity-0' : ''} ${optimizeMode && !isLoading ? 'from-green-600 to-green-400' : 'from-orange-600 to-orange-400'}`}></div>
              <div className="relative flex items-end bg-neutral-950 rounded-xl border border-neutral-800 shadow-2xl overflow-hidden focus-within:border-orange-500/50 transition-colors">
                
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 md:p-4 text-neutral-400 hover:text-orange-400 transition-colors"
                >
                  <Paperclip size={20} />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  multiple
                  accept="image/*,.lua,.txt,.md,.json" 
                />

                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Architect AI..."
                  className="w-full bg-transparent text-gray-200 placeholder-neutral-600 p-3 md:p-4 max-h-32 min-h-[56px] resize-none focus:outline-none text-sm md:text-base"
                  rows={1}
                  style={{ height: 'auto', minHeight: '56px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${target.scrollHeight}px`;
                  }}
                />

                <button 
                  onClick={() => handleSend()}
                  disabled={isLoading || (!input.trim() && attachments.length === 0)}
                  className={`p-3 md:p-4 m-1 rounded-lg transition-all duration-300 ${
                    input.trim() || attachments.length > 0
                      ? optimizeMode ? 'bg-green-600 text-white shadow-lg shadow-green-900/50 hover:bg-green-500' : 'bg-orange-600 text-white shadow-lg shadow-orange-900/50 hover:bg-orange-500' 
                      : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                  }`}
                >
                  {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-neutral-800 bg-neutral-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-600/20 flex items-center justify-center text-orange-500">
                  <Bot size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">AI Capabilities</h2>
                  <p className="text-sm text-neutral-400">Configure Architect AI behavior</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSettings(false)} 
                className="p-2 hover:bg-neutral-800 rounded-full text-neutral-500 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              
              <FeatureToggle 
                title="Deep Think" 
                description="Uses enhanced reasoning (Chain of Thought). Best for complex game architecture, math systems, or debugging obscure issues. Slightly slower."
                active={deepThink}
                onToggle={() => setDeepThink(!deepThink)}
                icon={Cpu}
                colorClass="text-orange-500 bg-orange-500/10"
              />

              <FeatureToggle 
                title="Code Optimization" 
                description="Enforces strict performance standards. Prevents memory leaks (Janitor/Maid), reduces lag (O(1) lookups), and optimizes networking."
                active={optimizeMode}
                onToggle={() => setOptimizeMode(!optimizeMode)}
                icon={Zap}
                colorClass="text-green-500 bg-green-500/10"
              />

              <FeatureToggle 
                title="Code Analysis" 
                description="Detailed review mode. Checks for type safety (Luau), modularity (ModuleScripts), and logical errors without simply rewriting code blindly."
                active={analyzeMode}
                onToggle={() => setAnalyzeMode(!analyzeMode)}
                icon={Microscope}
                colorClass="text-blue-500 bg-blue-500/10"
              />

            </div>
            
            <div className="p-4 bg-neutral-950/50 border-t border-neutral-800 text-center text-xs text-neutral-500">
              Changes apply to the next message sent.
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;