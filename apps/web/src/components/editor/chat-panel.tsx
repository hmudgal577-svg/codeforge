'use client';
import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X, Bot, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import ReactMarkdown from 'react-markdown';
import { api } from '@/lib/api';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function ChatPanel({ socket, workspaceId }: { socket: any; workspaceId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const [aiTyping, setAiTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, aiTyping]);

  const send = async () => {
    if (!input.trim() || aiTyping) return;
    const userMsg = input.trim();
    setInput('');

    // Show user message immediately
    const newMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: userMsg };
    setMessages(prev => [...prev, newMsg]);
    setAiTyping(true);

    try {
      // Build history for context
      const history = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Call AI chat endpoint directly
      const res = await api.post('/ai/chat', {
        message: userMsg,
        history,
      });

      const aiResponse = res.data?.data?.response || 'Sorry, no response received.';
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: aiResponse,
      }]);
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'AI service error';
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Error: ${errMsg}. Please try again.`,
      }]);
    } finally {
      setAiTyping(false);
    }
  };

  if (!isOpen) {
    return (
      <button onClick={() => { setIsOpen(true); setUnread(0); }}
        className="fixed bottom-6 right-6 w-12 h-12 bg-brand-600 hover:bg-brand-700 rounded-full flex items-center justify-center shadow-lg shadow-brand-600/25 transition-all z-50 group">
        <MessageSquare className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[480px] bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-800 flex items-center justify-between bg-gradient-to-r from-surface-800 to-surface-900">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-brand-400" />
          <span className="text-sm font-semibold">CodeForge AI Chat</span>
          <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded-full">ONLINE</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !aiTyping && (
          <div className="text-center py-8">
            <Bot className="w-10 h-10 mx-auto mb-3 text-brand-500/40" />
            <p className="text-xs text-zinc-500">Hi! Main CodeForge AI hoon 🤖</p>
            <p className="text-xs text-zinc-600 mt-1">Coding questions poochho, debug help lo, ya bas baat karo!</p>
          </div>
        )}
        {messages.map((msg) => {
          const isAI = msg.role === 'assistant';

          return (
            <div key={msg.id} className={`flex flex-col ${isAI ? 'items-start' : 'items-end'}`}>
              <span className={`text-[10px] mb-0.5 ${isAI ? 'text-brand-400 font-medium' : 'text-zinc-600'}`}>
                {isAI ? '🤖 CodeForge AI' : 'You'}
              </span>
              <div className={`max-w-[90%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                isAI
                  ? 'bg-gradient-to-br from-brand-600/15 to-purple-600/10 text-zinc-200 rounded-bl-sm border border-brand-500/20'
                  : 'bg-brand-600 text-white rounded-br-sm'
              }`}>
                {isAI ? (
                  <div className="prose prose-invert prose-sm max-w-none [&_p]:my-1 [&_code]:bg-surface-800 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-surface-800 [&_pre]:rounded-lg [&_pre]:my-2 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          );
        })}
        {aiTyping && (
          <div className="flex flex-col items-start">
            <span className="text-[10px] text-brand-400 font-medium mb-0.5">🤖 CodeForge AI</span>
            <div className="px-3 py-2 rounded-xl rounded-bl-sm bg-gradient-to-br from-brand-600/15 to-purple-600/10 border border-brand-500/20 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
              <span className="text-xs text-zinc-400">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-2 border-t border-surface-800">
        <div className="flex gap-2">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !aiTyping && send()}
            placeholder="Ask AI anything..."
            className="flex-1 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50" />
          <button onClick={send} disabled={!input.trim() || aiTyping}
            className="p-2 bg-brand-600 hover:bg-brand-700 rounded-lg text-white disabled:opacity-50 transition-colors">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
