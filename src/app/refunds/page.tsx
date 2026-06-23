'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  RotateCcw, 
  AlertTriangle, 
  ShieldCheck, 
  Check, 
  AlertCircle, 
  ShoppingBag, 
  ArrowRight, 
  User, 
  MessageSquare, 
  Search, 
  Mail, 
  Phone, 
  Inbox,
  ChevronRight,
  ShieldAlert,
  Send,
  Sparkles,
  TrendingUp,
  CreditCard,
  History,
  Info,
  Clock,
  Loader2
} from 'lucide-react';
import Link from 'next/link';

interface OrderItem {
  id: string;
  price: string;
  quantity: number;
  product: {
    name: string;
    sku: string;
  };
}

interface Order {
  id: string;
  orderNumber: string;
  totalAmount: string;
  status: string;
  createdAt: string;
  items: OrderItem[];
  refunds: any[];
}

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  createdAt: string;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    orders: Order[];
  };
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

interface ChatMessage {
  sender: 'customer' | 'agent' | 'system';
  text: string;
  timestamp: string;
}

export default function RefundsPage() {
  const queryClient = useQueryClient();
  
  // Basic states
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('Defective item returned');
  const [successInfo, setSuccessInfo] = useState<any | null>(null);
  const [ticketSearch, setTicketSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');
  
  // Workspace active tab
  const [workspaceTab, setWorkspaceTab] = useState<'chat' | 'operations'>('operations');
  
  // Reply text box state
  const [replyText, setReplyText] = useState('');
  
  // Local chat histories for support tickets
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});

  // Itemized refund checklist states
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [customRefundAmount, setCustomRefundAmount] = useState<string>('');
  const [isCustomAmountEnabled, setIsCustomAmountEnabled] = useState(false);

  // Fetch support tickets
  const { data: ticketsData, isLoading: isTicketsLoading } = useQuery<{ tickets: Ticket[] }>({
    queryKey: ['tickets'],
    queryFn: async () => {
      const res = await fetch('/api/tickets');
      if (!res.ok) throw new Error('Failed to fetch support tickets');
      return res.json();
    },
    refetchInterval: 3000
  });

  // Fetch past refunds
  const { data: refundsData, isLoading: isRefundsLoading } = useQuery<{ refunds: Refund[] }>({
    queryKey: ['refunds'],
    queryFn: async () => {
      const res = await fetch('/api/refunds');
      if (!res.ok) throw new Error('Failed to fetch refunds');
      return res.json();
    },
    refetchInterval: 3000
  });

  const tickets = ticketsData?.tickets || [];
  const refunds = refundsData?.refunds || [];
  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  // Seed chat histories when tickets load
  useEffect(() => {
    if (tickets.length > 0 && Object.keys(chatHistories).length === 0) {
      const initialChats: Record<string, ChatMessage[]> = {};
      tickets.forEach(ticket => {
        const timeStr = new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Draft structured logs
        const customerMsg: ChatMessage = {
          sender: 'customer',
          text: ticket.description,
          timestamp: timeStr
        };

        const list: ChatMessage[] = [customerMsg];

        // Seed smart replies / automated draft logs based on ticket type
        if (ticket.ticketNumber === 'TKT-003') {
          list.push({
            sender: 'system',
            text: '💡 AI Agent Auto-Draft: "Hi Alice, we see that you received a damaged Smartwatch on Order #ORD-1024. Under our VIP priority program, you are eligible for an instant replacement or immediate manager-approved refund. Click the Operations tab to initiate the payout process."',
            timestamp: timeStr
          });
        } else if (ticket.ticketNumber === 'TKT-004') {
          list.push({
            sender: 'system',
            text: '💡 AI Agent Auto-Draft: "Hello Bob, I have audited your payment records on Stripe and detected a duplicate charge of ₹15,499. Click the Operations tab to trigger the refund transaction and resolve this dispute."',
            timestamp: timeStr
          });
        } else if (ticket.ticketNumber === 'TKT-001') {
          list.push({
            sender: 'agent',
            text: 'Hello Sarah, I apologize for the delay. Your ergonomic office chair is currently held at our Delhi Hub due to heavy rain. I will notify fulfillment to expedite shipping immediately.',
            timestamp: timeStr
          });
        }

        initialChats[ticket.id] = list;
      });
      setChatHistories(initialChats);
    }
  }, [tickets, chatHistories]);

  // Auto-select ticket from URL search parameters (e.g. ?ticket=TKT-003)
  useEffect(() => {
    if (typeof window !== 'undefined' && tickets.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const ticketNum = params.get('ticket');
      if (ticketNum) {
        const found = tickets.find(t => t.ticketNumber === ticketNum);
        if (found) {
          setSelectedTicketId(found.id);
          setWorkspaceTab('operations');
        }
      }
    }
  }, [tickets]);

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
      
      // Inject system resolution in chat
      if (selectedTicketId) {
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const auditLogMsg: ChatMessage = {
          sender: 'system',
          text: `⚡ Payout Transaction Triggered: Refund requested for ₹${Number(data.refund.amount).toLocaleString('en-IN')}. Current Governance Status: ${data.status}.`,
          timestamp: timeNow
        };
        setChatHistories(prev => ({
          ...prev,
          [selectedTicketId]: [...(prev[selectedTicketId] || []), auditLogMsg]
        }));
      }

      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });

  // Calculate default item selections when opening refund modal
  const handleOpenRefundModal = (order: Order) => {
    setSelectedOrder(order);
    setRefundReason(`Refund request linked to ticket ${selectedTicket?.ticketNumber || ''}`);
    setSuccessInfo(null);
    setIsCustomAmountEnabled(false);
    setCustomRefundAmount('');

    // Pre-select all items and their max quantities
    const itemsSelected: Record<string, boolean> = {};
    const itemsQuantities: Record<string, number> = {};
    order.items.forEach(item => {
      itemsSelected[item.id] = true;
      itemsQuantities[item.id] = item.quantity;
    });
    setSelectedItems(itemsSelected);
    setSelectedQuantities(itemsQuantities);
  };

  const handleCloseRefundModal = () => {
    setSelectedOrder(null);
  };

  // Toggle item selection in refund wizard
  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Update item quantity in refund wizard
  const setItemQuantity = (itemId: string, qty: number) => {
    setSelectedQuantities(prev => ({
      ...prev,
      [itemId]: qty
    }));
  };

  // Compute total refund value dynamically
  const calculatedRefundValue = selectedOrder
    ? selectedOrder.items.reduce((sum, item) => {
        if (selectedItems[item.id]) {
          return sum + (Number(item.price) * (selectedQuantities[item.id] || 1));
        }
        return sum;
      }, 0)
    : 0;

  const finalRefundAmount = isCustomAmountEnabled 
    ? Number(customRefundAmount) || 0 
    : calculatedRefundValue;

  const handleSubmitRefund = () => {
    if (!selectedOrder) return;
    requestRefundMutation.mutate({
      orderId: selectedOrder.id,
      amount: finalRefundAmount,
      reason: refundReason
    });
  };

  // Send reply in ticket workspace chat
  const handleSendReply = () => {
    if (!replyText.trim() || !selectedTicketId) return;
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const newMsg: ChatMessage = {
      sender: 'agent',
      text: replyText,
      timestamp: timeNow
    };

    setChatHistories(prev => ({
      ...prev,
      [selectedTicketId]: [...(prev[selectedTicketId] || []), newMsg]
    }));

    setReplyText('');

    // Trigger local API update simulation if required or simply change ticket status to IN_PROGRESS
    if (selectedTicket && selectedTicket.status === 'OPEN') {
      // Simulate state transition locally in React state (will override temporarily until polling updates)
      selectedTicket.status = 'IN_PROGRESS';
    }
  };

  // Quick risk simulation check for the selected order (anchored to DB status)
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
      score += 15; // Alice has open ticket
      rules.push('Active open support ticket dispute (+15)');
    }

    score = Math.min(100, score);
    const requiresApproval = score > 50 || amount > 10000;

    return { score, requiresApproval, rules };
  };

  // Customer Intelligence stats lookup helper
  const getCustomerStats = (customerName: string) => {
    switch (customerName) {
      case 'Alice Smith':
        return { ltv: 19697, refundRatio: 25, tier: 'VIP', color: 'from-purple-550 to-indigo-650' };
      case 'Bob Johnson':
        return { ltv: 18699, refundRatio: 0, tier: 'Gold', color: 'from-amber-500 to-orange-650' };
      case 'Sarah Connor':
        return { ltv: 8500, refundRatio: 0, tier: 'VIP', color: 'from-purple-550 to-indigo-650' };
      default:
        return { ltv: 4999, refundRatio: 0, tier: 'Standard', color: 'from-sky-500 to-blue-650' };
    }
  };

  // Avatar initials generator
  const renderInitialsAvatar = (name: string) => {
    const initials = name.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
    const stats = getCustomerStats(name);
    return (
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${stats.color} flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-md`}>
        {initials}
      </div>
    );
  };

  // Date formatter (Relative Time String)
  const getRelativeTime = (isoString: string) => {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(isoString).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Filter tickets by query and status categories
  const filteredTickets = tickets.filter(t => {
    const matchesSearch = 
      t.ticketNumber.toLowerCase().includes(ticketSearch.toLowerCase()) ||
      t.subject.toLowerCase().includes(ticketSearch.toLowerCase()) ||
      t.customer.name.toLowerCase().includes(ticketSearch.toLowerCase());
    
    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    return t.status === statusFilter;
  });

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <span>Support Desk Workspace</span>
        </h2>
        <p className="text-xs text-zinc-400 mt-1">Review incoming support tickets, reply to customer inquiries, and trigger governance-evaluated partial or full refunds directly inside the ticket workspace.</p>
      </div>

      {/* Success Notification Banner */}
      {successInfo && (
        <div className="p-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-450">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-200">
                Refund Request Submitted Successfully
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                Order **#{successInfo.refund?.order?.orderNumber || ''}** refund request has been registered in state: **{successInfo.refund?.status}**.
                {successInfo.status === 'PENDING' && ' ⚠️ Flagged by governance policy checks, pending manager override in the Approvals Queue.'}
              </p>
            </div>
          </div>
          {successInfo.status === 'PENDING' && (
            <Link
              href="/approvals"
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition-all flex items-center gap-1.5 self-start sm:self-center cursor-pointer"
            >
              <span>Review in Approvals Queue</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      )}

      {/* Main Support Desk Panel (2-column layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[620px] items-stretch">
        
        {/* Left Column: Tickets Inbox */}
        <div className="lg:col-span-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 glass flex flex-col space-y-4">
          
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-405 flex items-center gap-2">
              <Inbox className="w-4 h-4 text-purple-400" />
              <span>Inbox Queue ({filteredTickets.length})</span>
            </h3>
            <span className="text-[9px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">Live Sync</span>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-650 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              placeholder="Search ID, subject, customer..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-950/40 border border-zinc-805/85 focus:border-purple-500/50 rounded-xl text-xs text-zinc-200 placeholder-zinc-650 focus:outline-none transition-colors"
            />
          </div>

          {/* Category Filter Tab Chips */}
          <div className="flex flex-wrap gap-1 pb-1 border-b border-zinc-850/30">
            {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-2 py-1 rounded-lg text-[9px] font-bold tracking-wide transition-all cursor-pointer ${
                  statusFilter === tab 
                    ? 'bg-purple-600/10 border border-purple-500/20 text-purple-300' 
                    : 'text-zinc-500 hover:text-zinc-350 hover:bg-zinc-950/20 border border-transparent'
                }`}
              >
                {tab === 'ALL' ? 'ALL' : tab.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Inbox List */}
          <div className="flex-1 overflow-y-auto max-h-[520px] pr-1 space-y-2">
            {isTicketsLoading ? (
              <div className="py-24 text-center text-zinc-500 text-xs flex justify-center items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                <span>Loading tickets...</span>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-24 text-zinc-650 text-xs italic">
                No support tickets found.
              </div>
            ) : (
              filteredTickets.map((t) => {
                const isSelected = selectedTicketId === t.id;
                const stats = getCustomerStats(t.customer.name);
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTicketId(t.id);
                      setSuccessInfo(null);
                      setWorkspaceTab('operations');
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 relative group cursor-pointer ${
                      isSelected 
                        ? 'bg-[#0f1422] border-purple-500/35 shadow-md shadow-purple-950/10' 
                        : 'bg-zinc-950/25 border-zinc-850/50 hover:border-zinc-800 hover:bg-zinc-950/40'
                    }`}
                  >
                    {renderInitialsAvatar(t.customer.name)}
                    
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono font-bold text-purple-400">
                          {t.ticketNumber}
                        </span>
                        <span className="text-[8px] text-zinc-550">
                          {getRelativeTime(t.createdAt)}
                        </span>
                      </div>

                      <h4 className={`text-xs font-semibold truncate ${isSelected ? 'text-purple-300' : 'text-zinc-200 group-hover:text-zinc-100'}`}>
                        {t.subject}
                      </h4>
                      
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-850/20 text-[9px] text-zinc-500 font-mono">
                        <span className="font-semibold text-zinc-400">{t.customer.name}</span>
                        <div className="flex gap-1 shrink-0">
                          <span className={`px-1 rounded-[4px] uppercase text-[7px] font-bold ${
                            t.priority === 'HIGH' ? 'bg-rose-500/10 text-rose-405 border border-rose-500/10' :
                            'bg-zinc-900 border border-zinc-800 text-zinc-500'
                          }`}>
                            {t.priority}
                          </span>
                          <span className={`px-1 rounded-[4px] uppercase text-[7px] font-bold ${
                            t.status === 'OPEN' ? 'bg-amber-500/10 text-amber-400 border border-amber-550/10' :
                            t.status === 'IN_PROGRESS' ? 'bg-purple-500/10 text-purple-400 border border-purple-550/10 animate-pulse' :
                            'bg-emerald-500/10 text-emerald-450 border border-emerald-550/10'
                          }`}>
                            {t.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Ticket Details & Workspace */}
        <div className="lg:col-span-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 glass flex flex-col space-y-6">
          {!selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 py-24 text-center space-y-3">
              <MessageSquare className="w-14 h-14 text-zinc-700 animate-pulse" />
              <div>
                <h4 className="text-xs font-bold text-zinc-300">No Support Ticket Selected</h4>
                <p className="text-[10px] text-zinc-500 mt-1 max-w-[320px] leading-relaxed">
                  Select a support ticket from the inbox queue to load customer metrics, read messaging logs, and execute dispatch operations.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5 animate-in fade-in duration-200 flex-1 flex flex-col">
              
              {/* Workspace Header details */}
              <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 pb-4 gap-4">
                <div className="flex items-center gap-3">
                  {renderInitialsAvatar(selectedTicket.customer.name)}
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">{selectedTicket.subject}</h3>
                    <p className="text-[10px] text-zinc-550">
                      ID: <span className="font-mono text-purple-450 font-bold">{selectedTicket.ticketNumber}</span> • Customer: <span className="font-semibold text-zinc-300">{selectedTicket.customer.name}</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setWorkspaceTab('chat')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
                      workspaceTab === 'chat'
                        ? 'bg-purple-600/10 border border-purple-500/20 text-purple-300'
                        : 'text-zinc-550 hover:text-zinc-300'
                    }`}
                  >
                    Ticket Conversation
                  </button>
                  <button
                    onClick={() => setWorkspaceTab('operations')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
                      workspaceTab === 'operations'
                        ? 'bg-purple-600/10 border border-purple-500/20 text-purple-300'
                        : 'text-zinc-555 hover:text-zinc-300'
                    }`}
                  >
                    Operations & Payouts
                  </button>
                </div>
              </div>

              {/* TAB 1: Chat Conversation Area */}
              {workspaceTab === 'chat' && (
                <div className="flex-1 flex flex-col space-y-4">
                  {/* Chat Message Logs Container */}
                  <div className="flex-1 min-h-[300px] max-h-[380px] overflow-y-auto bg-zinc-950/20 border border-zinc-850/50 rounded-2xl p-4 space-y-4">
                    {chatHistories[selectedTicket.id]?.map((msg, idx) => {
                      const isCustomer = msg.sender === 'customer';
                      const isSystem = msg.sender === 'system';
                      
                      return (
                        <div 
                          key={idx}
                          className={`flex ${isCustomer ? 'justify-start' : isSystem ? 'justify-center' : 'justify-end'} animate-in fade-in duration-200`}
                        >
                          <div className={`max-w-[80%] rounded-2xl p-3.5 text-xs ${
                            isCustomer 
                              ? 'bg-zinc-850 border border-zinc-800 text-zinc-200 rounded-tl-none' 
                              : isSystem
                              ? 'bg-purple-950/10 border border-purple-500/10 text-purple-300 font-mono text-[10px] text-center w-full shadow-inner'
                              : 'bg-purple-600 text-white rounded-tr-none shadow-md shadow-purple-600/5'
                          }`}>
                            <div className="flex justify-between items-center gap-4 mb-1 text-[9px] opacity-70">
                              <span className="font-bold">
                                {isCustomer ? selectedTicket.customer.name : isSystem ? 'OpsPilot System Auto-Draft' : 'Support Agent'}
                              </span>
                              <span>{msg.timestamp}</span>
                            </div>
                            <p className="leading-relaxed whitespace-pre-line">{msg.text}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Reply Box */}
                  <div className="flex items-center gap-2 pb-1.5">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Reply to ${selectedTicket.customer.name}...`}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                      className="flex-1 px-4 py-3 bg-zinc-950/40 border border-zinc-850/80 focus:border-purple-500/50 rounded-xl text-xs text-zinc-100 placeholder-zinc-650 focus:outline-none transition-colors"
                    />
                    <button
                      onClick={handleSendReply}
                      className="px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all flex items-center justify-center cursor-pointer shadow-md shadow-purple-600/10 hover:shadow-purple-600/20 active:scale-[0.97]"
                      title="Send Reply"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: Operations & Payouts Area */}
              {workspaceTab === 'operations' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  
                  {/* Customer Analytics Badges */}
                  {(() => {
                    const stats = getCustomerStats(selectedTicket.customer.name);
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl border border-zinc-850 bg-zinc-950/20 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] font-bold text-zinc-550 uppercase block">Account Standing</span>
                            <span className="text-xs font-bold text-zinc-200 mt-1 block flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                              <span>{stats.tier} Account</span>
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-bold uppercase text-white bg-gradient-to-tr ${stats.color}`}>
                            {stats.tier}
                          </span>
                        </div>
                        <div className="p-4 rounded-xl border border-zinc-850 bg-zinc-950/20 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] font-bold text-zinc-550 uppercase block">Lifetime Value</span>
                            <span className="text-xs font-bold text-zinc-200 mt-1 block">
                              ₹{stats.ltv.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <TrendingUp className="w-5 h-5 text-emerald-450 shrink-0" />
                        </div>
                        <div className="p-4 rounded-xl border border-zinc-850 bg-zinc-950/20 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] font-bold text-zinc-550 uppercase block">Refund Velocity</span>
                            <span className="text-xs font-bold text-zinc-200 mt-1 block">
                              {stats.refundRatio}% refund ratio
                            </span>
                          </div>
                          <CreditCard className="w-5 h-5 text-zinc-500 shrink-0" />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Customer Details info block */}
                  <div className="p-4 rounded-xl border border-zinc-850 bg-zinc-950/40 text-xs flex flex-wrap gap-x-6 gap-y-2">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Mail className="w-3.5 h-3.5 text-zinc-550 shrink-0" />
                      <span>{selectedTicket.customer.email}</span>
                    </div>
                    {selectedTicket.customer.phone && (
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <Phone className="w-3.5 h-3.5 text-zinc-555 shrink-0" />
                        <span>{selectedTicket.customer.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Eligible Orders */}
                  <div className="space-y-3">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-550 block">Customer Eligible Orders</span>
                    
                    {selectedTicket.customer.orders.length === 0 ? (
                      <div className="p-6 text-center text-zinc-650 text-xs italic border border-dashed border-zinc-850 rounded-xl">
                        No orders registered for this customer.
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                        {selectedTicket.customer.orders.map((o) => {
                          const alreadyRefunded = o.status === 'REFUNDED' || o.refunds.length > 0;
                          const activeRefund = o.refunds?.[0];
                          const isOrderMentioned = selectedTicket.description.includes(o.orderNumber) || selectedTicket.subject.includes(o.orderNumber);

                          return (
                            <div
                              key={o.id}
                              className={`p-4 rounded-xl border flex flex-col justify-between space-y-4 transition-all ${
                                isOrderMentioned 
                                  ? 'bg-[#0f1422]/60 border-purple-500/25 shadow-md shadow-purple-950/10'
                                  : 'bg-zinc-950/15 border-zinc-850/50 hover:border-zinc-800'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono font-bold text-purple-400">Order #{o.orderNumber}</span>
                                    {isOrderMentioned && (
                                      <span className="text-[8px] bg-purple-500/10 text-purple-400 font-bold border border-purple-500/25 px-1.5 py-0.25 rounded uppercase tracking-wider">
                                        Mentioned in Ticket
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-zinc-500 block mt-1">
                                    Purchased: {new Date(o.createdAt).toLocaleDateString()}
                                  </span>
                                  
                                  {/* Order Items list */}
                                  <div className="mt-2.5 space-y-1">
                                    {o.items?.map((item) => (
                                      <div key={item.id} className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                                        <ShoppingBag className="w-3 h-3 text-zinc-650 shrink-0" />
                                        <span className="font-semibold text-zinc-350">{item.quantity}x</span>
                                        <span className="truncate max-w-[220px]">{item.product.name}</span>
                                        <span className="text-zinc-600 font-mono text-[9px]">({item.product.sku})</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="text-right">
                                  <span className="text-xs font-bold text-zinc-205 block">
                                    ₹{Number(o.totalAmount).toLocaleString('en-IN')}
                                  </span>
                                  <span className="text-[10px] text-zinc-500 block mt-1">
                                    Currency: INR
                                  </span>
                                </div>
                              </div>

                              <div className="border-t border-zinc-850/30 pt-3 flex items-center justify-between">
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                    o.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/10' :
                                    o.status === 'REFUNDED' ? 'bg-rose-500/10 text-rose-455 border border-rose-500/10' :
                                    o.status === 'DELAYED' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10 animate-pulse' :
                                    'bg-zinc-800 text-zinc-400'
                                  }`}
                                >
                                  {o.status}
                                </span>
                                
                                {!alreadyRefunded ? (
                                  <button
                                    onClick={() => handleOpenRefundModal(o)}
                                    className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-705 text-[10px] font-bold text-purple-300 hover:text-purple-200 transition-all flex items-center gap-1 cursor-pointer"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Issue Refund</span>
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    {activeRefund?.status === 'PENDING' ? (
                                      <span className="text-[10px] text-amber-405 font-bold flex items-center gap-1 bg-amber-500/5 px-2.5 py-0.5 rounded border border-amber-500/15 animate-pulse">
                                        <AlertCircle className="w-3.5 h-3.5 text-amber-450" />
                                        <span>Refund Pending (Review)</span>
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-rose-405 font-bold flex items-center gap-1 bg-rose-500/5 px-2.5 py-0.5 rounded border border-rose-500/15">
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Refund Settled</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

      </div>

      {/* Refunds History Table */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 glass">
        <h3 className="text-sm font-semibold text-zinc-200 pb-4 border-b border-zinc-800/80 flex items-center gap-2">
          <History className="w-4.5 h-4.5 text-purple-400" />
          <span>Audit Logs: Refund Transaction History</span>
        </h3>

        {isRefundsLoading ? (
          <div className="py-12 text-center text-zinc-550 text-xs">Loading audit trail logs...</div>
        ) : refunds.length === 0 ? (
          <div className="text-center py-12 text-zinc-555 text-xs italic">No refunds records registered.</div>
        ) : (
          <div className="overflow-x-auto mt-4 border border-zinc-800/50 rounded-xl bg-zinc-950/20">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/50 border-b border-zinc-800/80 text-zinc-405 uppercase tracking-wider text-[9px] font-bold">
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
                  <tr key={r.id} className="hover:bg-zinc-905/30 transition-colors">
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
                            : 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/10'
                        }`}
                      >
                        {r.riskScore}/100
                      </span>
                    </td>
                    <td className="p-3.5 text-zinc-400 truncate max-w-[180px]" title={r.reason}>
                      {r.reason}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-zinc-300">
                      ₹{Number(r.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3.5 text-right">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          r.status === 'APPROVED' || r.status === 'EXECUTED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                            : r.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-405 border border-amber-500/10 animate-pulse'
                            : 'bg-rose-500/10 text-rose-455 border border-rose-500/10'
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

      {/* Itemized Refund Wizard Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#0f1422]/95 backdrop-blur-2xl p-6 shadow-2xl flex flex-col md:flex-row gap-6 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Left Hand: Refund item checklist options */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-purple-400" />
                  <span>Itemized Refund Wizard</span>
                </h3>
              </div>

              {/* Item checklist */}
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {selectedOrder.items.map((item) => {
                  const isChecked = !!selectedItems[item.id];
                  const currentQty = selectedQuantities[item.id] || 1;
                  
                  return (
                    <div 
                      key={item.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-4 transition-all ${
                        isChecked 
                          ? 'bg-purple-950/5 border-purple-500/20' 
                          : 'bg-zinc-950/25 border-zinc-900/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleItemSelection(item.id)}
                          className="w-4 h-4 rounded text-purple-600 bg-zinc-900 border-zinc-800 focus:ring-purple-500 focus:ring-offset-zinc-950 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-zinc-250 block truncate">{item.product.name}</span>
                          <span className="text-[10px] text-zinc-550 block font-mono">₹{Number(item.price).toLocaleString('en-IN')} each</span>
                        </div>
                      </div>

                      {/* Quantity selector */}
                      {isChecked && (
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="text-[9px] text-zinc-500 font-bold uppercase">Qty:</label>
                          <select
                            value={currentQty}
                            onChange={(e) => setItemQuantity(item.id, Number(e.target.value))}
                            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                          >
                            {[...Array(item.quantity)].map((_, i) => (
                              <option key={i + 1} value={i + 1}>{i + 1}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Custom Override Toggle */}
              <div className="pt-2 border-t border-zinc-850/40 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-450 font-medium">Custom Refund Amount Override</span>
                  <input
                    type="checkbox"
                    checked={isCustomAmountEnabled}
                    onChange={(e) => setIsCustomAmountEnabled(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-purple-600 bg-zinc-900 border-zinc-800 cursor-pointer"
                  />
                </div>
                {isCustomAmountEnabled && (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">₹</span>
                    <input
                      type="number"
                      value={customRefundAmount}
                      onChange={(e) => setCustomRefundAmount(e.target.value)}
                      placeholder="Enter override value..."
                      className="w-full pl-7 pr-3 py-2 bg-zinc-950/40 border border-zinc-800/80 focus:border-purple-500/50 rounded-lg text-xs text-zinc-200 placeholder-zinc-650 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Refund Reason input */}
              <div>
                <label className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider block mb-1">
                  Refund Reason (Audit Log)
                </label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Defective product, double charged..."
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-150 focus:outline-none focus:border-purple-500/50"
                />
              </div>
            </div>

            {/* Right Hand: SVG risk dial & summary */}
            <div className="w-full md:w-64 rounded-xl border border-zinc-850 bg-zinc-950/30 p-5 flex flex-col justify-between space-y-4">
              
              {/* Dynamic Risk Gauge */}
              {(() => {
                const risk = getSimulatedRiskInfo(selectedOrder.orderNumber, finalRefundAmount);
                const score = risk.score;
                
                // SVG circle calculations
                const radius = 40;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (score / 100) * circumference;

                const colorClass = 
                  score > 70 ? 'text-rose-500' : 
                  score > 40 ? 'text-amber-500' : 
                  'text-emerald-500';

                return (
                  <div className="space-y-4 flex flex-col items-center">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 text-center block">
                      Governance Risk Engine
                    </span>

                    {/* Circular Dial */}
                    <div className="relative w-28 h-28 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        {/* Background track */}
                        <circle
                          cx="56"
                          cy="56"
                          r={radius}
                          stroke="#18181b"
                          strokeWidth="8"
                          fill="transparent"
                        />
                        {/* Glowing progress track */}
                        <circle
                          cx="56"
                          cy="56"
                          r={radius}
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={circumference}
                          strokeDashoffset={offset}
                          className={`${colorClass} transition-all duration-500`}
                        />
                      </svg>
                      {/* Center text */}
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-xl font-bold text-zinc-100">{score}%</span>
                        <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-550">Risk</span>
                      </div>
                    </div>

                    {/* Policy reasons alerts list */}
                    <div className="w-full space-y-2 border-t border-zinc-850/40 pt-3">
                      {risk.rules.length === 0 ? (
                        <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-450 shrink-0" />
                          <span>No policy warnings flagged.</span>
                        </div>
                      ) : (
                        risk.rules.map((rule, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-[9px] text-zinc-400 leading-normal">
                            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                            <span>{rule}</span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Governance status indicator */}
                    <div className="w-full p-2.5 rounded-lg border border-zinc-850/60 bg-zinc-950/50 flex justify-between items-center text-[10px]">
                      <span className="text-zinc-500">Decision:</span>
                      {risk.requiresApproval ? (
                        <span className="text-amber-450 font-bold flex items-center gap-1 animate-pulse">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span>Manager Review</span>
                        </span>
                      ) : (
                        <span className="text-emerald-450 font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          <span>Auto Bypass</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Submit / Cancel actions */}
              <div className="space-y-2 pt-2 border-t border-zinc-850/40">
                <div className="flex justify-between items-center text-xs pb-2">
                  <span className="text-zinc-500 font-medium">Refund Amount:</span>
                  <span className="text-zinc-200 font-bold text-sm">
                    ₹{finalRefundAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <button
                  onClick={handleSubmitRefund}
                  disabled={requestRefundMutation.isPending || finalRefundAmount <= 0}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-850 text-xs font-bold text-white disabled:text-zinc-500 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/10"
                >
                  {requestRefundMutation.isPending ? 'Submitting...' : 'Confirm Refund'}
                  {!requestRefundMutation.isPending && <ArrowRight className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleCloseRefundModal}
                  className="w-full py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-705 text-zinc-400 hover:text-zinc-200 text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
