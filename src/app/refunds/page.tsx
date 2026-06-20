'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, AlertTriangle, ShieldCheck, Check, AlertCircle, ShoppingBag, ArrowRight, User } from 'lucide-react';
import Link from 'next/link';

interface OrderItem {
  id: string;
  price: string;
  quantity: number;
  product: {
    name: string;
  };
}

interface Order {
  id: string;
  orderNumber: string;
  totalAmount: string;
  status: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    email: string;
  };
  items: OrderItem[];
  refunds: any[];
}

interface Refund {
  id: string;
  amount: string;
  reason: string;
  status: string;
  riskScore: number;
  riskExplanation: string | null;
  createdAt: string;
  order: {
    orderNumber: string;
    customer: {
      name: string;
    };
  };
}

export default function RefundsPage() {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('Defective item returned');
  const [successInfo, setSuccessInfo] = useState<any | null>(null);

  // Fetch orders
  const { data: ordersData, isLoading: isOrdersLoading } = useQuery<{ orders: Order[] }>({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await fetch('/api/orders');
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    }
  });

  // Fetch past refunds
  const { data: refundsData, isLoading: isRefundsLoading } = useQuery<{ refunds: Refund[] }>({
    queryKey: ['refunds'],
    queryFn: async () => {
      const res = await fetch('/api/refunds');
      if (!res.ok) throw new Error('Failed to fetch refunds');
      return res.json();
    },
    refetchInterval: 3000 // Poll for fast updates
  });

  // Mutation to request refund
  const requestRefundMutation = useMutation({
    mutationFn: async (payload: { orderId: string; amount: number; reason: string }) => {
      const res = await fetch('/api/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit refund');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSuccessInfo(data);
      setSelectedOrder(null);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });

  const handleOpenRefundModal = (order: Order) => {
    setSelectedOrder(order);
    setRefundReason('Defective item returned');
    setSuccessInfo(null);
  };

  const handleCloseRefundModal = () => {
    setSelectedOrder(null);
  };

  const handleSubmitRefund = () => {
    if (!selectedOrder) return;
    requestRefundMutation.mutate({
      orderId: selectedOrder.id,
      amount: Number(selectedOrder.totalAmount),
      reason: refundReason
    });
  };

  // Quick risk simulation check for the selected order
  const getSimulatedRiskInfo = (orderNumber: string, amountVal: number) => {
    const isAliceHighRisk = orderNumber === 'ORD-1024' || orderNumber === 'ORD-1023';
    const amount = Number(amountVal);
    
    let score = 10;
    const rules = [];

    if (amount > 10000) {
      score += 40;
      rules.push('Refund amount exceeds ₹10,000 threshold (+40)');
    }
    if (isAliceHighRisk) {
      score += 35; // Alice has 3 previous refunds
      rules.push('Frequent refund customer history (+35)');
      score += 15; // Alice has open ticket TKT-003
      rules.push('Active open support ticket dispute (+15)');
    }

    score = Math.min(100, score);
    const requiresApproval = score > 50 || amount > 10000;

    return { score, requiresApproval, rules };
  };

  const orders = ordersData?.orders || [];
  const refunds = refundsData?.refunds || [];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">Refunds Agent</h2>
        <p className="text-xs text-zinc-400 mt-1">Initiate and monitor customer refund requests governed by automatic risk evaluation.</p>
      </div>

      {/* Success Notification Banner */}
      {successInfo && (
        <div className="p-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-200">
                Refund Request Successfully Submitted
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                Order **#{successInfo.refund?.order?.orderNumber || ''}** refund request has been registered in state: **{successInfo.refund?.status}**.
                {successInfo.status === 'PENDING' && ' ⚠️ Action blocked by governance policy checks, pending manager approval.'}
              </p>
            </div>
          </div>
          {successInfo.status === 'PENDING' && (
            <Link
              href="/approvals"
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition-all flex items-center gap-1.5 self-start sm:self-center"
            >
              <span>Go to Approvals Hub</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      )}

      {/* Grid of completed orders */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 glass space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200 pb-4 border-b border-zinc-800/80 flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-purple-400" />
          <span>Completed Orders Eligible for Refund</span>
        </h3>

        {isOrdersLoading ? (
          <div className="py-12 text-center text-zinc-500 text-xs">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">No orders found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orders.map((o) => {
              const alreadyRefunded = o.status === 'REFUNDED' || o.refunds.length > 0;
              return (
                <div
                  key={o.id}
                  className="p-4 rounded-xl bg-zinc-950/20 border border-zinc-800/40 hover:border-zinc-800 flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-purple-400">Order #{o.orderNumber}</span>
                      <div className="text-xs font-bold text-zinc-200 mt-1 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{o.customer.name}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 block mt-0.5">{o.customer.email}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-zinc-200 block">
                        ₹{Number(o.totalAmount).toLocaleString('en-IN')}
                      </span>
                      <span className="text-[9px] text-zinc-500 block mt-1">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-zinc-800/30 pt-3 flex items-center justify-between">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                        o.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : o.status === 'REFUNDED'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {o.status}
                    </span>
                    
                    {!alreadyRefunded ? (
                      <button
                        onClick={() => handleOpenRefundModal(o)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[10px] font-semibold text-purple-300 hover:text-purple-200 transition-all flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Request Refund</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Refund Initiated</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Refunds History Table */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 glass">
        <h3 className="text-sm font-semibold text-zinc-200 pb-4 border-b border-zinc-800/80 flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-purple-400" />
          <span>Audit Trail: Refund Execution History</span>
        </h3>

        {isRefundsLoading ? (
          <div className="py-12 text-center text-zinc-500 text-xs">Loading refund audit logs...</div>
        ) : refunds.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">No refund records registered.</div>
        ) : (
          <div className="overflow-x-auto mt-4 border border-zinc-800/50 rounded-xl bg-zinc-950/20">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/50 border-b border-zinc-800/80 text-zinc-400 uppercase tracking-wider text-[9px] font-semibold">
                <tr>
                  <th className="p-3.5">Refund ID</th>
                  <th className="p-3.5">Order #</th>
                  <th className="p-3.5">Customer Name</th>
                  <th className="p-3.5 text-center">Risk Score</th>
                  <th className="p-3.5">Refund Reason</th>
                  <th className="p-3.5 text-right">Amount</th>
                  <th className="p-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/30 text-zinc-300">
                {refunds.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-900/20">
                    <td className="p-3.5 font-mono text-[9px] text-zinc-500">#{r.id.substring(0, 8)}</td>
                    <td className="p-3.5 font-mono text-[10px] text-purple-300">Order #{r.order.orderNumber}</td>
                    <td className="p-3.5 font-semibold text-zinc-200">{r.order.customer.name}</td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          r.riskScore > 70
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10'
                            : r.riskScore > 40
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                        }`}
                      >
                        {r.riskScore}/100
                      </span>
                    </td>
                    <td className="p-3.5 text-zinc-400 truncate max-w-[180px]" title={r.reason}>
                      {r.reason}
                    </td>
                    <td className="p-3.5 text-right font-mono font-semibold text-zinc-300">
                      ₹{Number(r.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3.5 text-right">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          r.status === 'APPROVED' || r.status === 'EXECUTED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                            : r.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10 animate-pulse'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/10'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0f1422] p-6 shadow-2xl glass flex flex-col space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-purple-400" />
                <span>Initiate Refund Transaction</span>
              </h3>
              <button
                onClick={handleCloseRefundModal}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>

            {/* Info */}
            <div className="p-4 rounded-xl bg-zinc-950/20 border border-zinc-800/40 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Order Number:</span>
                <span className="font-mono text-purple-300 font-bold">#{selectedOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Customer Name:</span>
                <span className="text-zinc-200 font-semibold">{selectedOrder.customer.name}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-800/30 pt-2 mt-1">
                <span className="text-zinc-500 font-semibold">Total Amount:</span>
                <span className="font-bold text-zinc-100 text-sm">
                  ₹{Number(selectedOrder.totalAmount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block mb-1">
                  Reason for Refund
                </label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Enter reason..."
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800/80 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500/50"
                />
              </div>

              {/* Dynamic Risk Preview */}
              {(() => {
                const risk = getSimulatedRiskInfo(selectedOrder.orderNumber, Number(selectedOrder.totalAmount));
                return (
                  <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
                        Governance Risk Simulation
                      </h4>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          risk.score > 70
                            ? 'bg-rose-500/10 text-rose-400'
                            : risk.score > 40
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}
                      >
                        Risk Score: {risk.score}/100
                      </span>
                    </div>

                    <div className="space-y-1.5 text-[10px]">
                      {risk.rules.map((rule, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-zinc-400">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{rule}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-zinc-800/30 pt-2 flex items-center justify-between text-[10px]">
                      <span className="text-zinc-500 font-semibold">Governance Status:</span>
                      {risk.requiresApproval ? (
                        <span className="text-amber-400 font-bold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Manager Approval Required</span>
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Bypass Mode (Auto-Execute)</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/80">
              <button
                onClick={handleCloseRefundModal}
                className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRefund}
                disabled={requestRefundMutation.isPending}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 text-xs font-semibold text-white disabled:text-zinc-500 transition-all flex items-center gap-1"
              >
                {requestRefundMutation.isPending ? 'Submitting...' : 'Submit Refund Request'}
                {!requestRefundMutation.isPending && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
