'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, ShieldCheck, RotateCcw, Database, ArrowRight, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface DashboardData {
  metrics: {
    ordersCount: number;
    pendingApprovalsCount: number;
    totalRefundsAmount: number;
    skusCount: number;
  };
  products: any[];
  recentOrders: any[];
  pendingApprovals: any[];
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to fetch dashboard metrics');
      return res.json();
    },
    refetchInterval: 3000, // Polling for fast demo updates!
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-8 animate-pulse">
        <div className="h-10 w-48 bg-zinc-800 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-zinc-800 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-zinc-800 rounded-xl" />
          <div className="h-96 bg-zinc-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-zinc-400">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h3 className="text-lg font-semibold text-zinc-200">Error Loading Dashboard</h3>
        <p className="text-sm text-zinc-500 mt-1">Make sure the PostgreSQL database is online.</p>
      </div>
    );
  }

  const { metrics, recentOrders, pendingApprovals } = data;

  const cardItems = [
    {
      title: 'Total Orders',
      value: metrics.ordersCount,
      icon: ShoppingBag,
      color: 'text-sky-400',
      glow: 'shadow-sky-500/5',
      border: 'border-sky-500/10',
      bg: 'from-sky-500/5 to-transparent',
    },
    {
      title: 'Active Approvals Pending',
      value: metrics.pendingApprovalsCount,
      icon: ShieldCheck,
      color: 'text-emerald-400',
      glow: 'shadow-emerald-500/5',
      border: 'border-emerald-500/10',
      bg: 'from-emerald-500/5 to-transparent',
    },
    {
      title: 'Refunds Processed',
      value: `₹${metrics.totalRefundsAmount.toLocaleString('en-IN')}`,
      icon: RotateCcw,
      color: 'text-rose-400',
      glow: 'shadow-rose-500/5',
      border: 'border-rose-500/10',
      bg: 'from-rose-500/5 to-transparent',
    },
    {
      title: 'Inventory SKUs',
      value: metrics.skusCount,
      icon: Database,
      color: 'text-purple-400',
      glow: 'shadow-purple-500/5',
      border: 'border-purple-500/10',
      bg: 'from-purple-500/5 to-transparent',
    },
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">Governance Dashboard</h2>
        <p className="text-xs text-zinc-400 mt-1">OpsPilot AI Operations control panel and metrics overview.</p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cardItems.map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={i}
              className={`rounded-2xl border ${c.border} bg-gradient-to-br ${c.bg} p-6 shadow-lg ${c.glow} transition-all duration-300 hover:scale-[1.02] hover:border-zinc-700`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-medium">{c.title}</span>
                <Icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-zinc-100 tracking-tight">{c.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders Card */}
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 glass">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
            <h3 className="text-sm font-semibold text-zinc-200">Recent Store Orders</h3>
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">Real-time</span>
          </div>
          <div className="mt-4 space-y-3">
            {recentOrders.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs">No orders found.</div>
            ) : (
              recentOrders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/20 border border-zinc-800/30 hover:border-zinc-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                      <ShoppingBag className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">Order #{o.orderNumber}</div>
                      <div className="text-[10px] text-zinc-500">{o.customer.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-zinc-300">
                      ₹{Number(o.totalAmount).toLocaleString('en-IN')}
                    </div>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold inline-block mt-1 ${
                        o.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                          : o.status === 'DELAYED'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10 animate-pulse'
                          : o.status === 'REFUNDED'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {o.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending Approvals Card */}
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 glass">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
            <h3 className="text-sm font-semibold text-zinc-200">Active Governance Approvals</h3>
            <Link
              href="/approvals"
              className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 group"
            >
              Approvals Hub
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {pendingApprovals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                <ShieldCheck className="w-10 h-10 text-emerald-500/30 mb-2" />
                <span className="text-xs">No pending approvals! System is fully synchronized.</span>
              </div>
            ) : (
              pendingApprovals.map((a) => (
                <div
                  key={a.id}
                  className="p-3 rounded-xl bg-zinc-950/20 border border-zinc-800/30 flex items-center justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">
                        {a.type === 'INVENTORY_UPDATE' ? 'Batch Inventory Update' : 'Order Refund Request'}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        Requested by {a.requestedBy} • {new Date(a.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <Link
                    href="/approvals"
                    className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-[10px] font-semibold text-white transition-all flex items-center gap-1"
                  >
                    <span>Review</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
