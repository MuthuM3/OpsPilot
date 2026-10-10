/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useSyncExternalStore } from 'react';
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
  Menu, 
  MessageSquare,
  RefreshCw
} from 'lucide-react';

const subscribeToViewport = (listener: () => void) => {
  const media = window.matchMedia('(max-width: 639px)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
const narrowViewport = () => window.matchMedia('(max-width: 639px)').matches;
const serverViewport = () => false;

export default function Sidebar() {
  const pathname = usePathname();
  const { isChatOpen, setIsChatOpen, showToast, role, setRole } = useWorkspace();

  const isMobile = useSyncExternalStore(subscribeToViewport, narrowViewport, serverViewport);
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null);
  const isCollapsed = collapsedOverride ?? isMobile;

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
      className={`h-full border-r border-zinc-800/80 bg-zinc-950 flex flex-col shrink-0 transition-all duration-300 relative ${
        isCollapsed ? 'w-16' : 'w-64 max-sm:absolute max-sm:inset-y-0 max-sm:left-0 max-sm:z-50'
      }`}
    >
      {/* Brand Header */}
      <div className={`p-4 border-b border-zinc-800/80 flex items-center justify-between gap-2 h-16`}>
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden animate-in fade-in duration-200">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-zinc-100 text-sm tracking-tight">OpsPilot</h1>
              <p className="text-[9px] text-zinc-500 font-semibold tracking-wider uppercase">Store Operations</p>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 mx-auto shadow-sm">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
        )}
        
        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsedOverride(!isCollapsed)}
          className={`p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors ${
            isCollapsed ? 'absolute -right-3 top-4 z-50 bg-zinc-900 border border-zinc-800 rounded-full p-1' : ''
          }`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!isCollapsed}
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
                      ? 'bg-zinc-850 border border-zinc-700/70 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
                  } ${isCollapsed ? 'justify-center' : ''}`}
                  title={item.name}
                  aria-label={item.name}
                  onClick={() => { if (isMobile) setCollapsedOverride(true); }}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-blue-400' : 'text-zinc-500 group-hover:text-zinc-300'
                    }`}
                  />
                  {!isCollapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer Info & Chat Toggle */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950 space-y-2">
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
            isChatOpen
              ? 'bg-blue-600/10 border border-blue-500/30 text-blue-400'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
          } ${isCollapsed ? 'justify-center' : ''}`}
          title={isChatOpen ? "Close Operations Workspace" : "Open Operations Workspace"}
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Operations Assistant</span>}
        </button>

        {!isCollapsed ? (
          <div className="space-y-2 animate-in fade-in duration-200">
            {/* Role switcher — demonstrates governance roles (Manager can approve, Operator cannot) */}
            <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
              <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 block">
                Demo role · no sign-in
              </span>
              <div className="flex items-center p-0.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <button
                  onClick={() => setRole('manager')}
                  className={`flex-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                    role === 'manager' ? 'bg-zinc-800 border border-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Manager
                </button>
                <button
                  onClick={() => setRole('operator')}
                  className={`flex-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                    role === 'operator' ? 'bg-zinc-800 border border-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Operator
                </button>
              </div>
              <p className="text-[8.5px] text-zinc-500 leading-tight">
                {role === 'manager' ? 'Manager chat behavior demo; not authenticated access.' : 'Operator chat behavior demo; not authenticated access.'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
              <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                <span>Integrations</span>
                <span className="text-zinc-400 normal-case tracking-normal">Demo Sandbox</span>
              </span>
              <div className="grid grid-cols-3 gap-1 text-[9px] font-bold text-center">
                <div className="py-1 px-1 rounded bg-zinc-850 border border-zinc-800 text-zinc-400" title="Simulated for demo — no live connection">
                  Shopify
                </div>
                <div className="py-1 px-1 rounded bg-zinc-850 border border-zinc-800 text-zinc-400" title="Simulated for demo — no live connection">
                  Stripe
                </div>
                <div className="py-1 px-1 rounded bg-zinc-850 border border-zinc-800 text-zinc-400" title="Simulated for demo — no live connection">
                  Zendesk
                </div>
              </div>
              
              <button
                onClick={() => { if (window.confirm('Replace all shared demo store records? This clears existing requests and history for every demo visitor.')) generateMutation.mutate(); }}
                disabled={generateMutation.isPending}
                className="w-full py-2 mt-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/80 text-[10px] font-semibold text-zinc-200 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
                <span>Seed Demo Store Data</span>
              </button>
            </div>
            <div className="text-[9px] text-zinc-500 text-center font-medium pt-1">
              OpsPilot • Prototype
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" title="Shopify (simulated)" />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" title="Stripe (simulated)" />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" title="Zendesk (simulated)" />
            <button
              onClick={() => { if (window.confirm('Replace all shared demo store records? This clears existing requests and history for every demo visitor.')) generateMutation.mutate(); }}
              disabled={generateMutation.isPending}
              className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 mt-2 hover:text-zinc-200 transition-colors cursor-pointer"
              title="Seed Demo Store Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
