'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, ChevronDown, MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/components/Providers';
import Link from 'next/link';

export default function WorkflowHUD() {
  const [revenue, setRevenue] = useState(84000);
  const [showHealthDropdown, setShowHealthDropdown] = useState(false);
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);

  const { 
    activeWorkflow,
    isChatOpen,
    setIsChatOpen
  } = useWorkspace();

  // Fetch real-time dashboard telemetry
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to fetch dashboard telemetry');
      return res.json();
    },
    refetchInterval: 3000,
  });

  const dbOrders = data?.metrics?.ordersCount || 0;
  const dbPendingApprovals = data?.metrics?.pendingApprovalsCount || 0;
  const dbLowStock = data?.metrics?.lowStockCount || 0;

  // Compute live values anchored to DB status but fluctuating to feel alive
  const ordersToday = 142 + dbOrders;
  const pendingApprovalsToday = dbPendingApprovals;
  const lowStockToday = 8 + dbLowStock;
  const revenueToday = 84000 + (dbOrders * 1250) + (revenue - 84000);

  // Fluctuate stats slightly to make the panel feel alive in real time
  useEffect(() => {
    const interval = setInterval(() => {
      setRevenue(r => r + Math.floor(Math.random() * 250) - 80);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Determine stepper steps for active workflow HUD
  const isWfActive = activeWorkflow && activeWorkflow.activeObjectType;
  const wfType = activeWorkflow?.activeObjectType;
  const wfState = activeWorkflow?.workflowState;
  const wfId = activeWorkflow?.activeObjectId;

  const steps = wfType === 'discount' 
    ? [
        { key: 'draft', label: 'Draft' },
        { key: 'review', label: 'Review' },
        { key: 'approval_required', label: 'Approvals' },
        { key: 'completed', label: 'Active' }
      ]
    : wfType === 'inventory'
    ? [
        { key: 'draft', label: 'Draft' },
        { key: 'review', label: 'Review' },
        { key: 'approval_required', label: 'Approvals' },
        { key: 'completed', label: 'Synced' }
      ]
    : wfType === 'ticket'
    ? [
        { key: 'draft', label: 'Review' },
        { key: 'completed', label: 'Resolved' }
      ]
    : [
        { key: 'draft', label: 'Draft' },
        { key: 'review', label: 'Review' },
        { key: 'approval_required', label: 'Approvals' },
        { key: 'completed', label: 'Refunded' }
      ];

  const activeIdx = steps.findIndex(s => s.key === wfState);

  return (
    <div className="w-full bg-zinc-900 border-b border-zinc-800 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 z-40 sticky top-0 shadow-sm">
      
      {/* 1. Left Section: Active Workflow Stepper OR Idle Monitor */}
      <div className="flex-1 min-w-[320px] flex items-center gap-4 relative">
        {isWfActive ? (
          <div className="flex items-center gap-4 w-full animate-in slide-in-from-left duration-300">
            <div className="shrink-0 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block leading-none">
                  Active Workflow
                </span>
                <span className="text-xs font-bold text-zinc-100 tracking-tight">
                  {wfType === 'discount' ? `Promo: ${wfId}` : 
                   wfType === 'refund' ? `Refund: ${wfId}` :
                   wfType === 'inventory' ? `Restock: ${wfId}` :
                   `Support: ${wfId}`}
                </span>
              </div>
            </div>

            {/* Micro horizontal stepper */}
            <div className="flex items-center flex-1 max-w-[280px] bg-zinc-950/40 rounded-lg px-2 py-1 border border-zinc-800">
              {steps.map((step, idx) => {
                const isPassed = idx < activeIdx;
                const isCurrent = idx === activeIdx;
                return (
                  <React.Fragment key={step.key}>
                    <div className="flex items-center gap-1 shrink-0">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border transition-all ${
                        isPassed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                        isCurrent ? 'bg-blue-600 border-blue-500 text-white' :
                        'bg-zinc-900 border-zinc-800 text-zinc-500'
                      }`}>
                        {isPassed ? '✓' : idx + 1}
                      </div>
                      <span className={`text-[8px] font-bold tracking-tight whitespace-nowrap ${
                        isCurrent ? 'text-blue-400 font-semibold' : 
                        isPassed ? 'text-emerald-400' : 
                        'text-zinc-500'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className={`flex-1 min-w-[2px] h-[1px] mx-1 ${
                        idx < activeIdx ? 'bg-emerald-500/30' : 'bg-zinc-800'
                      }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setShowHealthDropdown(!showHealthDropdown)}
              className="flex items-center gap-3 animate-in fade-in duration-300 cursor-pointer text-left focus:outline-none group"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block leading-none flex items-center gap-1 group-hover:text-zinc-300">
                  <span>System Status</span>
                  <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
                </span>
                <span className="text-[9px] text-zinc-400 font-medium uppercase tracking-wider block mt-0.5">
                  Store Operations Health: <strong className="text-emerald-400">Normal (100% SLA)</strong>
                </span>
              </div>
            </button>

            {showHealthDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowHealthDropdown(false)} />
                <div className="absolute left-0 mt-2 w-64 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-3">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-300 block pb-1.5 border-b border-zinc-800">
                    Active Operational Services
                  </span>
                  <div className="space-y-2 text-[10px] text-zinc-400">
                    <div className="flex justify-between items-center">
                      <span>Coordinator Service</span>
                      <span className="text-emerald-400 font-bold">● ONLINE</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Refund Operations Service</span>
                      <span className="text-emerald-400 font-bold">● ONLINE</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Inventory Sync Service</span>
                      <span className="text-emerald-400 font-bold">● ONLINE</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Support Dispatcher Service</span>
                      <span className="text-emerald-400 font-bold">● ONLINE</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 2. Middle Section: Risk Alerts Dropdown */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Risk Alerts Button */}
        <div className="relative">
          <button
            onClick={() => {
              setShowAlertsDropdown(!showAlertsDropdown);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/80 text-[10px] text-amber-400 font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>2 Alerts</span>
            <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${showAlertsDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showAlertsDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowAlertsDropdown(false)} />
              <div className="absolute right-0 mt-2 w-72 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-2">
                <span className="text-[9px] font-bold uppercase tracking-wider text-rose-400 block pb-1 border-b border-zinc-800">
                  Active Operations Warnings
                </span>
                <div className="space-y-2 text-[10px] leading-relaxed">
                  <Link 
                    href="/refunds?ticket=TKT-003"
                    onClick={() => setShowAlertsDropdown(false)}
                    className="block p-2 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                  >
                    <span className="font-semibold block flex items-center justify-between">
                      <span>⚠️ High Refund Rate Warning</span>
                      <span className="text-[8px] bg-rose-500/10 text-rose-400 px-1.5 py-0.25 rounded font-mono">RESOLVE</span>
                    </span>
                    <span className="text-zinc-400 text-[9px] mt-0.5 block">Alice Smith submitted 3 refunds in last 24h. Velocity alert.</span>
                  </Link>
                  <Link 
                    href="/inventory"
                    onClick={() => setShowAlertsDropdown(false)}
                    className="block p-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer"
                  >
                    <span className="font-semibold block flex items-center justify-between">
                      <span>⚠️ Mismapped Supplier CSV</span>
                      <span className="text-[8px] bg-amber-500/10 text-amber-400 px-1.5 py-0.25 rounded font-mono">RESOLVE</span>
                    </span>
                    <span className="text-zinc-400 text-[9px] mt-0.5 block">Price variations detected on 4 catalog entries.</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. Right Section: High-Density Telemetry HUD & AI Copilot Toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-4 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3.5 py-1.5 text-[10px] text-zinc-400">
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 font-medium">Revenue:</span>
            <span className="font-bold text-zinc-200 font-mono">₹{Math.floor(revenueToday / 1000)}k</span>
          </div>
          <div className="h-3 w-[1px] bg-zinc-800" />
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 font-medium">Orders:</span>
            <span className="font-bold text-zinc-200 font-mono">{ordersToday}</span>
          </div>
          <div className="h-3 w-[1px] bg-zinc-800" />
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 font-medium">Low Stock:</span>
            <span className={`font-bold font-mono ${lowStockToday > 10 ? 'text-amber-400' : 'text-zinc-200'}`}>
              {lowStockToday}
            </span>
          </div>
          <div className="h-3 w-[1px] bg-zinc-800" />
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 font-medium">Approvals:</span>
            <span className={`font-bold font-mono ${pendingApprovalsToday > 0 ? 'text-rose-400 font-bold' : 'text-zinc-200'}`}>
              {pendingApprovalsToday}
            </span>
          </div>
        </div>

        {/* Operations Copilot Toggle Button */}
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`px-3 py-1.5 rounded-lg border text-[10px] font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm ${
            isChatOpen
              ? 'bg-blue-600/10 border-blue-500/30 text-blue-400'
              : 'bg-zinc-850 border-zinc-700/80 text-zinc-300 hover:text-white hover:bg-zinc-800'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Operations Assistant</span>
        </button>
      </div>

    </div>
  );
}
