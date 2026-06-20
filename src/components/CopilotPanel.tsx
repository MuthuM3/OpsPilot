'use client';
 
import React, { useState, useEffect } from 'react';
import { Shield, Sparkles, Activity, AlertTriangle, ChevronRight, ChevronLeft, RefreshCw, Play } from 'lucide-react';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/components/Providers';
 
export default function CopilotPanel() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [revenue, setRevenue] = useState(84000);
  const [orders, setOrders] = useState(142);
  const [lowStock, setLowStock] = useState(8);
 
  const { 
    setActiveTab, 
    setActiveChatId, 
    setChatMode, 
    setIsChatOpen, 
    setChatInputPreset, 
    showToast,
    activeWorkflow
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
  const dbRefunds = data?.metrics?.refundsCount || 0;
  const dbPendingApprovals = data?.metrics?.pendingApprovalsCount || 0;
  const dbLowStock = data?.metrics?.lowStockCount || 0;
 
  // Compute live values anchored to DB status but fluctuating to feel alive
  const ordersToday = 142 + dbOrders;
  const refundsToday = 3 + dbRefunds;
  const pendingApprovalsToday = dbPendingApprovals;
  const lowStockToday = 8 + dbLowStock;
  const revenueToday = 84000 + (dbOrders * 1250) + (revenue - 84000);
 
  // Fluctuate stats slightly to make the panel feel alive in real time
  useEffect(() => {
    const interval = setInterval(() => {
      setRevenue(r => r + Math.floor(Math.random() * 250) - 80);
      if (Math.random() > 0.7) {
        setOrders(o => o + 1);
      }
      if (Math.random() > 0.9) {
        setLowStock(l => Math.max(5, l + Math.floor(Math.random() * 3) - 1));
      }
    }, 4000);
    return () => clearInterval(interval);
  }, []);
 
  // Demo Data Generator endpoint trigger
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/dashboard/generate', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate mock data');
      return res.json();
    },
    onSuccess: () => {
      // Invalidate queries to reload dashboard, orders, inventory instantly!
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      
      // Bump local states in the copilot panel
      setOrders(prev => prev + 50);
      setRevenue(prev => prev + 18500);
      showToast('⚡ Demo Store Data Generated successfully! 50 new orders, 10 refunds, and 5 pending approvals added.', 'success', 'DEMO SEED');
    },
    onError: (err: any) => {
      showToast(`Error generating store data: ${err.message}`, 'error', 'SEED FAILED');
    }
  });
 
  const scenarios = [
    {
      id: 'high-risk-refund',
      title: 'High-Risk Refund Gate',
      desc: 'Test a refund request above ₹10,000 threshold for a VIP customer with return history.',
      prompt: 'Refund Order #ORD-1024',
      tab: 'refunds',
      chatId: 'refund-flow',
      mode: 'agent' as const,
      toast: 'Configured refund-flow in Agent Mode. Submit the preset prompt in chat!'
    },
    {
      id: 'bypass-refund',
      title: 'Policy-Bypass Refund',
      desc: 'Test low-risk refund (under ₹10,000) that automatically executes without manager review.',
      prompt: 'Refund Order #ORD-1023',
      tab: 'refunds',
      chatId: 'refund-flow',
      mode: 'agent' as const,
      toast: 'Configured refund-flow in Agent Mode. Submit the preset prompt in chat!'
    },
    {
      id: 'read-only-lock',
      title: 'Read-Only Mode Lock',
      desc: 'Attempt to request a refund in read-only Ask Mode to test policy block.',
      prompt: 'Refund Order #ORD-1024',
      tab: 'refunds',
      chatId: 'support-flow',
      mode: 'ask' as const,
      toast: 'Configured support-flow in Ask Mode. Submit the preset prompt in chat!'
    },
    {
      id: 'high-discount',
      title: 'High-Discount Promo Gate',
      desc: 'Request a discount exceeding the 20% safe threshold, triggering manager gate.',
      prompt: 'Create discount code promo50 with 50% discount',
      tab: 'approvals',
      chatId: 'discount-flow',
      mode: 'agent' as const,
      toast: 'Configured discount-flow in Agent Mode. Submit the preset prompt in chat!'
    },
    {
      id: 'inventory-mapping',
      title: 'Messy CSV Mapping',
      desc: 'Show recommendation preview of column mappings for supplier CSV sheet.',
      prompt: 'Show supplier mappings',
      tab: 'inventory',
      chatId: 'inventory-flow',
      mode: 'agent' as const,
      toast: 'Configured inventory-flow in Agent Mode. Submit the preset prompt in chat!'
    }
  ];
 
  const playScenario = (sc: typeof scenarios[0]) => {
    setActiveTab(sc.tab);
    setActiveChatId(sc.chatId);
    setChatMode(sc.mode);
    setIsChatOpen(true);
    setChatInputPreset(sc.prompt);
    showToast(sc.toast, 'info', 'PLAY SCENARIO');
  };
 
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="h-full w-10 border-l border-zinc-800 bg-[#090d16] flex flex-col items-center py-6 gap-6 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 cursor-pointer"
        title="Open Business Copilot Panel"
      >
        <ChevronLeft className="w-4 h-4 text-purple-400" />
        <span className="vertical-rl text-[9px] font-bold uppercase tracking-widest select-none origin-center rotate-180">
          Business Copilot
        </span>
      </button>
    );
  }
 
  return (
    <div className="h-full w-64 border-l border-zinc-800 bg-[#0b0f19] flex flex-col shrink-0 animate-in slide-in-from-right duration-200">
      {/* Panel Header */}
      <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/20 h-16 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-400 shrink-0" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300 block">
              Business Copilot
            </span>
            <span className="text-[8px] text-zinc-500 font-semibold uppercase tracking-wider">
              Real-Time telemetry
            </span>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 rounded hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Collapse Panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
 
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* System Health */}
        <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/30 space-y-2">
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-zinc-500">Store Health:</span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold text-[8px] uppercase tracking-wide">
              Good
            </span>
          </div>
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-zinc-500">Autonomous Swarm:</span>
            <span className="text-purple-400 font-bold text-[9px] animate-pulse">
              ● MONITORING
            </span>
          </div>
        </div>

        {/* Active Business Workflow State */}
        <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/30 space-y-3">
          <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500 block">
            Active Workflow
          </span>
          {activeWorkflow && activeWorkflow.activeObjectType ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-200 font-semibold uppercase">
                  {activeWorkflow.activeObjectType === 'discount' ? 'Discount Campaign' : 'Refund Process'}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide ${
                  activeWorkflow.workflowState === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                  activeWorkflow.workflowState === 'approval_required' ? 'bg-rose-500/10 text-rose-400 animate-pulse' :
                  'bg-purple-500/10 text-purple-400'
                }`}>
                  {activeWorkflow.workflowState}
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 space-y-1">
                <div>Object ID: <strong className="text-zinc-300">{activeWorkflow.activeObjectId || 'N/A'}</strong></div>
                {activeWorkflow.activeObjectType === 'discount' ? (
                  <>
                    <div>Value: <strong className="text-zinc-300">{activeWorkflow.metadata?.discountPercent}% Off</strong></div>
                    <div>Expiry: <strong className="text-zinc-300">{activeWorkflow.metadata?.expiry || 'Not Set'}</strong></div>
                    <div>Segment: <strong className="text-zinc-300">{activeWorkflow.metadata?.segment || 'All Customers'}</strong></div>
                  </>
                ) : (
                  <>
                    <div>Customer: <strong className="text-zinc-300">{activeWorkflow.metadata?.customerName || 'N/A'}</strong></div>
                    <div>Amount: <strong className="text-zinc-300">₹{activeWorkflow.metadata?.amount?.toLocaleString('en-IN') || '0'}</strong></div>
                    <div>Reason: <strong className="text-zinc-300">{activeWorkflow.metadata?.reason || 'Not Set'}</strong></div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[9px] text-zinc-500 leading-relaxed italic">
              No active workflow. Click a Guided Playbook scenario below to launch one.
            </p>
          )}
        </div>
 
        {/* Guided Playbook Scenarios */}
        <div className="space-y-3">
          <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500 block px-1">
            Guided Playbook
          </span>
          <div className="space-y-2">
            {scenarios.map((sc) => (
              <div 
                key={sc.id} 
                className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/20 hover:bg-zinc-950/40 transition-all text-[10px] space-y-1.5 group relative animate-in fade-in duration-200"
              >
                <div className="flex justify-between items-start gap-1">
                  <span className="font-semibold text-zinc-200 block text-[10px] group-hover:text-purple-300 transition-colors">
                    {sc.title}
                  </span>
                  <button
                    onClick={() => playScenario(sc)}
                    className="p-1 rounded bg-purple-600/10 hover:bg-purple-600/30 text-purple-400 group-hover:text-purple-300 transition-all cursor-pointer flex items-center justify-center shrink-0 border border-purple-500/10 hover:border-purple-500/30"
                    title={`Trigger ${sc.title}`}
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                  </button>
                </div>
                <p className="text-[9px] text-zinc-400 leading-normal">
                  {sc.desc}
                </p>
                <div className="flex justify-between items-center text-[8px] text-zinc-500 font-mono">
                  <span>Mode: <strong className={sc.mode === 'agent' ? 'text-purple-400' : 'text-sky-400'}>{sc.mode.toUpperCase()}</strong></span>
                  <span>Tab: <strong className="text-zinc-400">{sc.tab}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
 
        {/* Real-time Telemetry Metrics */}
        <div className="space-y-3">
          <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500 block px-1">
            Business Context
          </span>
 
          <div className="p-3.5 rounded-xl bg-zinc-950/20 border border-zinc-800/50 space-y-2 text-[10px] text-zinc-300">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Orders Today</span>
              <span className="font-bold text-zinc-200">{ordersToday}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Refunds Today</span>
              <span className="font-bold text-rose-400">{refundsToday}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Pending Approvals</span>
              <span className="font-bold text-purple-400">{pendingApprovalsToday}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Low Stock Products</span>
              <span className="font-bold text-amber-400">{lowStockToday}</span>
            </div>
            <div className="border-t border-zinc-800/40 my-1 pt-2 flex justify-between items-center text-[11px]">
              <span className="text-zinc-400 font-medium">Revenue Today</span>
              <span className="font-bold text-emerald-400">₹{Math.floor(revenueToday).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
 
        {/* Risk Alerts */}
        <div className="space-y-2">
          <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500 block px-1">
            Active Risk Alerts
          </span>
          <div className="space-y-1.5 text-[10px]">
            <div className="p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 flex items-start gap-2 leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-zinc-200 block text-[9px]">High Refund Rate</span>
                <span>Alice Smith submitted 3 refunds in last 24h.</span>
              </div>
            </div>
            <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 flex items-start gap-2 leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-zinc-200 block text-[9px]">Inventory Mismatch</span>
                <span>Supplier CSV reports price variations on 4 items.</span>
              </div>
            </div>
          </div>
        </div>
 
        {/* Governance Insight */}
        <div className="p-3 rounded-xl border border-purple-500/10 bg-purple-500/5 space-y-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="font-bold text-purple-300">Policy Rules</span>
          </div>
          <ul className="space-y-1 text-[9px] text-zinc-400 list-disc pl-3 leading-relaxed">
            <li>Single refund ceiling threshold: ₹10,000</li>
            <li>Coupons above 20% discount require manager</li>
            <li>CSV upload updates require header approval</li>
          </ul>
        </div>
      </div>
 
      {/* Seeding Controls */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950/20 shrink-0">
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-xs font-bold text-white transition-all flex items-center justify-center gap-2 shadow-md shadow-purple-600/10 cursor-pointer disabled:opacity-50"
        >
          {generateMutation.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span>⚡ Generate Store Data</span>
        </button>
      </div>
    </div>
  );
}
