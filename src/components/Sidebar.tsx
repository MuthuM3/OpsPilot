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
  RefreshCw
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const { activeChatId, setActiveChatId, isChatOpen, setIsChatOpen, showToast } = useWorkspace();
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);

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
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Inventory Agent', href: '/inventory', icon: Database },
    { name: 'Refunds Agent', href: '/refunds', icon: RotateCcw },
    { name: 'Approvals Hub', href: '/approvals', icon: ShieldCheck },
    { name: 'Timeline Tracker', href: '/timeline', icon: Clock },
  ];

  const chatSessions = [
    { id: 'refund-flow', title: 'Refund Order #ORD-1024', mode: 'agent' },
    { id: 'inventory-flow', title: 'Inventory Normalization', mode: 'agent' },
    { id: 'support-flow', title: 'Shipment Status Query', mode: 'ask' }
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
              {/* Header Toggle */}
              <button
                onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                className="w-full flex items-center justify-between px-3 text-[9px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
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
                  {chatSessions.map((session) => {
                    const isSelected = activeChatId === session.id;
                    return (
                      <button
                        key={session.id}
                        onClick={() => {
                          setActiveChatId(session.id);
                          setIsChatOpen(true);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all duration-150 truncate ${
                          isSelected
                            ? 'bg-zinc-900 border border-zinc-800 text-purple-300 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30 border border-transparent'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <span className="truncate text-[10px]">{session.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 pt-2 border-t border-zinc-800/40">
              {chatSessions.map((session) => {
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
            <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60 space-y-2">
              <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 block">
                Connected Systems
              </span>
              <div className="grid grid-cols-3 gap-1 text-[9px] font-bold text-center">
                <div className="py-1 px-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  Shopify
                </div>
                <div className="py-1 px-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  Stripe
                </div>
                <div className="py-1 px-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
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
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Shopify Connected" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Stripe Connected" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Zendesk Connected" />
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
