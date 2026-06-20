'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, ShieldCheck, CheckCircle2, AlertCircle, Info, Database, ShoppingBag, ArrowUpRight, Tag, Download } from 'lucide-react';
import Link from 'next/link';

interface ExecutionEvent {
  id: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
  timestamp: string;
}

interface Execution {
  id: string;
  type: 'INVENTORY_UPDATE' | 'REFUND_REQUEST' | 'DISCOUNT_CREATION';
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  events: ExecutionEvent[];
  approval: {
    id: string;
    approvedBy: string | null;
  } | null;
}

export default function TimelinePage() {
  const { data, isLoading, error } = useQuery<{ executions: Execution[] }>({
    queryKey: ['timeline'],
    queryFn: async () => {
      const res = await fetch('/api/timeline');
      if (!res.ok) throw new Error('Failed to fetch execution timeline');
      return res.json();
    },
    refetchInterval: 2500, // Poll very fast for real-time demo feel!
  });

  const executions = data?.executions || [];

  // Export the full audit trail (one row per event) as a CSV — the tangible
  // governance artifact a reviewer/auditor can take away.
  const exportAuditCsv = () => {
    const esc = (v: string | null | undefined) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Execution ID', 'Type', 'Status', 'Started At', 'Completed At', 'Approved By', 'Event Time', 'Event Type', 'Event Message'];
    const rows: string[] = [header.join(',')];
    for (const exec of executions) {
      const base = [exec.id, exec.type, exec.status, exec.startedAt, exec.completedAt ?? '', exec.approval?.approvedBy ?? ''];
      if (exec.events.length === 0) {
        rows.push([...base, '', '', ''].map(esc).join(','));
      } else {
        for (const ev of exec.events) {
          rows.push([...base, ev.timestamp, ev.type, ev.message].map(esc).join(','));
        }
      }
    }
    const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `opspilot_audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'SUCCESS':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'ERROR':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case 'WARNING':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      default:
        return <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">Timeline Tracker</h2>
          <p className="text-xs text-zinc-400 mt-1">Audit log of system executions and governance verification events.</p>
        </div>
        <button
          onClick={exportAuditCsv}
          disabled={executions.length === 0}
          className="self-start px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-purple-300 hover:text-purple-200 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download className="w-4 h-4" />
          <span>Export Audit Log (CSV)</span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-zinc-500 text-xs">Loading execution logs...</div>
      ) : error ? (
        <div className="p-8 text-center text-zinc-500 text-xs flex flex-col items-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mb-2" />
          <span>Error loading execution history.</span>
        </div>
      ) : executions.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/10 p-16 text-center text-zinc-500 max-w-xl flex flex-col items-center justify-center">
          <Clock className="w-10 h-10 text-zinc-500/20 mb-2" />
          <h4 className="text-xs font-bold text-zinc-300">No Executions Registered</h4>
          <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
            Submit mappings or refund requests and approve them to trigger background workflows and record audit timelines.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {executions.map((exec) => {
            const isSuccess = exec.status === 'SUCCESS';
            const isFailed = exec.status === 'FAILED';
            const isInProgress = exec.status === 'IN_PROGRESS';
            
            return (
              <div
                key={exec.id}
                className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 glass flex flex-col space-y-5"
              >
                {/* Execution Header info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                      exec.type === 'INVENTORY_UPDATE'
                        ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                        : exec.type === 'DISCOUNT_CREATION'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        : 'bg-sky-500/10 border-sky-500/20 text-sky-400'
                    }`}>
                      {exec.type === 'INVENTORY_UPDATE' ? (
                        <Database className="w-4.5 h-4.5" />
                      ) : exec.type === 'DISCOUNT_CREATION' ? (
                        <Tag className="w-4.5 h-4.5" />
                      ) : (
                        <ShoppingBag className="w-4.5 h-4.5" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-200">
                        {exec.type === 'INVENTORY_UPDATE' 
                          ? 'Inventory Synchronization' 
                          : exec.type === 'DISCOUNT_CREATION'
                          ? 'Promo Discount Synchronization'
                          : 'Refund Transaction Settlement'}
                      </h4>
                      <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>ID: <span className="font-mono text-zinc-400">{exec.id.substring(0, 8)}...</span></span>
                        <span>•</span>
                        <span>Approved by: **{exec.approval?.approvedBy || 'Manager'}**</span>
                        <span>•</span>
                        <span>Started: {new Date(exec.startedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>

                  <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                    isSuccess
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : isFailed
                      ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                      : 'bg-purple-500/10 border border-purple-500/20 text-purple-400 animate-pulse'
                  }`}>
                    {exec.status}
                  </span>
                </div>

                {/* Vertical events trace */}
                <div className="pl-4 space-y-5 relative before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-[1px] before:bg-zinc-800">
                  {exec.events.map((event) => (
                    <div key={event.id} className="flex items-start gap-4 relative">
                      {/* Node Indicator dot */}
                      <div className={`w-3.5 h-3.5 rounded-full border bg-zinc-950 flex items-center justify-center shrink-0 z-10 -ml-1.5 ${
                        event.type === 'SUCCESS'
                          ? 'border-emerald-500/60 shadow-[0_0_8px_rgba(16,185,129,0.3)] bg-emerald-950/20'
                          : event.type === 'ERROR'
                          ? 'border-rose-500/60 shadow-[0_0_8px_rgba(244,63,94,0.3)] bg-rose-950/20'
                          : event.type === 'WARNING'
                          ? 'border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.3)] bg-amber-950/20'
                          : 'border-purple-500/60 bg-purple-950/20'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          event.type === 'SUCCESS'
                            ? 'bg-emerald-400'
                            : event.type === 'ERROR'
                            ? 'bg-rose-400'
                            : event.type === 'WARNING'
                            ? 'bg-amber-400'
                            : 'bg-purple-400'
                        }`} />
                      </div>

                      {/* Event Details */}
                      <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="text-xs text-zinc-300 font-medium leading-relaxed">
                          {event.message}
                        </span>
                        <span className="text-[9px] text-zinc-500 font-mono">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
