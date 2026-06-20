'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Check, X, AlertCircle, ShoppingBag, Database, ArrowRight, AlertTriangle, ArrowUpRight, Tag, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useWorkspace } from '@/components/Providers';

interface Approval {
  id: string;
  type: 'INVENTORY_UPDATE' | 'REFUND_REQUEST' | 'DISCOUNT_CREATION';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  approvedBy: string | null;
  reason: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useWorkspace();
  const [rejectingApprovalId, setRejectingApprovalId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Local state for animating checklist items when approved
  const [executingApprovals, setExecutingApprovals] = useState<Record<string, { 
    currentStep: number; 
    status: 'EXECUTING' | 'SUCCESS' | 'FAILED'; 
    steps: string[]; 
    error?: string; 
  }>>({});

  // Fetch all approvals
  const { data: approvalsData, isLoading } = useQuery<{ approvals: Approval[] }>({
    queryKey: ['approvals'],
    queryFn: async () => {
      const allRes = await fetch('/api/approvals');
      if (!allRes.ok) throw new Error('Failed to fetch approvals');
      return allRes.json();
    },
    refetchInterval: 3000 // Poll for fast updates
  });

  // Mutation to approve request
  const approveMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      const res = await fetch('/api/approvals/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to approve request');
      }
      return res.json();
    }
  });

  // Mutation to reject request
  const rejectMutation = useMutation({
    mutationFn: async (payload: { approvalId: string; reason: string }) => {
      const res = await fetch('/api/approvals/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to reject request');
      }
      return res.json();
    },
    onSuccess: () => {
      setRejectingApprovalId(null);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });

  const getStepsForType = (type: 'INVENTORY_UPDATE' | 'REFUND_REQUEST' | 'DISCOUNT_CREATION') => {
    switch (type) {
      case 'INVENTORY_UPDATE':
        return [
          'Verify Supplier CSV Schema',
          'Evaluate Modified SKU Delta',
          'Execute Atomic Database Upsert Transactions',
          'Notify Shopify Fulfillment Webhooks'
        ];
      case 'REFUND_REQUEST':
        return [
          'Validate Order Transaction Details',
          'Run Refund Velocity Limit Check',
          'Settle Payout Transaction with Gateway API',
          'Update Shopify Customer Order Ledger'
        ];
      case 'DISCOUNT_CREATION':
        return [
          'Verify Campaign Promo Parameters',
          'Audit Rule Constraints (Max Discount Check)',
          'Deploy Coupon Rule to Frontends',
          'Synchronize Marketing Analytics Channels'
        ];
      default:
        return ['Validating Request', 'Evaluating Constraints', 'Applying Changes', 'Syncing Integrations'];
    }
  };

  const handleApprove = async (approval: Approval) => {
    const id = approval.id;
    const steps = getStepsForType(approval.type);
    
    // Initialize executing state
    setExecutingApprovals(prev => ({
      ...prev,
      [id]: { currentStep: 0, status: 'EXECUTING', steps }
    }));

    // Start simulation timer for progress steps
    let currentIdx = 0;
    const interval = setInterval(() => {
      currentIdx++;
      setExecutingApprovals(prev => {
        if (!prev[id] || prev[id].status !== 'EXECUTING') return prev;
        return {
          ...prev,
          [id]: { 
            ...prev[id], 
            currentStep: Math.min(currentIdx, steps.length - 1) 
          }
        };
      });
    }, 600);

    try {
      await approveMutation.mutateAsync(id);
      
      // Stop timer and set success status
      clearInterval(interval);
      setExecutingApprovals(prev => ({
        ...prev,
        [id]: { ...prev[id], currentStep: steps.length, status: 'SUCCESS' }
      }));
      
      showToast(
        approval.type === 'REFUND_REQUEST' 
          ? `Refund request of ₹${(approval.metadata as any).amount?.toLocaleString('en-IN')} approved and settled successfully.`
          : approval.type === 'DISCOUNT_CREATION'
          ? `Discount code ${(approval.metadata as any).code} created successfully.`
          : 'Inventory updates successfully applied and synced.', 
        'success'
      );

      // Keep success state visible for 1.8 seconds before refetching/invalidating
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        queryClient.invalidateQueries({ queryKey: ['timeline'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        
        // Remove from executing list
        setExecutingApprovals(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 1800);

    } catch (err: any) {
      clearInterval(interval);
      const errMsg = err.message || 'Approval execution failed';
      setExecutingApprovals(prev => ({
        ...prev,
        [id]: { ...prev[id], status: 'FAILED', error: errMsg }
      }));
      showToast(errMsg, 'error');
    }
  };

  const handleOpenReject = (id: string) => {
    setRejectingApprovalId(id);
    setRejectionReason('Policy threshold mismatch or unverified details.');
  };

  const handleReject = async () => {
    if (!rejectingApprovalId) return;
    const id = rejectingApprovalId;
    
    // Find the approval type and info to show detailed toast
    const approval = approvals.find(a => a.id === id);
    const typeLabel = approval 
      ? (approval.type === 'REFUND_REQUEST' ? 'Refund request' : approval.type === 'DISCOUNT_CREATION' ? 'Discount creation' : 'Inventory update')
      : 'Request';

    try {
      await rejectMutation.mutateAsync({
        approvalId: id,
        reason: rejectionReason
      });
      
      showToast(`${typeLabel} has been rejected.`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to reject request', 'error');
    }
  };

  const approvals = approvalsData?.approvals || [];
  const pendingApprovals = approvals.filter(a => a.status === 'PENDING');
  const pastApprovals = approvals.filter(a => a.status !== 'PENDING');

  // Page-wide loading state while mutations are running (to disable other cards' inputs globally)
  const isAnyCardMutating = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">Approvals Hub</h2>
        <p className="text-xs text-zinc-400 mt-1">Review operational actions flagged by governance policy checks before execution.</p>
      </div>

      {/* Pending Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <ShieldCheck className="w-4.5 h-4.5 text-emerald-400" />
          <span>Active Pending Review Queue ({pendingApprovals.length})</span>
        </h3>

        {isLoading ? (
          <div className="py-12 text-center text-zinc-500 text-xs flex justify-center items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
            <span>Loading queue...</span>
          </div>
        ) : pendingApprovals.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/10 p-12 text-center text-zinc-500 max-w-xl flex flex-col items-center justify-center">
            <ShieldCheck className="w-10 h-10 text-emerald-500/20 mb-2" />
            <h4 className="text-xs font-bold text-zinc-300">Queue is Clear</h4>
            <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
              All transactions have cleared governance bounds. No operational tasks require manual manager oversight.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {pendingApprovals.map((a) => {
              const meta = a.metadata as any;
              const executionState = executingApprovals[a.id];

              // If this card is currently running inline execution animation
              if (executionState) {
                return (
                  <div
                    key={a.id}
                    className={`rounded-2xl border bg-[#0f1422]/60 p-6 glass flex flex-col space-y-6 transition-all duration-500 ${
                      executionState.status === 'SUCCESS'
                        ? 'border-emerald-550/40 bg-emerald-950/10 shadow-[0_10px_30px_-10px_rgba(16,185,129,0.15)] animate-pulse'
                        : executionState.status === 'FAILED'
                        ? 'border-rose-550/40 bg-rose-950/10 shadow-[0_10px_30px_-10px_rgba(244,63,94,0.15)]'
                        : 'border-purple-500/30 shadow-[0_10px_30px_-10px_rgba(168,85,247,0.05)]'
                    }`}
                  >
                    {/* Running Header Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors duration-300 ${
                          executionState.status === 'SUCCESS'
                            ? 'bg-emerald-500/10 border-emerald-550/30 text-emerald-450'
                            : executionState.status === 'FAILED'
                            ? 'bg-rose-500/10 border-rose-550/30 text-rose-450'
                            : 'bg-purple-500/10 border-purple-500/30 text-purple-400 animate-pulse'
                        }`}>
                          {executionState.status === 'SUCCESS' ? (
                            <Check className="w-5 h-5" />
                          ) : executionState.status === 'FAILED' ? (
                            <X className="w-5 h-5" />
                          ) : (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-200">
                            {a.type === 'INVENTORY_UPDATE'
                              ? `Syncing Inventory (${meta.filename})`
                              : a.type === 'DISCOUNT_CREATION'
                              ? `Deploying Coupon Code ${meta.code}`
                              : `Settling Refund for Order #${meta.orderNumber}`}
                          </h4>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            Approval ID: <span className="font-mono text-zinc-400">#{a.id}</span>
                          </p>
                        </div>
                      </div>
                      <span className={`text-[9px] px-2.5 py-0.5 border rounded font-bold uppercase tracking-wide transition-all ${
                        executionState.status === 'SUCCESS'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : executionState.status === 'FAILED'
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-455'
                          : 'bg-purple-500/15 border-purple-500/30 text-purple-400 animate-pulse'
                      }`}>
                        {executionState.status === 'SUCCESS'
                          ? 'Success'
                          : executionState.status === 'FAILED'
                          ? 'Failed'
                          : 'Executing Action'}
                      </span>
                    </div>

                    {/* Steps Checklist */}
                    <div className="space-y-3.5 max-w-lg">
                      {executionState.steps.map((step, idx) => {
                        const isPending = idx > executionState.currentStep;
                        const isRunning = idx === executionState.currentStep && executionState.status === 'EXECUTING';
                        const isCompleted = idx < executionState.currentStep || (idx === executionState.currentStep && executionState.status === 'SUCCESS');

                        return (
                          <div
                            key={idx}
                            className={`text-xs flex items-center justify-between transition-all duration-300 ${
                              isPending ? 'text-zinc-600 opacity-40' : isRunning ? 'text-purple-400 font-semibold' : 'text-zinc-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {isPending ? (
                                <div className="h-4 w-4 rounded border border-zinc-800 shrink-0 flex items-center justify-center text-[8px] text-zinc-600">□</div>
                              ) : isRunning ? (
                                <Loader2 className="w-4 h-4 animate-spin text-purple-450 shrink-0" />
                              ) : isCompleted ? (
                                <div className="w-4 h-4 rounded-full bg-emerald-550/15 border border-emerald-550/30 flex items-center justify-center shrink-0">
                                  <Check className="w-2.5 h-2.5 text-emerald-450" />
                                </div>
                              ) : (
                                // Execution failed on or before this step
                                <div className="w-4 h-4 rounded-full bg-rose-550/15 border border-rose-550/30 flex items-center justify-center shrink-0">
                                  <X className="w-2.5 h-2.5 text-rose-455" />
                                </div>
                              )}
                              <span className={isRunning ? 'animate-pulse' : ''}>{step}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Failure details / Retry Option */}
                    {executionState.status === 'FAILED' && (
                      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-3 animate-in slide-in-from-top-1">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                          <div className="text-[11px] text-zinc-300">
                            <span className="font-bold text-rose-405 block mb-0.5">Execution Error:</span>
                            <p className="italic text-zinc-400">"{executionState.error}"</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              // Cancel execution state and revert to normal card view
                              setExecutingApprovals(prev => {
                                const next = { ...prev };
                                delete next[a.id];
                                return next;
                              });
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[10.5px] font-bold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                          >
                            Dismiss
                          </button>
                          <button
                            onClick={() => handleApprove(a)}
                            className="px-3.5 py-1.5 rounded-lg bg-purple-650 hover:bg-purple-600 text-[10.5px] font-bold text-white transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <span>Retry Execution</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // Normal Card View
              const isThisApproving = approveMutation.isPending && approveMutation.variables === a.id;
              const isThisRejecting = rejectMutation.isPending && rejectMutation.variables?.approvalId === a.id;
              const isCurrentCardMutating = isThisApproving || isThisRejecting;

              return (
                <div
                  key={a.id}
                  className={`rounded-2xl border bg-[#0f1422]/60 p-6 glass flex flex-col space-y-6 transition-all duration-300 ${
                    isCurrentCardMutating ? 'opacity-70 border-purple-500/25 pointer-events-none' : 'border-zinc-800/80'
                  }`}
                >
                  {/* Approval Title Banner */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 text-purple-400 animate-pulse">
                        {a.type === 'INVENTORY_UPDATE' ? (
                          <Database className="w-5 h-5" />
                        ) : a.type === 'DISCOUNT_CREATION' ? (
                          <Tag className="w-5 h-5" />
                        ) : (
                          <ShoppingBag className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-200">
                          {a.type === 'INVENTORY_UPDATE'
                            ? `Batch Inventory Update (${meta.filename})`
                            : a.type === 'DISCOUNT_CREATION'
                            ? `Create Promo Code (${meta.code})`
                            : `Refund Request for Order #${meta.orderNumber}`}
                        </h4>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Requested by <span className="font-bold text-zinc-400">{a.requestedBy}</span> • Received {new Date(a.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold uppercase rounded tracking-wide self-start sm:self-center animate-pulse">
                      Pending Manager Review
                    </span>
                  </div>

                  {/* Why Approval Was Required / Metadata Context */}
                  {a.type === 'REFUND_REQUEST' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Risk Analysis Card */}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/20 p-5 space-y-4">
                        <h5 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>Why Approval Was Required</span>
                        </h5>
                        <div className="grid grid-cols-2 gap-4 text-[11px] border-b border-zinc-800/40 pb-4">
                          <div>
                            <span className="text-zinc-500">Refund Amount:</span>
                            <span className="text-zinc-200 font-bold block mt-0.5">
                              ₹{meta.amount?.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Risk Score:</span>
                            <span className="text-rose-455 font-bold block mt-0.5">
                              {meta.riskScore}/100 (HIGH)
                            </span>
                          </div>
                        </div>

                        {/* Detailed Flags */}
                        <div className="space-y-1.5 text-[10px]">
                          <span className="text-zinc-500 font-semibold uppercase tracking-wider block">Risk Analysis Details</span>
                          {meta.reasons?.map((reason: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-1.5 text-zinc-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                              <span>{reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* AI Governance Statement */}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/20 p-5 flex flex-col justify-between">
                        <div className="space-y-3">
                          <h5 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                            <ShieldCheck className="w-4 h-4 text-purple-400" />
                            <span>AI Operations Assessment</span>
                          </h5>
                          <p className="text-[11px] text-zinc-400 leading-relaxed italic bg-zinc-900/20 p-3 rounded-lg border border-zinc-800/40">
                            "{meta.explanation || 'Manual Review Required'}"
                          </p>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-4">
                          Note: Executing this approval submits the payout to settlement systems.
                        </div>
                      </div>
                    </div>
                  ) : a.type === 'DISCOUNT_CREATION' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Risk / Policy Analysis Card */}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/20 p-5 space-y-4">
                        <h5 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>Why Approval Was Required</span>
                        </h5>
                        <div className="grid grid-cols-2 gap-4 text-[11px] border-b border-zinc-800/40 pb-4">
                          <div>
                            <span className="text-zinc-500">Discount Code:</span>
                            <span className="text-zinc-200 font-bold block mt-0.5">
                              {meta.code}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Discount Percentage:</span>
                            <span className="text-rose-455 font-bold block mt-0.5">
                              {meta.discountPercent}% OFF
                            </span>
                          </div>
                        </div>

                        {/* Detailed Flags */}
                        <div className="space-y-1.5 text-[10px]">
                          <span className="text-zinc-500 font-semibold uppercase tracking-wider block">Policy Assessment Details</span>
                          <div className="flex items-center gap-1.5 text-zinc-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                            <span>Discount percentage ({meta.discountPercent}%) exceeds the 20% safe-limit threshold.</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-zinc-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                            <span>Requires manual operational override.</span>
                          </div>
                        </div>
                      </div>

                      {/* AI Governance Statement */}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/20 p-5 flex flex-col justify-between">
                        <div className="space-y-3">
                          <h5 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                            <ShieldCheck className="w-4 h-4 text-purple-400" />
                            <span>AI Operations Assessment</span>
                          </h5>
                          <p className="text-[11px] text-zinc-400 leading-relaxed italic bg-zinc-900/20 p-3 rounded-lg border border-zinc-800/40">
                            "{meta.explanation || 'Campaign promotion coupon created, requires validation check.'}"
                          </p>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-4">
                          Note: Executing this approval deploys the discount code instantly to storefront checkout channels.
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Inventory Update Metadata Diff View */
                    <div className="space-y-4">
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/20 p-5 space-y-4">
                        <h5 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                          <Database className="w-4 h-4 text-purple-400" />
                          <span>Mapped Inventory Changes List ({meta.productCount} SKUs)</span>
                        </h5>
                        
                        <div className="overflow-x-auto border border-zinc-800/60 rounded-lg">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-900 border-b border-zinc-800/80 text-zinc-500 uppercase tracking-wider text-[9px] font-semibold">
                              <tr>
                                <th className="p-3">SKU</th>
                                <th className="p-3">Product Title</th>
                                <th className="p-3 text-right">Proposed Price</th>
                                <th className="p-3 text-right">Proposed Stock</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/30 text-zinc-300">
                              {meta.products?.slice(0, 10).map((p: any, idx: number) => (
                                <tr key={idx}>
                                  <td className="p-3 font-mono text-[10px] text-purple-300">{p.sku}</td>
                                  <td className="p-3 text-zinc-200">{p.name}</td>
                                  <td className="p-3 text-right font-mono text-zinc-400">₹{p.price?.toLocaleString('en-IN')}</td>
                                  <td className="p-3 text-right font-bold text-emerald-450">{p.inventory} units</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {meta.products?.length > 10 && (
                            <div className="p-2.5 text-center text-[10px] text-zinc-500 border-t border-zinc-800/40">
                              + {meta.products.length - 10} more products mapped...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Approve / Reject Controls */}
                  <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between gap-4">
                    <div className="text-[10px] text-zinc-500">
                      Approval ID: <span className="font-mono text-zinc-400">#{a.id}</span>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleOpenReject(a.id)}
                        disabled={isAnyCardMutating}
                        className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-rose-900/30 hover:text-rose-450 text-xs font-semibold text-zinc-400 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {isThisRejecting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Rejecting...</span>
                          </>
                        ) : (
                          <>
                            <X className="w-4 h-4" />
                            <span>Reject Request</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleApprove(a)}
                        disabled={isAnyCardMutating}
                        className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition-all shadow-md shadow-purple-650/10 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {isThisApproving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin animate-infinite duration-1000" />
                            <span>Approving...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Approve & Execute</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past/Processed Section */}
      <div className="space-y-4 pt-4">
        <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
          <span>Processed Approvals History</span>
        </h3>
        
        {pastApprovals.length === 0 ? (
          <div className="text-zinc-650 text-xs italic">No historical approvals.</div>
        ) : (
          <div className="overflow-x-auto border border-zinc-800/50 rounded-xl bg-zinc-900/10 glass">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/50 border-b border-zinc-800/80 text-zinc-500 uppercase tracking-wider text-[9px] font-semibold">
                <tr>
                  <th className="p-3.5">Approval ID</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5">Processor</th>
                  <th className="p-3.5">Review Date</th>
                  <th className="p-3.5">Details</th>
                  <th className="p-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/30 text-zinc-300">
                {pastApprovals.map((a) => (
                  <tr key={a.id} className="hover:bg-zinc-900/10">
                    <td className="p-3.5 font-mono text-[9px] text-zinc-500">#{a.id.substring(0, 8)}</td>
                    <td className="p-3.5 text-zinc-200 font-medium">
                      {a.type === 'INVENTORY_UPDATE' 
                        ? 'Batch Inventory Update' 
                        : a.type === 'DISCOUNT_CREATION'
                        ? 'Discount Code Creation'
                        : 'Order Refund Request'}
                    </td>
                    <td className="p-3.5 text-zinc-400">{a.approvedBy || 'System'}</td>
                    <td className="p-3.5 text-zinc-500">
                      {new Date(a.updatedAt).toLocaleDateString()} {new Date(a.updatedAt).toLocaleTimeString()}
                    </td>
                    <td className="p-3.5 text-zinc-400 truncate max-w-[200px]" title={a.reason || 'Approved'}>
                      {a.status === 'REJECTED' ? `❌ ${a.reason || 'Rejected'}` : '✓ Executed successfully'}
                    </td>
                    <td className="p-3.5 text-right">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          a.status === 'APPROVED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                            : 'bg-rose-500/10 text-rose-455 border border-rose-500/10'
                        }`}
                      >
                        {a.status === 'APPROVED' ? 'APPROVED' : 'REJECTED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectingApprovalId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0b0f19]/90 p-6 shadow-2xl glass flex flex-col space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <AlertTriangle className="w-4.5 h-4.5 text-rose-450" />
                <span>Reject Governance Request</span>
              </h3>
              <button 
                onClick={() => setRejectingApprovalId(null)}
                className="p-1 rounded hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-3">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Rejection Presets</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRejectionReason('Policy threshold mismatch: Amount exceeds manager daily limits.')}
                  className="p-2 text-left rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-purple-500/40 text-[10px] text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer truncate"
                >
                  Limit Threshold Breached
                </button>
                <button
                  type="button"
                  onClick={() => setRejectionReason('Suspicious activity: Customer refund velocity is abnormally high.')}
                  className="p-2 text-left rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-purple-500/40 text-[10px] text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer truncate"
                >
                  High Refund Velocity Alert
                </button>
                <button
                  type="button"
                  onClick={() => setRejectionReason('Supplier CSV format/header validation check failed.')}
                  className="p-2 text-left rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-purple-500/40 text-[10px] text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer truncate"
                >
                  CSV Format Validation Failed
                </button>
                <button
                  type="button"
                  onClick={() => setRejectionReason('Operational cancel: Action rejected by request of finance lead.')}
                  className="p-2 text-left rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-purple-500/40 text-[10px] text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer truncate"
                >
                  Finance Lead Override
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Detailed Explanation</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Specify the reason for governance audit trail..."
                className="w-full h-24 px-3 py-2 bg-zinc-955 border border-zinc-800 rounded-lg text-xs text-zinc-250 placeholder-zinc-650 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all"
              />
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRejectingApprovalId(null)}
                disabled={rejectMutation.isPending}
                className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejectMutation.isPending}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-all shadow-md shadow-rose-600/10 flex items-center gap-1.5 cursor-pointer"
              >
                {rejectMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Rejecting...</span>
                  </>
                ) : (
                  <>
                    <X className="w-3.5 h-3.5" />
                    <span>Reject Request</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
