'use client';

import { useState } from 'react';
import { ChevronDown, MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/components/Providers';
import { summarizeOperations, type OverviewMetrics } from '@/lib/dashboard/summary';
import Link from 'next/link';

export default function WorkflowHUD() {
  const [showOverview, setShowOverview] = useState(false);
  const { activeWorkflow, isChatOpen, setIsChatOpen } = useWorkspace();
  const { data, isLoading, isError, refetch } = useQuery<{ metrics: OverviewMetrics }>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to fetch dashboard');
      return res.json();
    },
    retry: false, // Polling and the explicit Retry control handle read recovery.
    refetchInterval: 3000,
  });
  const summary = isError ? null : summarizeOperations(data?.metrics);
  const status = isError ? 'Overview unavailable' : isLoading ? 'Loading overview…' : summary?.status ?? 'Overview unavailable';
  const metrics = summary?.metrics;
  const workflowActive = Boolean(activeWorkflow?.activeObjectType);
  const wfType = activeWorkflow?.activeObjectType;
  const steps = wfType === 'ticket' ? ['draft', 'completed'] : ['draft', 'review', 'approval_required', 'completed'];
  const activeIndex = steps.indexOf(activeWorkflow?.workflowState ?? '');

  return (
    <div className="w-full bg-zinc-900 border-b border-zinc-800 px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3 z-40">
      <div className="min-w-0 flex-1">
        {workflowActive ? (
          <div className="space-y-2 text-xs">
            <p className="text-zinc-200 font-semibold break-words">Active {wfType} workflow: {activeWorkflow?.activeObjectId}</p>
            <ol aria-label="Workflow progress" className="flex flex-wrap gap-2 text-[10px]">
              {steps.map((step, index) => <li key={step} aria-current={index === activeIndex ? 'step' : undefined} className={index === activeIndex ? 'text-blue-400' : 'text-zinc-400'}>{index + 1}. {step === 'approval_required' ? 'Approval required' : step === 'completed' ? 'Completed' : step === 'draft' ? 'Draft' : 'Review'}</li>)}
            </ol>
            <p className="text-zinc-400">Workflow state: {activeWorkflow?.workflowState}. Check the recorded outcome in Audit Logs.</p>
          </div>
        ) : (
          <div className="relative">
            <button aria-expanded={showOverview} aria-controls="operations-overview" onClick={() => setShowOverview(!showOverview)} onKeyDown={event => { if (event.key === 'Escape') setShowOverview(false); }} className="flex gap-2 items-center text-left text-xs text-zinc-300 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
              <span><span className="block text-zinc-400">Recorded store overview</span><strong className={summary?.alerts.length ? 'text-amber-400' : 'text-zinc-200'}>{status}</strong></span><ChevronDown className="w-3 h-3" aria-hidden="true" />
            </button>
            {showOverview && <div id="operations-overview" className="absolute left-0 mt-3 w-64 max-w-[calc(100vw-6rem)] rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl z-50 text-xs space-y-3" onKeyDown={event => { if (event.key === 'Escape') setShowOverview(false); }}>
              <p className="text-zinc-400">Counts from recorded demo data. No SLA or vendor service health is measured.</p>
              {summary ? summary.alerts.length ? summary.alerts.map(alert => <Link key={alert.href} href={alert.href} onClick={() => setShowOverview(false)} className="block text-amber-400 underline underline-offset-4">{alert.count} {alert.label.toLowerCase()}</Link>) : <p className="text-zinc-300">No delayed shipments, low-stock products, or pending approvals.</p> : <><p className="text-zinc-400">{status}</p>{!isLoading && <button onClick={() => void refetch()} className="text-blue-400 underline">Retry overview</button>}</>}
            </div>}
          </div>
        )}
      </div>
      <dl aria-label="Recorded store counts" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-400">
        {[['Orders', metrics?.ordersCount], ['Delayed', metrics?.delayedShipmentsCount], ['Low stock', metrics?.lowStockCount], ['Approvals', metrics?.pendingApprovalsCount]].map(([label, value]) => <div key={label} className="flex gap-1"><dt>{label}:</dt><dd className="font-mono font-semibold text-zinc-200">{value ?? '—'}</dd></div>)}
      </dl>
      <button aria-expanded={isChatOpen} onClick={() => setIsChatOpen(!isChatOpen)} className="px-3 py-2 rounded-lg border border-zinc-700 text-xs font-semibold text-blue-400 flex gap-2 items-center hover:bg-zinc-800"><MessageSquare className="w-4 h-4" aria-hidden="true" />Operations Assistant</button>
    </div>
  );
}
