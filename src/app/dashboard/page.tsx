'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  ShoppingBag, 
  ShieldCheck, 
  ArrowRight, 
  Clock, 
  AlertCircle, 
  Shield, 
  Flame,
  Package,
  Tag,
  MessageSquare,
  Zap
} from 'lucide-react';
import Link from 'next/link';
import { summarizeOperations } from '@/lib/dashboard/summary';
import { useWorkspace } from '@/components/Providers';

interface DashboardData {
  metrics: {
    ordersCount: number;
    pendingApprovalsCount: number;
    totalRefundsAmount: number;
    skusCount: number;
    refundsCount: number;
    lowStockCount: number;
    refundsNeedingApprovalCount: number;
    delayedShipmentsCount: number;
    openTicketsCount: number;
    discountRequestsCount: number;
  };
  products: any[];
  recentOrders: any[];
  pendingApprovals: any[];
}

export default function DashboardPage() {
  const { setIsChatOpen, setChatInputPreset, setActiveChatId, chatList } = useWorkspace();

  const { data, isLoading, error, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to fetch dashboard metrics');
      return res.json();
    },
    retry: false, // Polling and the explicit Retry control handle read recovery.
    refetchInterval: 3000, // Polling for fast demo updates!
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-8 animate-pulse">
        <div className="h-10 w-48 bg-zinc-800 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-40 bg-zinc-800 rounded-xl" />
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
        <p className="text-sm text-zinc-500 mt-1">We could not load the recorded store data. Please try again.</p>
        <button onClick={() => void refetch()} className="mt-4 text-sm text-blue-400 underline underline-offset-4">Retry dashboard</button>
      </div>
    );
  }

  const { metrics, recentOrders, pendingApprovals } = data;
  const summary = summarizeOperations(metrics);

  const handleRunCopilot = (prompt: string, flowSessionId?: string) => {
    if (flowSessionId) {
      const existing = chatList.find(c => c.id === flowSessionId);
      if (existing) {
        setActiveChatId(flowSessionId);
      }
    }
    setChatInputPreset(prompt);
    setIsChatOpen(true);
  };

  const inboxItems = [
    {
      title: 'Refunds Needing Approval',
      count: metrics.refundsNeedingApprovalCount ?? 0,
      icon: Flame,
      color: 'text-rose-400',
      badgeBg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      desc: 'High-risk and threshold limit approval overrides.',
      actionLabel: 'Review approvals queue',
      actionHref: '/approvals',
      copilotPrompt: 'Review pending approvals',
      copilotLabel: 'Run Copilot'
    },
    {
      title: 'Delayed Shipments',
      count: metrics.delayedShipmentsCount ?? 0,
      icon: Clock,
      color: 'text-amber-400',
      badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      desc: 'Orders marked delayed in the recorded store data.',
      actionLabel: 'Start shipment investigation',
      actionHref: '/dashboard#demo-guide',
      copilotPrompt: 'Which shipments are delayed? Show the order numbers and their recorded status.',
      copilotLabel: 'Investigate delays'
    },
    {
      title: 'Low Stock Products',
      count: metrics.lowStockCount ?? 0,
      icon: Package,
      color: 'text-yellow-400',
      badgeBg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      desc: 'Catalog items dipping below safety thresholds.',
      actionLabel: 'Open inventory control',
      actionHref: '/inventory',
      copilotPrompt: 'Check low stock products',
      copilotLabel: 'Stock Audit'
    },
    {
      title: 'Support Tickets',
      count: metrics.openTicketsCount ?? 0,
      icon: MessageSquare,
      color: 'text-blue-400',
      badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      desc: 'Open customer support queries requiring response.',
      actionLabel: 'Manage tickets',
      actionHref: '/refunds',
      copilotPrompt: 'Show open tickets',
      copilotLabel: 'Audit Tickets'
    },
    {
      title: 'Discount Requests',
      count: metrics.discountRequestsCount ?? 0,
      icon: Tag,
      color: 'text-indigo-400',
      badgeBg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      desc: 'Promo codes exceeding standard discount policies.',
      actionLabel: 'Review discount queue',
      actionHref: '/approvals',
      copilotPrompt: 'Review pending approvals',
      copilotLabel: 'Verify Margin Risk'
    }
  ];

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      <section id="demo-guide" className="scroll-mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-blue-300">Guided demo: investigate, request, review, verify</h2>
        <ol className="list-decimal pl-5 text-xs text-zinc-400 space-y-2">
          <li>Ask which shipments are delayed and inspect the recorded orders.</li>
          <li>Request a 30% demo discount. The configured 20% limit requires approval.</li>
          <li>Open Approvals Queue to review the policy reasons and choose approve or reject.</li>
          <li>Compare the decision with the execution result, then inspect Audit Logs.</li>
        </ol>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => handleRunCopilot('Which shipments are delayed? Show the order numbers and the recorded status.')} className="px-3 py-2 rounded-lg border border-blue-500/30 text-xs text-blue-300">Prepare shipment question</button>
          <button onClick={() => handleRunCopilot(`Create a 30% discount code REVIEW30-${Date.now()} for manager review. Do not approve or execute it.`)} className="px-3 py-2 rounded-lg border border-blue-500/30 text-xs text-blue-300">Prepare discount request</button>
          <Link href="/approvals" className="px-3 py-2 text-xs text-blue-300 underline">Open approval queue</Link>
        </div>
        <p className="text-xs text-zinc-500">These buttons prepare assistant input. Review it and choose Send to continue. Actions affect shared synthetic demo records; no real payments or vendor updates occur.</p>
      </section>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2.5">
            <span>Operations Inbox</span>
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2.5 py-0.5 rounded font-mono uppercase tracking-wider font-semibold">Overview</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">Review priority store alerts, verify policy compliance, and run copilot workflows.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleRunCopilot('Check low stock products')}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Launch Assistant</span>
          </button>
        </div>
      </div>

      {/* Operations Inbox - List / Grid Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {inboxItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm hover:border-zinc-700 transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.badgeBg}`}>
                    {item.count} Active
                  </span>
                  <Icon className={`w-5 h-5 ${item.color}`} />
                </div>
                
                <h3 className="mt-4 text-xs font-bold text-zinc-100 tracking-tight">{item.title}</h3>
                <p className="mt-2 text-[10px] text-zinc-400 leading-relaxed min-h-[30px]">{item.desc}</p>
              </div>

              <div className="mt-5 space-y-2 pt-2 border-t border-zinc-800">
                <button
                  onClick={() => handleRunCopilot(item.copilotPrompt)}
                  className="w-full py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-[10px] font-semibold text-zinc-200 hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>{item.copilotLabel}</span>
                </button>
                <Link
                  href={item.actionHref}
                  className="w-full py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 text-[9px] font-semibold text-zinc-400 hover:text-zinc-200 transition-all flex items-center justify-center gap-1"
                >
                  <span>{item.actionLabel}</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid Columns */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Area (Main Store Data - 2 cols on wide screens) */}
        <div className="xl:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Recent Orders Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
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
                      className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 transition-colors"
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
                        <div className="text-xs font-bold text-zinc-200 font-mono">
                          ₹{Number(o.totalAmount).toLocaleString('en-IN')}
                        </div>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-semibold inline-block mt-1 ${
                            o.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : o.status === 'DELAYED'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : o.status === 'REFUNDED'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
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
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-200">Active Governance Approvals</h3>
                <Link
                  href="/approvals"
                  className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 group"
                >
                  Approvals Queue
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
              <div className="mt-4 space-y-3">
                {pendingApprovals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                    <ShieldCheck className="w-10 h-10 text-emerald-500/30 mb-2" />
                    <span className="text-xs text-zinc-400">No pending approvals. System is clear.</span>
                  </div>
                ) : (
                  pendingApprovals.map((a) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-lg bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5 text-blue-400">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-zinc-200">
                            {a.type === 'INVENTORY_UPDATE' ? 'Batch Inventory Update' : a.type === 'DISCOUNT_CREATION' ? 'Promo Code Creation' : 'Order Refund Request'}
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            Requested by {a.requestedBy} • {new Date(a.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                      <Link
                        href="/approvals"
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-semibold text-white transition-all flex items-center gap-1 shrink-0"
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

        {/* Right Area (Governance Hub - 1 col) */}
        <div className="space-y-6">
          
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-300">Recorded operations overview</h3>
            <p className="text-sm text-amber-400">{summary?.status ?? 'Overview unavailable'}</p>
            <p className="text-xs text-zinc-400">Based on stored demo order, inventory, and approval counts. No production SLA or vendor service health is measured.</p>
            <div className="space-y-3 text-xs">{summary?.alerts.map(alert => <Link key={alert.href} href={alert.href} className="block text-amber-400 underline underline-offset-4">{alert.count} {alert.label.toLowerCase()}</Link>)}</div>
          </div>

          {/* Governance Rules */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 pb-3 border-b border-zinc-800">
              <Shield className="w-4 h-4 text-zinc-400" />
              <span>Governance Policy Constraints</span>
            </h3>

            <ul className="space-y-2.5 pl-3 list-disc text-[11px] text-zinc-400 leading-relaxed">
              <li>
                <strong className="text-zinc-300">Single Refund Cap:</strong> Refund transactions above <strong className="text-zinc-200">₹10,000</strong> require explicit manager sign-off.
              </li>
              <li>
                <strong className="text-zinc-300">Safe Coupon Bounds:</strong> Campaign discount percentages exceeding <strong className="text-zinc-200">20%</strong> require secondary review.
              </li>
              <li>
                <strong className="text-zinc-300">CSV Import Sanity:</strong> All batch catalog updates must pass header mapping validation rules.
              </li>
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}
