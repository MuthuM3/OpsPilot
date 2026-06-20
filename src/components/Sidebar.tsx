'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from '@/components/Providers';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { 
  LayoutDashboard, 
  Database, 
  RotateCcw, 
  ShieldCheck, 
  Clock, 
  Sparkles, 
  Menu, 
  ChevronDown, 
  ChevronRight, 
  MessageSquare,
  RefreshCw,
  Plus,
  Trash2,
  Pencil,
  Search
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const { activeChatId, setActiveChatId, isChatOpen, setIsChatOpen, showToast, chatList, createChat, deleteChat, renameChat, role, setRole } = useWorkspace();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [chatSearch, setChatSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const commitRename = (id: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed) renameChat(id, trimmed);
    setEditingId(null);
    setEditingTitle('');
  };

  const filteredChats = chatList.filter(c =>
    c.title.toLowerCase().includes(chatSearch.trim().toLowerCase())
  );

  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/dashboard/generate', { method: 'POST' });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to generate mock data');
      }
      return res.json();
    },
    onSuccess: () => {
      // Invalidate queries to reload dashboard, orders, inventory instantly!
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      
      showToast('⚡ Demo Store Data Generated successfully! 50 new orders, 10 refunds, and 5 pending approvals added.', 'success', 'DEMO SEED');
    },
    onError: (err: any) => {
      showToast(`Error generating store data: ${err.message}`, 'error', 'SEED FAILED');
    }
  });

  const navItems = [
    { name: 'Governance Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Inventory Control', href: '/inventory', icon: Database },
    { name: 'Support Tickets', href: '/refunds', icon: RotateCcw },
    { name: 'Approvals Queue', href: '/approvals', icon: ShieldCheck },
    { name: 'Audit Logs', href: '/timeline', icon: Clock },
  ];

  return (
    <div 
      className={`h-full border-r border-zinc-800/80 bg-[#0b0f19] flex flex-col shrink-0 transition-all duration-300 relative ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className={`p-4 border-b border-zinc-800/80 flex items-center justify-between gap-2 h-16`}>
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden animate-in fade-in duration-200">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-sky-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-zinc-100 text-sm tracking-tight">OpsPilot</h1>
              <p className="text-[9px] text-zinc-500 font-semibold tracking-wider uppercase">AI E-Com Operations</p>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-sky-400 flex items-center justify-center shrink-0 mx-auto">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        )}
        
        {/* Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors ${
            isCollapsed ? 'absolute -right-3 top-4 z-50 bg-[#0b0f19] border border-zinc-800 rounded-full p-1' : ''
          }`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <Menu className="w-4 h-4" />
        </button>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div className="space-y-1">
          {!isCollapsed && (
            <span className="px-3 text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-2">
              Workspace Tabs
            </span>
          )}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href === '/dashboard' && pathname === '/');
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 group ${
                    isActive
                      ? 'bg-purple-600/10 border border-purple-500/20 text-purple-300'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 border border-transparent'
                  } ${isCollapsed ? 'justify-center' : ''}`}
                  title={item.name}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-purple-400' : 'text-zinc-500 group-hover:text-zinc-300'
                    }`}
                  />
                  {!isCollapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Chat History Section */}
        <div className="space-y-2">
          {!isCollapsed ? (
            <>
              {/* New Chat */}
              <button
                onClick={() => {
                  createChat();
                  setIsChatOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-purple-300 bg-purple-600/10 border border-purple-500/20 hover:bg-purple-600/20 transition-all duration-150"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>New Chat</span>
              </button>

              {/* Header Toggle */}
              <button
                onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                className="w-full flex items-center justify-between px-3 pt-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <span>Recent Conversations</span>
                {isHistoryExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>

              {isHistoryExpanded && (
                <div className="space-y-1 animate-in slide-in-from-top-1 duration-150">
                  {/* Search */}
                  {chatList.length > 3 && (
                    <div className="relative px-1 pb-1">
                      <Search className="w-3 h-3 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        value={chatSearch}
                        onChange={(e) => setChatSearch(e.target.value)}
                        placeholder="Search conversations..."
                        className="w-full pl-7 pr-2 py-1.5 bg-zinc-900/60 border border-zinc-800/80 focus:border-purple-500/40 rounded-lg text-[10px] text-zinc-200 placeholder-zinc-600 focus:outline-none transition-colors"
                      />
                    </div>
                  )}

                  {chatList.length === 0 && (
                    <p className="px-3 py-2 text-[10px] text-zinc-600 italic">No conversations yet.</p>
                  )}
                  {chatList.length > 0 && filteredChats.length === 0 && (
                    <p className="px-3 py-2 text-[10px] text-zinc-600 italic">No matches.</p>
                  )}

                  {filteredChats.map((session) => {
                    const isSelected = activeChatId === session.id;
                    const isEditing = editingId === session.id;
                    return (
                      <div
                        key={session.id}
                        onClick={() => {
                          if (!isEditing) {
                            setActiveChatId(session.id);
                            setIsChatOpen(true);
                          }
                        }}
                        className={`group w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-900 border border-zinc-800 text-purple-300 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30 border border-transparent'
                        }`}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => commitRename(session.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename(session.id);
                              if (e.key === 'Escape') { setEditingId(null); setEditingTitle(''); }
                            }}
                            className="flex-1 min-w-0 bg-zinc-950 border border-purple-500/40 rounded px-1.5 py-0.5 text-[10px] text-zinc-100 focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingId(session.id);
                              setEditingTitle(session.title);
                            }}
                            className="flex items-center gap-2.5 flex-1 min-w-0"
                            title="Double-click to rename"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span className="truncate text-[10px]">{session.title}</span>
                          </div>
                        )}

                        {!isEditing && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(session.id);
                                setEditingTitle(session.title);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-500 hover:text-purple-300 transition-all shrink-0"
                              title="Rename conversation"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteChat(session.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-500 hover:text-rose-400 transition-all shrink-0"
                              title="Delete conversation"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 pt-2 border-t border-zinc-800/40">
              <button
                onClick={() => {
                  createChat();
                  setIsChatOpen(true);
                }}
                className="p-2 rounded-lg bg-purple-600/10 text-purple-400 border border-purple-500/20 hover:bg-purple-600/20 transition-all"
                title="New Chat"
              >
                <Plus className="w-4 h-4" />
              </button>
              {chatList.map((session) => {
                const isSelected = activeChatId === session.id;
                return (
                  <button
                    key={session.id}
                    onClick={() => {
                      setActiveChatId(session.id);
                      setIsChatOpen(true);
                    }}
                    className={`p-2 rounded-lg transition-all ${
                      isSelected ? 'bg-purple-600/10 text-purple-400 border border-purple-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 border border-transparent'
                    }`}
                    title={session.title}
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Info & Chat Toggle */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/20 space-y-2">
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
            isChatOpen
              ? 'bg-purple-600/10 border border-purple-500/20 text-purple-300'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 border border-transparent'
          } ${isCollapsed ? 'justify-center' : ''}`}
          title={isChatOpen ? "Close AI Assistant" : "Open AI Assistant"}
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>AI Assistant</span>}
        </button>

        {!isCollapsed ? (
          <div className="space-y-2 animate-in fade-in duration-200">
            {/* Role switcher — demonstrates governance roles (Manager can approve, Operator cannot) */}
            <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/60 space-y-1.5">
              <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 block">
                Acting as
              </span>
              <div className="flex items-center p-0.5 rounded-lg bg-zinc-950/60 border border-zinc-800/50">
                <button
                  onClick={() => setRole('manager')}
                  className={`flex-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                    role === 'manager' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Manager
                </button>
                <button
                  onClick={() => setRole('operator')}
                  className={`flex-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                    role === 'operator' ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Operator
                </button>
              </div>
              <p className="text-[8.5px] text-zinc-500 leading-tight">
                {role === 'manager' ? 'Can approve & execute governed actions.' : 'Can request actions; approvals need a Manager.'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60 space-y-2">
              <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                <span>Integrations</span>
                <span className="text-amber-400/80 normal-case tracking-normal">Simulated</span>
              </span>
              <div className="grid grid-cols-3 gap-1 text-[9px] font-bold text-center">
                <div className="py-1 px-1 rounded bg-zinc-800/40 border border-zinc-700/40 text-zinc-400" title="Simulated for demo — no live connection">
                  Shopify
                </div>
                <div className="py-1 px-1 rounded bg-zinc-800/40 border border-zinc-700/40 text-zinc-400" title="Simulated for demo — no live connection">
                  Stripe
                </div>
                <div className="py-1 px-1 rounded bg-zinc-800/40 border border-zinc-700/40 text-zinc-400" title="Simulated for demo — no live connection">
                  Zendesk
                </div>
              </div>
              
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="w-full py-1.5 mt-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-[10px] font-bold text-white transition-all flex items-center justify-center gap-1.5 shadow shadow-purple-600/10 cursor-pointer disabled:opacity-50"
              >
                {generateMutation.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>⚡ Generate Store Data</span>
              </button>
            </div>
            <div className="text-[9px] text-zinc-500 text-center font-medium pt-1">
              OpsPilot MVP • Governance Mode
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70" title="Shopify (simulated)" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70" title="Stripe (simulated)" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70" title="Zendesk (simulated)" />
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-purple-400 mt-2 hover:text-purple-300 transition-colors cursor-pointer"
              title="⚡ Generate Store Data"
            >
              {generateMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
