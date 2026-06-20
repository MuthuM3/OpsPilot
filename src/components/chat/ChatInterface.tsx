'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, Check, AlertTriangle, ShieldCheck, Database, Upload, ArrowRight, Loader2, MessageSquare, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/components/Providers';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function SwarmLoader() {
  const [step, setStep] = useState(0);
  const steps = [
    { activeId: 'coordinator', text: 'Coordinator Agent: Analyzing request intent...' },
    { activeId: 'refund', text: 'Refund Agent: Evaluating policy & gateway rules...' },
    { activeId: 'inventory', text: 'Inventory Agent: Syncing stock allocations...' },
    { activeId: 'support', text: 'Support Agent: Preparing notification templates...' }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => (s + 1) % steps.length);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const current = steps[step];
  
  const agents = [
    { id: 'coordinator', label: 'Coordinator Agent' },
    { id: 'refund', label: 'Refund Agent' },
    { id: 'inventory', label: 'Inventory Agent' },
    { id: 'support', label: 'Support Agent' }
  ];

  return (
    <div className="flex justify-start w-full animate-in fade-in duration-200">
      <div className="max-w-[95%] w-full rounded-xl p-4 bg-[#0a0d16] border border-purple-500/15 space-y-4 shadow-xl shadow-purple-950/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
              Autonomous Swarm Orchestration
            </span>
          </div>
          <span className="text-[8px] bg-purple-500/10 text-purple-400 font-mono px-2 py-0.5 rounded font-bold tracking-wider">
            Swarm active
          </span>
        </div>

        {/* Visual Swarm Flow Chart */}
        <div className="relative pl-6 space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-[1px] before:bg-zinc-800/80">
          {agents.map((agent) => {
            const isActive = current.activeId === agent.id;
            return (
              <div key={agent.id} className="relative transition-all duration-300">
                {/* Node Dot */}
                <div className={`absolute -left-[20px] top-1 w-3.5 h-3.5 rounded-full border bg-zinc-950 flex items-center justify-center shrink-0 z-10 ${
                  isActive 
                    ? 'border-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.6)] bg-purple-950/30' 
                    : 'border-zinc-800 bg-zinc-900'
                }`}>
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />}
                </div>

                {/* Node Box */}
                <div className={`p-2.5 rounded-lg border text-[10px] transition-all duration-300 ${
                  isActive
                    ? 'bg-purple-950/15 border-purple-500/30 text-purple-300 shadow-md shadow-purple-950/5'
                    : 'bg-zinc-900/30 border-zinc-850/60 text-zinc-500 opacity-60'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className={`font-semibold ${isActive ? 'text-zinc-200' : ''}`}>
                      {agent.label}
                    </span>
                    {isActive && (
                      <span className="text-[8px] font-mono uppercase tracking-wider text-purple-400 animate-pulse font-bold">
                        Working...
                      </span>
                    )}
                  </div>
                  {isActive && (
                    <p className="text-[9px] text-zinc-400 mt-1 font-mono leading-relaxed">
                      {current.text}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ChatInterface() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { 
    activeTab, 
    setActiveTab, 
    activeChatId, 
    setActiveChatId, 
    chatMode: mode, 
    setChatMode: setMode,
    isChatOpen,
    setIsChatOpen,
    showToast
  } = useWorkspace();
  
  const [width, setWidth] = useState(420);
  const isResizing = useRef(false);
  
  const [input, setInput] = useState('');
  
  // Custom states for running inline timelines
  const [completedApprovals, setCompletedApprovals] = useState<Record<string, { 
    status: 'APPROVED' | 'REJECTED' | 'FAILED'; 
    steps: string[]; 
    currentStepIndex: number;
    error?: string;
  }>>({});
  const [processingInlineApprovals, setProcessingInlineApprovals] = useState<Record<string, 'APPROVING' | 'REJECTING'>>({});
  const [showCsvWhy, setShowCsvWhy] = useState<number | null>(null);
  const [showApprovalWhy, setShowApprovalWhy] = useState<Record<string, boolean>>({});
  
  // Multi-session chat conversations database
  const [chatSessions, setChatSessions] = useState<Record<string, Message[]>>({
    'refund-flow': [
      {
        role: 'assistant',
        content: `Hello! I am **OpsPilot**, your AI Operations Assistant. 

I can execute operations with safety guidelines and strict approval checkpoints:
* Try requesting a refund: **"Refund Order #ORD-1024"** (Make sure to toggle to **Agent Mode** to test governance controls!).
* Or ask me about **"delayed shipments"** to retrieve context from the database.

How can I help you today?`
      }
    ],
    'inventory-flow': [
      {
        role: 'assistant',
        content: `Welcome to the **Inventory Synchronization Module**.

You can upload supplier CSV files directly in chat to normalize prices and stock:
1. Click the paperclip icon \`📎\` below.
2. Select your supplier CSV file.
3. AI will map the headers and preview the database updates inline.`
      }
    ],
    'support-flow': [
      {
        role: 'assistant',
        content: `I am running in **Ask Mode** (Read-Only). 

You can ask me questions about shipments, products, or tickets:
* Try asking: **"Which shipments are delayed?"**
* Or ask: **"List active inventory"** to check database records.`
      }
    ]
  });

  const messages = chatSessions[activeChatId] || [];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isChatOpen]);

  // Handle panel resizing
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  };

  const resize = (e: MouseEvent) => {
    if (!isResizing.current || !containerRef.current) return;
    const containerLeft = containerRef.current.getBoundingClientRect().left;
    const newWidth = e.clientX - containerLeft;
    if (newWidth > 320 && newWidth < 650) {
      setWidth(newWidth);
    }
  };

  const stopResize = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
  };

  // Mutation to send chat message
  const chatMutation = useMutation({
    mutationFn: async (payload: { updatedMessages: Message[]; currentMode: 'ask' | 'agent' }) => {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload.updatedMessages, mode: payload.currentMode }),
      });
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      const data = await response.json();
      return data.response as string;
    },
    onSuccess: (botResponse) => {
      setChatSessions(prev => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] || []), { role: 'assistant', content: botResponse }]
      }));

      // WORKSPACE ACTION SWITCH:
      // If AI recommends approval or triggers refund, automatically switch the main Workspace tab to Approvals!
      if (botResponse.includes('[APPROVAL_CARD:')) {
        setActiveTab('approvals');
      }
    },
    onError: () => {
      setChatSessions(prev => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] || []), { role: 'assistant', content: '⚠️ Sorry, I encountered an error. Please try again.' }]
      }));
    }
  });

  // Mutation to upload CSV directly in chat
  const fileUploadMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await fetch('/api/inventory/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to map CSV file');
      }
      return res.json();
    },
    onSuccess: (data) => {
      // Append success parser response in chat
      const formattedPreview = `[CSV_MAPPING_CARD: ${JSON.stringify(data)}]`;
      setChatSessions(prev => ({
        ...prev,
        [activeChatId]: [
          ...(prev[activeChatId] || []),
          { role: 'assistant', content: `I have analyzed the CSV file and generated column mapping recommendations:\n\n${formattedPreview}` }
        ]
      }));

      // WORKSPACE ACTION SWITCH:
      // Auto-switch main workspace to Inventory tab so the user sees the database listing updating
      setActiveTab('inventory');
    },
    onError: (err: any) => {
      setChatSessions(prev => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] || []), { role: 'assistant', content: `❌ CSV Upload Failed: ${err.message}` }]
      }));
    }
  });

  const handleSend = (text: string, modeOverride?: 'ask' | 'agent') => {
    if (!text.trim() || chatMutation.isPending) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    
    // Update local state first
    setChatSessions(prev => ({
      ...prev,
      [activeChatId]: newMessages
    }));
    
    setInput('');
    chatMutation.mutate({ updatedMessages: newMessages, currentMode: modeOverride || mode });

    // WORKSPACE ACTION SWITCH:
    // If user checks delayed shipments, automatically switch main workspace to Dashboard/Timeline
    if (text.toLowerCase().includes('delay') || text.toLowerCase().includes('shipment')) {
      setActiveTab('dashboard');
    }
    if (text.toLowerCase().includes('inventory') || text.toLowerCase().includes('product')) {
      setActiveTab('inventory');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Append user announcement in chat
      setChatSessions(prev => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] || []), { role: 'user', content: `📎 Attached CSV: ${selectedFile.name}` }]
      }));
      
      fileUploadMutation.mutate(selectedFile);
    }
  };

  // Submit CSV mapping for approval inline in chat
  const handleInlineSubmitCsv = async (cardData: any, messageIdx: number) => {
    try {
      const res = await fetch('/api/inventory/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_approval',
          uploadId: cardData.uploadId,
          mapping: cardData.mapping,
          products: cardData.preview
        }),
      });

      if (!res.ok) throw new Error('Failed to submit CSV approval');
      const data = await res.json();

      // Convert card data to approval card
      const approvalCardPayload = {
        id: data.approvalId,
        type: 'INVENTORY_UPDATE',
        filename: cardData.filename,
        productCount: cardData.preview.length,
        products: cardData.preview
      };

      setChatSessions(prev => {
        const newMessages = [...(prev[activeChatId] || [])];
        newMessages[messageIdx] = {
          role: 'assistant',
          content: `Inventory mapping submitted! Direct updates are blocked by our governance check. Here is the active approval request:\n\n[APPROVAL_CARD: ${JSON.stringify(approvalCardPayload)}]`
        };
        return { ...prev, [activeChatId]: newMessages };
      });
      
      // Auto-switch to approvals page
      setActiveTab('approvals');
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Inline Approval Card execution
  const handleInlineApprove = async (approvalId: string, type: string) => {
    setProcessingInlineApprovals(prev => ({ ...prev, [approvalId]: 'APPROVING' }));

    try {
      const res = await fetch('/api/approvals/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Approval execution failed');
      }

      // Switch workspace tab to Timeline to watch logs
      setActiveTab('timeline');

      // Clear processing loader
      setProcessingInlineApprovals(prev => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });

      // 1. Set the initial steps state (6-step detailed plan)
      const steps = type === 'INVENTORY_UPDATE'
        ? [
            'Validate CSV Schema',
            'Check Data Consistency',
            'Approval Granted',
            'Upsert Products in Database',
            'Sync Shopify Inventory',
            'Log Sync Transaction'
          ]
        : type === 'DISCOUNT_CREATION'
        ? [
            'Validate Request',
            'Check Coupon Velocity',
            'Approval Granted',
            'Deploy Coupon Rules',
            'Notify Marketing Admin',
            'Update Promotion Database'
          ]
        : [
            'Validate Order',
            'Check Eligibility',
            'Approval Granted',
            'Create Refund',
            'Notify Customer',
            'Update Ticket'
          ];
      
      setCompletedApprovals(prev => ({
        ...prev,
        [approvalId]: { status: 'APPROVED', steps, currentStepIndex: 2 }
      }));

      // Trigger step-by-step ticking simulation starting at step index 2
      let currentIdx = 2;
      const interval = setInterval(() => {
        currentIdx++;
        setCompletedApprovals(prev => {
          if (!prev[approvalId] || prev[approvalId].status !== 'APPROVED') return prev;
          return {
            ...prev,
            [approvalId]: { ...prev[approvalId], currentStepIndex: currentIdx }
          };
        });
        if (currentIdx >= steps.length) {
          clearInterval(interval);
        }
      }, 850);

      showToast("Action approved and executed successfully.", "success");

      // Sync other dashboard segments
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err: any) {
      console.error(err);
      
      setProcessingInlineApprovals(prev => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });

      setCompletedApprovals(prev => ({
        ...prev,
        [approvalId]: { 
          status: 'FAILED', 
          steps: ['❌ Execution pipeline started', '❌ Server transaction rejected'], 
          currentStepIndex: 1,
          error: err.message || 'Approval execution failed'
        }
      }));

      showToast(err.message || 'Failed to execute approval', 'error');
    }
  };

  const handleInlineReject = async (approvalId: string) => {
    setProcessingInlineApprovals(prev => ({ ...prev, [approvalId]: 'REJECTING' }));
    
    try {
      const res = await fetch('/api/approvals/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, reason: 'Rejected inline via chat operator.' }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to reject request');
      }
      
      setProcessingInlineApprovals(prev => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });

      setCompletedApprovals(prev => ({
        ...prev,
        [approvalId]: { status: 'REJECTED', steps: ['✓ Rejection requested', '✓ Approval cancelled'], currentStepIndex: 2 }
      }));

      showToast("Request successfully rejected.", "info");

      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    } catch (err: any) {
      console.error(err);
      setProcessingInlineApprovals(prev => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });
      showToast(err.message || 'Failed to reject approval', 'error');
    }
  };

  const handleNextActionClick = (action: string) => {
    // Clean prefix dot/bullet if present
    const cleanAction = action.replace(/^[•\s\-\*]+/g, '').trim();
    
    if (cleanAction === 'Review Similar Refunds') {
      setActiveTab('approvals');
    } else if (cleanAction === 'View Promotion Metrics') {
      setActiveTab('dashboard');
    } else if (cleanAction === 'View Product Catalog') {
      setActiveTab('inventory');
    } else if (cleanAction === 'Notify Customer') {
      handleSend("send customer notification for Alice's refund");
    } else if (cleanAction === 'Escalate To Finance') {
      handleSend("escalate this refund transaction to finance");
    } else if (cleanAction === 'Email VIP Customers') {
      handleSend("email VIP customers about SORRY25 promo code");
    } else if (cleanAction === 'Verify Shopify Stocks') {
      handleSend("verify Shopify inventory sync status");
    } else if (cleanAction === 'Re-Index Store Search') {
      handleSend("re-index catalog search engine");
    } else {
      handleSend(cleanAction);
    }
  };

  const handleReplayPipeline = (approvalId: string, steps: string[]) => {
    setCompletedApprovals(prev => ({
      ...prev,
      [approvalId]: { ...prev[approvalId], currentStepIndex: 0 }
    }));
    
    let currentIdx = 0;
    const interval = setInterval(() => {
      currentIdx++;
      setCompletedApprovals(prev => {
        if (!prev[approvalId]) return prev;
        return {
          ...prev,
          [approvalId]: { ...prev[approvalId], currentStepIndex: currentIdx }
        };
      });
      if (currentIdx >= steps.length) {
        clearInterval(interval);
      }
    }, 750);
  };

  // Custom inline component renderers
  const renderInlineCard = (messageContent: string, messageIdx: number) => {
    const cards: React.ReactNode[] = [];

    // 1. Check for CSV Mapping Cards
    const csvRegex = /\[CSV_MAPPING_CARD:\s*(\{.*?\})\s*\]/g;
    let match;
    while ((match = csvRegex.exec(messageContent)) !== null) {
      try {
        const cardData = JSON.parse(match[1]);
        const isWhyCsvOpen = showCsvWhy === messageIdx;
        cards.push(
          <div key={`csv-${match.index}`} className="mt-4 p-4 rounded-xl border border-zinc-800 bg-zinc-950/40 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/40">
              <div>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">CSV Mapping Recommendations</span>
                <span className="text-[8px] text-purple-400 font-mono">Confidence: 96%</span>
              </div>
              <div className="flex gap-1.5 items-center">
                <button
                  onClick={() => setShowCsvWhy(isWhyCsvOpen ? null : messageIdx)}
                  className="px-2 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 font-bold text-[8.5px] transition-all flex items-center gap-1 cursor-pointer border border-purple-500/20"
                >
                  Why mapped this way?
                </button>
                <span className="text-[9px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded font-bold">AI suggestion</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              {Object.entries(cardData.mapping).slice(0, 4).map(([header, target], idx) => {
                const confs = [98, 95, 97, 94];
                const confidence = confs[idx % confs.length];
                return (
                  <div key={header} className="p-2 rounded bg-zinc-900 border border-zinc-800/40 flex justify-between">
                    <span className="text-zinc-500 truncate max-w-[80px]">{header}</span>
                    <span className="text-purple-400 font-semibold">
                      → {(target as string) || 'ignore'}{' '}
                      <span className="text-[8px] text-zinc-500">({confidence}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>

            {isWhyCsvOpen && (
              <div className="p-2.5 rounded bg-[#090e18] border border-zinc-850 space-y-1 text-[9.5px] text-zinc-400 animate-in fade-in slide-in-from-top-1 duration-200">
                <span className="font-bold text-purple-300 block mb-0.5">AI Mapping Confidence Metrics:</span>
                <p>• <strong>SKU ➔ Product Code</strong>: matched with 98% confidence based on field names.</p>
                <p>• <strong>Stock ➔ Available Qty</strong>: matched with 95% confidence via value distribution.</p>
                <p>• <strong>Price ➔ Cost</strong>: matched with 97% confidence via semantic synonym mapping.</p>
              </div>
            )}

            <div className="border border-zinc-800/60 rounded-lg overflow-hidden bg-zinc-900/10 text-[10px]">
              <table className="w-full text-left">
                <thead className="bg-zinc-950 text-zinc-500 uppercase tracking-wider text-[8px] font-bold">
                  <tr>
                    <th className="p-2">SKU</th>
                    <th className="p-2">Name</th>
                    <th className="p-2 text-right">Price</th>
                    <th className="p-2 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/30 text-zinc-300">
                  {cardData.preview.slice(0, 3).map((p: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2 font-mono text-[9px] text-purple-300">{p.sku}</td>
                      <td className="p-2 truncate max-w-[100px]">{p.name}</td>
                      <td className="p-2 text-right font-mono">₹{p.price}</td>
                      <td className="p-2 text-right font-bold text-zinc-200">{p.inventory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => handleInlineSubmitCsv(cardData, messageIdx)}
              className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-[10px] font-bold text-white transition-all flex items-center justify-center gap-1 shadow-md shadow-purple-600/10 cursor-pointer"
            >
              <span>Submit for Governance Approval</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      } catch (err) {
        cards.push(<p key={`csv-err-${match.index}`} className="text-[10px] text-rose-500 mt-2">Failed to render CSV preview card.</p>);
      }
    }

    // 2. Check for Approval Cards
    const approvalRegex = /\[APPROVAL_CARD:\s*(\{.*?\})\s*\]/g;
    while ((match = approvalRegex.exec(messageContent)) !== null) {
      try {
        const cardData = JSON.parse(match[1]);
        const approvalState = completedApprovals[cardData.id];

        if (approvalState) {
          const isSuccess = approvalState.status === 'APPROVED' && approvalState.currentStepIndex >= approvalState.steps.length;
          
          const nextActions = cardData.type === 'REFUND_REQUEST'
            ? ['Notify Customer', 'Review Similar Refunds', 'Escalate To Finance']
            : cardData.type === 'DISCOUNT_CREATION'
            ? ['Copy Promo Code', 'Email VIP Customers', 'View Promotion Metrics']
            : ['Verify Shopify Stocks', 'Re-Index Store Search', 'View Product Catalog'];

          const timestamps = ['10:01', '10:02', '10:04', '10:05', '10:06', '10:07'];

          cards.push(
            <div key={`approval-state-${cardData.id}`} className="mt-4 p-4 rounded-xl border border-zinc-800 bg-[#070b15]/90 space-y-4 animate-in fade-in duration-200 glass">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/40">
                <div>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Inline Execution Pipeline</span>
                  <span className="text-[8px] text-purple-400 font-mono">Intent: {cardData.type === 'REFUND_REQUEST' ? 'Refund Order' : cardData.type === 'DISCOUNT_CREATION' ? 'Create Promo' : 'Sync Inventory'} (94% Conf)</span>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                  approvalState.status === 'REJECTED'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    : approvalState.status === 'FAILED'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse'
                    : isSuccess
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-purple-500/10 border-purple-500/20 text-purple-400 animate-pulse'
                }`}>
                  {approvalState.status === 'REJECTED' ? 'REJECTED' : approvalState.status === 'FAILED' ? 'FAILED' : isSuccess ? 'SUCCESS' : 'EXECUTING'}
                </span>
              </div>

              <div className="space-y-2 pl-2">
                {approvalState.steps.map((step, idx) => {
                  const isPending = idx > approvalState.currentStepIndex;
                  const isRunning = idx === approvalState.currentStepIndex && approvalState.status === 'APPROVED';
                  const isFailed = idx === approvalState.currentStepIndex && approvalState.status === 'FAILED';
                  const isCompleted = idx < approvalState.currentStepIndex || (idx === approvalState.currentStepIndex && approvalState.status === 'APPROVED' && isSuccess);

                  return (
                    <div
                      key={idx}
                      className={`text-[10px] flex items-center justify-between transition-all ${
                        isPending ? 'text-zinc-655 opacity-40' : isRunning ? 'text-purple-400 animate-pulse font-medium' : isFailed ? 'text-rose-405 font-bold' : 'text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isPending ? (
                          <div className="h-3.5 w-3.5 rounded border border-zinc-800 shrink-0 text-[8px] font-bold flex items-center justify-center text-zinc-650">□</div>
                        ) : isRunning ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-450 shrink-0" />
                        ) : isFailed ? (
                          <div className="w-3.5 h-3.5 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                            <X className="w-2.5 h-2.5 text-rose-400" />
                          </div>
                        ) : isCompleted ? (
                          <div className="w-3.5 h-3.5 rounded-full bg-emerald-550/15 border border-emerald-550/30 flex items-center justify-center shrink-0">
                            <Check className="w-2.5 h-2.5 text-emerald-450" />
                          </div>
                        ) : (
                          // Rejected state
                          <div className="w-3.5 h-3.5 rounded-full bg-rose-550/15 border border-rose-550/30 flex items-center justify-center shrink-0">
                            <X className="w-2.5 h-2.5 text-rose-455" />
                          </div>
                        )}
                        <span>{step}</span>
                      </div>
                      {!isPending && !isRunning && !isFailed && (
                        <span className="text-zinc-500 font-mono text-[8px] bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800/40 shrink-0">
                          {timestamps[idx] || '10:01'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {isSuccess && (
                <div className="pt-3 border-t border-zinc-800/40 space-y-3">
                  <div className="space-y-1.5">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500 block px-1">
                      Recommended Actions
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {nextActions.map((action) => (
                        <button
                          key={action}
                          onClick={() => handleNextActionClick(action)}
                          className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-purple-500/40 text-purple-300 hover:text-white text-[9px] transition-all cursor-pointer font-medium"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => handleReplayPipeline(cardData.id, approvalState.steps)}
                    className="w-full py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-[9px] font-semibold text-zinc-400 hover:text-zinc-200 transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Replay Execution Sequence</span>
                  </button>
                </div>
              )}

              {approvalState.status === 'FAILED' && (
                <div className="pt-3 border-t border-zinc-800/40 space-y-3">
                  <div className="p-2.5 rounded bg-rose-500/5 border border-rose-500/20 text-[10px] text-zinc-350">
                    <span className="font-bold text-rose-400 block mb-0.5">Execution Error:</span>
                    <p className="italic text-zinc-400">"{approvalState.error}"</p>
                  </div>
                  <button
                    onClick={() => handleInlineApprove(cardData.id, cardData.type)}
                    className="w-full py-1.5 rounded-lg bg-purple-650 hover:bg-purple-600 text-[10px] font-bold text-white transition-all flex items-center justify-center gap-1 shadow-md shadow-purple-650/10 cursor-pointer"
                  >
                    <span>Retry Execution</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {approvalState.status === 'REJECTED' && (
                <div className="pt-3 border-t border-zinc-800/40">
                  <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800/40 text-[10px] text-zinc-400 italic">
                    This request was rejected and cancelled by the operator.
                  </div>
                </div>
              )}
            </div>
          );
        } else {
          const isWhyOpen = !!showApprovalWhy[cardData.id];
          const blockedSteps = cardData.type === 'INVENTORY_UPDATE'
            ? ['Validate CSV Schema', 'Check Data Consistency', 'Waiting Approval', 'Upsert Products in Database', 'Sync Shopify Inventory', 'Log Sync Transaction']
            : cardData.type === 'DISCOUNT_CREATION'
            ? ['Validate Request', 'Check Coupon Velocity', 'Waiting Approval', 'Deploy Coupon Rules', 'Notify Marketing Admin', 'Update Promotion Database']
            : ['Validate Order', 'Check Eligibility', 'Waiting Approval', 'Create Refund', 'Notify Customer', 'Update Ticket'];

          cards.push(
            <div key={`approval-${cardData.id}`} className="mt-4 p-4 rounded-xl border border-zinc-800 bg-[#0f1422] space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/40">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Governance Check Required</span>
                </span>
                <div className="flex gap-1.5 items-center">
                  <button
                    onClick={() => setShowApprovalWhy(prev => ({ ...prev, [cardData.id]: !prev[cardData.id] }))}
                    className="px-1.5 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 font-bold text-[8.5px] transition-all flex items-center gap-1 cursor-pointer border border-purple-500/20"
                  >
                    Why?
                  </button>
                  <span className="text-[9px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded font-bold">
                    Intent Match: 96%
                  </span>
                  {cardData.riskScore !== undefined && (
                    <span className="text-[9px] bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded font-bold">
                      Risk Score: {cardData.riskScore}/100
                    </span>
                  )}
                </div>
              </div>

              <div className="text-[11px] space-y-3">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Operation Type:</span>
                  <span className="font-semibold text-zinc-300">
                    {cardData.type === 'INVENTORY_UPDATE' ? 'Sync Inventory' : cardData.type === 'DISCOUNT_CREATION' ? 'Create Coupon' : 'Order Refund'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Details:</span>
                  <span className="font-semibold text-zinc-200">
                    {cardData.type === 'INVENTORY_UPDATE'
                      ? `${cardData.productCount} SKU updates mapped`
                      : cardData.type === 'DISCOUNT_CREATION'
                      ? `Coupon ${cardData.code} (${cardData.amount}% Off)`
                      : `₹${cardData.amount?.toLocaleString('en-IN')} Payout`}
                  </span>
                </div>

                {isWhyOpen && cardData.explanation && (
                  <div className="p-2.5 rounded bg-zinc-950/30 border border-zinc-800/40 text-[10px] italic text-zinc-400 animate-in fade-in slide-in-from-top-1 duration-200">
                    "{cardData.explanation}"
                  </div>
                )}

                {/* Blocked Execution Plan */}
                <div className="border-t border-zinc-800/40 pt-3 space-y-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 block">
                    Blocked Execution Plan
                  </span>
                  <div className="space-y-1.5 pl-2">
                    {blockedSteps.map((step, idx) => {
                      if (idx < 2) {
                        return (
                          <div key={idx} className="flex items-center gap-2 text-[10px] text-emerald-450 font-medium">
                            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                            </div>
                            <span>{step}</span>
                          </div>
                        );
                      }
                      if (idx === 2) {
                        return (
                          <div key={idx} className="flex items-center gap-2 text-[10px] text-purple-400 font-bold animate-pulse">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 shrink-0" />
                            <span>{step} (Awaiting Manager Sign-off)</span>
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="flex items-center gap-2 text-[10px] text-zinc-650 opacity-40">
                          <div className="h-3.5 w-3.5 rounded border border-zinc-800 shrink-0 flex items-center justify-center text-[8px] font-bold text-zinc-600">□</div>
                          <span>{step}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Governance Insight & Memory */}
                {isWhyOpen && (
                  <div className="p-2.5 rounded bg-[#090e18] border border-zinc-800/60 space-y-1.5 text-[10px] animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex justify-between text-zinc-400">
                      <span className="font-semibold text-zinc-300">Why was this flagged?</span>
                      <span className="text-[9px] bg-rose-500/10 text-rose-400 px-1 py-0.5 rounded font-mono font-bold">Policy Breach</span>
                    </div>
                    <p className="text-zinc-400 leading-relaxed text-[9.5px]">
                      {cardData.type === 'DISCOUNT_CREATION'
                        ? `Coupon discount (${cardData.amount}%) exceeds the 20% safe-limit threshold for store managers.`
                        : `Refund payout (₹${cardData.amount?.toLocaleString('en-IN')}) exceeds the ₹10,000 threshold and triggers return velocity checks.`}
                    </p>
                    <div className="border-t border-zinc-800/30 pt-2 flex justify-between text-[9px] text-zinc-500 font-medium">
                      <span>Memory: 3 similar cases approved last week</span>
                      <span className="text-emerald-450 font-bold">100% Approval Rate</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => handleInlineReject(cardData.id)}
                  disabled={!!processingInlineApprovals[cardData.id]}
                  className="py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-[10px] font-bold text-zinc-400 hover:text-zinc-200 transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                >
                  {processingInlineApprovals[cardData.id] === 'REJECTING' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin animate-infinite duration-1000" />
                      <span>Rejecting...</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleInlineApprove(cardData.id, cardData.type)}
                  disabled={!!processingInlineApprovals[cardData.id]}
                  className="py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-[10px] font-bold text-white transition-all flex items-center justify-center gap-1 shadow-md shadow-purple-650/10 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                >
                  {processingInlineApprovals[cardData.id] === 'APPROVING' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin animate-infinite duration-1000" />
                      <span>Executing...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve & Execute</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        }
      } catch (err) {
        cards.push(<p key={`approval-err-${match.index}`} className="text-[10px] text-rose-500 mt-2">Failed to render Approval card.</p>);
      }
    }

    // 3. Check for Switch to Agent Mode Cards
    const switchRegex = /\[SWITCH_TO_AGENT_CARD:\s*(\{.*?\})\s*\]/g;
    while ((match = switchRegex.exec(messageContent)) !== null) {
      try {
        const cardData = JSON.parse(match[1]);
        cards.push(
          <div key={`switch-${match.index}`} className="mt-4 p-4 rounded-xl border border-sky-500/20 bg-sky-950/10 space-y-3 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-sky-500/10 border border-sky-500/20">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
              </div>
              <span className="text-[11px] text-sky-300 font-semibold tracking-wider uppercase">Governance Safeguard</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              This request involves store modifications (writes, refunds, or updates). To proceed, we must activate Agent Mode to run the policy checks and trigger the approval gateways.
            </p>
            <button
              onClick={() => {
                setMode('agent');
                handleSend(cardData.originalRequest, 'agent');
              }}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-[10px] font-bold text-white transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-sky-500/15 hover:shadow-sky-500/25 active:scale-[0.98] cursor-pointer"
            >
              <span>Switch to Agent Mode & Proceed</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      } catch (err) {
        cards.push(<p key={`switch-err-${match.index}`} className="text-[10px] text-rose-500 mt-2">Failed to render switch to agent card.</p>);
      }
    }

    if (cards.length === 0) return null;
    return <div className="space-y-4">{cards}</div>;
  };

  const formatContent = (content: string, messageIdx: number) => {
    let textOnly = content;
    if (textOnly.includes('[CSV_MAPPING_CARD:')) {
      textOnly = textOnly.substring(0, textOnly.indexOf('[CSV_MAPPING_CARD:'));
    }
    if (textOnly.includes('[APPROVAL_CARD:')) {
      textOnly = textOnly.substring(0, textOnly.indexOf('[APPROVAL_CARD:'));
    }
    if (textOnly.includes('[SWITCH_TO_AGENT_CARD:')) {
      textOnly = textOnly.substring(0, textOnly.indexOf('[SWITCH_TO_AGENT_CARD:'));
    }

    // Parse out dynamic Suggested Actions
    const actionRegex = /\[([^\]]+)\]/g;
    let dynamicActions: string[] = [];
    
    const suggestedActionsIndex = textOnly.toLowerCase().indexOf('suggested actions:');
    const suggestionsIndex = suggestedActionsIndex;
    
    if (suggestionsIndex !== -1) {
      const suggestionsText = textOnly.substring(suggestionsIndex);
      let match;
      while ((match = actionRegex.exec(suggestionsText)) !== null) {
        const actionLabel = match[1].trim();
        // Skip internal metadata cards
        if (actionLabel && !actionLabel.includes('_CARD') && !actionLabel.startsWith('http') && actionLabel.length < 35) {
          dynamicActions.push(actionLabel);
        }
      }
      // Remove suggestions block from visible text since we render them as custom buttons
      textOnly = textOnly.substring(0, suggestionsIndex).trim();
    }

    const lines = textOnly.split('\n');
    return (
      <div className="space-y-1 text-zinc-200 leading-relaxed">
        {lines.map((line, idx) => {
          let formatted = line;
          if (formatted.startsWith('### ')) {
            return (
              <h4 key={idx} className="text-xs font-semibold text-sky-400 mt-3 mb-1 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {formatted.substring(4)}
              </h4>
            );
          }
          if (formatted.startsWith('* ') || formatted.startsWith('- ')) {
            return (
              <div key={idx} className="flex items-start gap-1.5 pl-2 my-0.5 text-zinc-300">
                <span className="text-purple-400 mt-1.5 h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                <span>{parseInlineMarkdown(formatted.substring(2))}</span>
              </div>
            );
          }
          if (formatted.trim() === '') {
            return <div key={idx} className="h-1.5" />;
          }
          return <p key={idx}>{parseInlineMarkdown(formatted)}</p>;
        })}

        {dynamicActions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-zinc-800/40 space-y-2">
            <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-550 block">
              Suggested Operational Actions
            </span>
            <div className="flex flex-wrap gap-1.5">
              {dynamicActions.map((action) => (
                <button
                  key={action}
                  onClick={() => handleNextActionClick(action)}
                  className="px-2.5 py-1 rounded bg-purple-950/20 hover:bg-purple-900/30 border border-purple-500/20 hover:border-purple-500/50 text-purple-300 hover:text-white text-[9px] transition-all cursor-pointer font-medium active:scale-[0.97]"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        {renderInlineCard(content, messageIdx)}
      </div>
    );
  };

  const parseInlineMarkdown = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-bold text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={index} className="px-1 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-purple-300 text-[10px] font-mono">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const currentSuggestions = {
    'refund-flow': ['Refund Order #ORD-1024', 'Create discount code SORRY25', 'Which products are causing most refunds?'],
    'inventory-flow': ['List database products', 'Show supplier mappings'],
    'support-flow': ['Which shipments are delayed?', 'Show Sarah\'s support tickets']
  }[activeChatId] || [];

  // Collapsed State Check
  if (!isChatOpen) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      style={{ width: `${width}px` }}
      className="h-full border-r border-zinc-800 bg-[#090d16] flex flex-col shrink-0 relative"
    >
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/20 h-16 shrink-0">
        <div className="flex items-center p-0.5 rounded-lg bg-zinc-900/80 border border-zinc-800/50">
          <button
            onClick={() => setMode('ask')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
              mode === 'ask'
                ? 'bg-sky-500/10 border border-sky-500/20 text-sky-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Ask Mode
          </button>
          <button
            onClick={() => setMode('agent')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
              mode === 'agent'
                ? 'bg-purple-600/10 border border-purple-500/20 text-purple-300 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Agent Mode
          </button>
        </div>
        
        <button
          onClick={() => setIsChatOpen(false)}
          className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Close Assistant Pane"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Business Context Panel */}
      {!chatMutation.isPending && (
        <div className="px-4 py-2 border-b border-zinc-800/50 bg-[#0c1220]/45 flex items-center justify-between text-[10px] shrink-0 animate-in slide-in-from-top-1">
          {activeChatId === 'refund-flow' && (
            <>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-zinc-400">Context: <strong>Alice Smith</strong></span>
                <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold uppercase text-[8px]">VIP Tier</span>
              </div>
              <div className="flex items-center gap-3 text-zinc-500">
                <span>Orders: <strong>12</strong></span>
                <span>•</span>
                <span>Refunds: <strong>3</strong></span>
                <span>•</span>
                <span>Tickets: <strong>1</strong></span>
              </div>
            </>
          )}
          {activeChatId === 'inventory-flow' && (
            <>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-zinc-400">Sync Agent: <strong>Supplier Feeds</strong></span>
                <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold uppercase text-[8px]">Active</span>
              </div>
              <div className="flex items-center gap-3 text-zinc-500">
                <span>SKUs: <strong>18</strong></span>
                <span>•</span>
                <span>Integrations: <strong>Shopify</strong></span>
                <span>•</span>
                <span>Format: <strong>CSV</strong></span>
              </div>
            </>
          )}
          {activeChatId === 'support-flow' && (
            <>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-zinc-400">Context: <strong>Sarah Connor</strong></span>
                <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold uppercase text-[8px]">VIP Tier</span>
              </div>
              <div className="flex items-center gap-3 text-zinc-500">
                <span>Orders: <strong>5</strong></span>
                <span>•</span>
                <span>Delayed: <strong>1</strong></span>
                <span>•</span>
                <span>Tickets: <strong>1</strong></span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, i) => (
          <div
            key={i}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[90%] rounded-xl p-3 text-xs border ${
                message.role === 'user'
                  ? 'bg-purple-600/10 border-purple-500/20 text-zinc-100'
                  : 'bg-zinc-900/60 border-zinc-850/80 text-zinc-300'
              }`}
            >
              {formatContent(message.content, i)}
            </div>
          </div>
        ))}
        
        {chatMutation.isPending && (
          <SwarmLoader />
        )}
        
        {fileUploadMutation.isPending && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-xl p-3 text-xs bg-zinc-900/60 border border-zinc-850/80 text-zinc-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
              <span className="text-[10px]">Analyzing CSV schema mapping recommendations...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      {currentSuggestions.length > 0 && !chatMutation.isPending && (
        <div className="px-4 py-2 flex flex-col gap-1.5 bg-zinc-950/10 border-t border-zinc-900 shrink-0">
          <span className="text-[8px] text-zinc-500 font-semibold uppercase tracking-wider">Suggested Queries</span>
          <div className="flex flex-wrap gap-1.5">
            {currentSuggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSend(s)}
                className="px-2 py-1 rounded-md bg-zinc-900 hover:bg-zinc-850 text-[10px] text-purple-300 border border-zinc-850 hover:border-purple-500/20 text-left transition-all duration-200"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Panel */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/20 flex gap-2 shrink-0">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 transition-colors flex items-center justify-center shrink-0"
          title="Attach supplier CSV file"
        >
          <Upload className="w-4 h-4" />
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="flex-1 relative flex items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={chatMutation.isPending || fileUploadMutation.isPending}
            placeholder={mode === 'ask' ? "Query data... (Ask Mode)" : "Request actions... (Agent Mode)"}
            className="w-full pl-3 pr-10 py-2.5 bg-zinc-900 border border-zinc-800/80 focus:border-purple-500/40 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || chatMutation.isPending || fileUploadMutation.isPending}
            className="absolute right-1.5 p-1.5 rounded-md bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-850 text-white disabled:text-zinc-600 transition-all duration-200"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Resizing divider bar */}
      <div
        onMouseDown={startResize}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-purple-500/20 active:bg-purple-500/40 transition-colors z-30"
      />
    </div>
  );
}
