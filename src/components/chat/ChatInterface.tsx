/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Check, AlertTriangle, ShieldCheck, Upload, ArrowRight, Loader2, MessageSquare, Clock, Copy, RefreshCw, Square, Search, Trash2, Pencil, Plus, Maximize2, Minimize2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/components/Providers';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function WorkflowLoader() {
  const [step, setStep] = useState(0);
  const steps = [
    { activeId: 'coordinator', text: 'Coordinator: Analyzing request intent & context...' },
    { activeId: 'refund', text: 'Policy Gate: Evaluating compliance & policy limits...' },
    { activeId: 'inventory', text: 'Inventory Sync: Checking catalog safety thresholds...' },
    { activeId: 'support', text: 'Notifications: Preparing confirmation templates...' }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => (s + 1) % steps.length);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const current = steps[step];
  
  const agents = [
    { id: 'coordinator', label: 'Coordinator Service' },
    { id: 'refund', label: 'Policy Gate Service' },
    { id: 'inventory', label: 'Inventory Sync Service' },
    { id: 'support', label: 'Notifications Service' }
  ];

  return (
    <div className="flex justify-start w-full animate-in fade-in duration-200">
      <div className="max-w-[95%] w-full rounded-xl p-4 bg-zinc-900 border border-zinc-800 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-200">
              Operations Pipeline Execution
            </span>
          </div>
          <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono px-2 py-0.5 rounded font-bold tracking-wider">
            Pipeline processing
          </span>
        </div>

        {/* Visual Execution Pipeline */}
        <div className="relative pl-6 space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-[1px] before:bg-zinc-800">
          {agents.map((agent) => {
            const isActive = current.activeId === agent.id;
            return (
              <div key={agent.id} className="relative transition-all duration-300">
                {/* Node Dot */}
                <div className={`absolute -left-[20px] top-1 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 z-10 ${
                  isActive 
                    ? 'border-blue-500 bg-blue-950/40' 
                    : 'border-zinc-800 bg-zinc-900'
                }`}>
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                </div>

                {/* Node Box */}
                <div className={`p-2.5 rounded-lg border text-[10px] transition-all duration-300 ${
                  isActive
                    ? 'bg-zinc-950 border-blue-500/30 text-zinc-200 shadow-sm'
                    : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 opacity-60'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className={`font-semibold ${isActive ? 'text-zinc-100' : ''}`}>
                      {agent.label}
                    </span>
                    {isActive && (
                      <span className="text-[8px] font-mono uppercase tracking-wider text-blue-400 font-bold">
                        Processing...
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { 
    activeTab, 
    setActiveTab, 
    activeChatId, 
    setActiveChatId, 
    chatMode: mode, 
    setChatMode: setMode,
    isChatOpen,
    setIsChatOpen,
    showToast,
    chatList,
    createChat,
    deleteChat,
    renameChat,
    chatInputPreset,
    setChatInputPreset,
    activeWorkflow,
    setActiveWorkflow,
    role,
    setRole
  } = useWorkspace();
  
  const [width, setWidth] = useState(440);
  const [height, setHeight] = useState(660);
  const [isMaximized, setIsMaximized] = useState(false);
  const resizeState = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    mode: 'both' | 'width' | 'height';
  } | null>(null);
  
  const [input, setInput] = useState('');
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatTitle, setEditingChatTitle] = useState('');

  const commitChatRename = (id: string) => {
    const trimmed = editingChatTitle.trim();
    if (trimmed) renameChat(id, trimmed);
    setEditingChatId(null);
    setEditingChatTitle('');
  };

  const filteredHistory = chatList.filter(c =>
    c.title.toLowerCase().includes(historySearch.trim().toLowerCase())
  );

  const toggleHistory = () => {
    if (!showHistory) {
      if (width < 720 && !isMaximized) {
        setWidth(720);
      }
    }
    setShowHistory(!showHistory);
  };
  
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

  // Streaming / LLM-chat experience states
  const [isStreaming, setIsStreaming] = useState(false);
  const [turnError, setTurnError] = useState<{ chatId: string } | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  
  // Multi-session chat conversations database
  const [chatSessions, setChatSessions] = useState<Record<string, Message[]>>({
    'refund-flow': [
      {
        role: 'assistant',
        content: `Welcome to OpsPilot 🚀

OpsPilot helps e-commerce teams manage operations through conversation.

Try one of these:
📦 **Low Stock Management**
🔍 **Shipment Investigation**
💸 **High-Risk Refund**
🏷 **Discount Governance**
📁 **CSV Inventory Cleanup**`
      }
    ],
    'inventory-flow': [
      {
        role: 'assistant',
        content: `Welcome to OpsPilot 🚀

OpsPilot helps e-commerce teams manage operations through conversation.

Try one of these:
📦 **Low Stock Management**
🔍 **Shipment Investigation**
💸 **High-Risk Refund**
🏷 **Discount Governance**
📁 **CSV Inventory Cleanup**`
      }
    ],
    'discount-flow': [
      {
        role: 'assistant',
        content: `Welcome to OpsPilot 🚀

OpsPilot helps e-commerce teams manage operations through conversation.

Try one of these:
📦 **Low Stock Management**
🔍 **Shipment Investigation**
💸 **High-Risk Refund**
🏷 **Discount Governance**
📁 **CSV Inventory Cleanup**`
      }
    ],
    'support-flow': [
      {
        role: 'assistant',
        content: `Welcome to OpsPilot 🚀

OpsPilot helps e-commerce teams manage operations through conversation.

Try one of these:
📦 **Low Stock Management**
🔍 **Shipment Investigation**
💸 **High-Risk Refund**
🏷 **Discount Governance**
📁 **CSV Inventory Cleanup**`
      }
    ]
  });

  // Automatically load presets from scenario play clicks
  useEffect(() => {
    if (chatInputPreset) {
      setInput(chatInputPreset);
      setChatInputPreset('');
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
        }
      }, 50);
    }
  }, [chatInputPreset, setChatInputPreset]);

  const messages = chatSessions[activeChatId] || [];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isChatOpen]);

  // Handle floating popup resizing (drag top-left corner or edges)
  const startResize = (e: React.MouseEvent, mode: 'both' | 'width' | 'height' = 'both') => {
    e.preventDefault();
    e.stopPropagation();
    setIsMaximized(false);
    resizeState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: width,
      startH: height,
      mode
    };
    document.addEventListener('mousemove', onMouseMoveResize);
    document.addEventListener('mouseup', onMouseUpResize);
    document.body.style.userSelect = 'none';
  };

  const onMouseMoveResize = (e: MouseEvent) => {
    if (!resizeState.current) return;
    const { startX, startY, startW, startH, mode } = resizeState.current;
    
    // Moving left increases width
    const deltaX = startX - e.clientX;
    // Moving up increases height
    const deltaY = startY - e.clientY;

    if (mode === 'both' || mode === 'width') {
      const maxW = Math.max(380, window.innerWidth - 64);
      const newW = Math.min(Math.max(startW + deltaX, 380), maxW);
      setWidth(newW);
    }

    if (mode === 'both' || mode === 'height') {
      const maxH = Math.max(450, window.innerHeight - 130);
      const newH = Math.min(Math.max(startH + deltaY, 450), maxH);
      setHeight(newH);
    }
  };

  const onMouseUpResize = () => {
    resizeState.current = null;
    document.removeEventListener('mousemove', onMouseMoveResize);
    document.removeEventListener('mouseup', onMouseUpResize);
    document.body.style.userSelect = '';
  };

  // ---------------------------------------------------------------
  // Persistence: hydrate conversations from localStorage once, then
  // keep them in sync so a refresh no longer wipes chat history.
  // ---------------------------------------------------------------
  useEffect(() => {
    try {
      const saved = localStorage.getItem('opspilot-chat-sessions');
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, Message[]>;
        // Merge so default welcome messages survive for any missing flow.
        setChatSessions(prev => ({ ...prev, ...parsed }));
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem('opspilot-chat-sessions', JSON.stringify(chatSessions));
    } catch {
      /* storage full / unavailable */
    }
  }, [chatSessions, hydrated]);

  // Seed a proactive, outcome-based welcome screen the first time a (new) conversation
  // is opened.
  useEffect(() => {
    if (!hydrated || !activeChatId) return;
    if (chatSessions[activeChatId]) return;

    const genericWelcome = `Welcome to OpsPilot 🚀

OpsPilot helps e-commerce teams manage operations through conversation.

Try one of these:
📦 **Low Stock Management**
🔍 **Shipment Investigation**
💸 **High-Risk Refund**
🏷 **Discount Governance**
📁 **CSV Inventory Cleanup**`;

    setChatSessions(prev => (prev[activeChatId] ? prev : { ...prev, [activeChatId]: [{ role: 'assistant', content: genericWelcome }] }));
  }, [activeChatId, hydrated]);

  // Drop message stores for conversations that have been deleted.
  useEffect(() => {
    if (!hydrated) return;
    const ids = new Set(chatList.map(c => c.id));
    setChatSessions(prev => {
      const orphaned = Object.keys(prev).filter(k => !ids.has(k));
      if (orphaned.length === 0) return prev;
      const next = { ...prev };
      orphaned.forEach(k => delete next[k]);
      return next;
    });
  }, [chatList, hydrated]);

  // Load conversation workflow state from DB on session load or on new message response
  useEffect(() => {
    if (!hydrated || !activeChatId) return;

    let isSubscribed = true;

    const syncState = async () => {
      try {
        const res = await fetch(`/api/chat/state?chatId=${activeChatId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (isSubscribed) {
          setActiveWorkflow({
            activeObjectType: data.activeObjectType || null,
            activeObjectId: data.activeObjectId || null,
            activeWorkflow: data.activeWorkflow || null,
            workflowState: data.workflowState || null,
            metadata: data.metadata || {}
          });
        }
      } catch (err) {
        console.error('Failed to sync active workflow state:', err);
      }
    };

    syncState();

    return () => {
      isSubscribed = false;
    };
  }, [activeChatId, chatSessions, hydrated, setActiveWorkflow]);

  // ---------------------------------------------------------------
  // Streaming send: reads the response body token-by-token and
  // progressively updates the trailing assistant message.
  // ---------------------------------------------------------------
  const streamAssistant = async (history: Message[], currentMode: 'ask' | 'agent', chatId: string) => {
    setTurnError(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Append an empty assistant placeholder we will fill as chunks arrive.
    setChatSessions(prev => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), { role: 'assistant', content: '' }],
    }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, mode: currentMode, chatId, role }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to send message');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      let switchedTab = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });

        setChatSessions(prev => {
          const arr = [...(prev[chatId] || [])];
          arr[arr.length - 1] = { role: 'assistant', content: acc };
          return { ...prev, [chatId]: arr };
        });

        // WORKSPACE ACTION SWITCH: jump to Approvals as soon as a card streams in.
        if (!switchedTab && acc.includes('[APPROVAL_CARD:')) {
          switchedTab = true;
          setActiveTab('approvals');
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // User stopped generation — keep whatever streamed so far.
      } else {
        // Drop the empty placeholder and surface a retry affordance.
        setChatSessions(prev => {
          const arr = [...(prev[chatId] || [])];
          if (arr.length && arr[arr.length - 1].role === 'assistant' && arr[arr.length - 1].content === '') {
            arr.pop();
          }
          return { ...prev, [chatId]: arr };
        });
        setTurnError({ chatId });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      // A chat turn may have mutated data (approve, add/restock product, refund,
      // cancel order, resolve ticket...). Refresh every workspace view so the
      // change reflects immediately without navigating away and back.
      ['dashboard', 'products', 'orders', 'approvals', 'timeline', 'refunds', 'customers', 'tickets']
        .forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleRegenerate = () => {
    if (isStreaming) return;
    const arr = chatSessions[activeChatId] || [];
    let end = arr.length;
    if (arr[end - 1]?.role === 'assistant') end -= 1;
    const upto = arr.slice(0, end);
    if (!upto.length || upto[upto.length - 1].role !== 'user') return;
    setChatSessions(prev => ({ ...prev, [activeChatId]: upto }));
    streamAssistant(upto, mode, activeChatId);
  };

  const handleRetry = () => {
    if (isStreaming) return;
    const arr = chatSessions[activeChatId] || [];
    if (arr[arr.length - 1]?.role !== 'user') return;
    setTurnError(null);
    streamAssistant(arr, mode, activeChatId);
  };

  const stripMarkers = (content: string) => {
    let text = content;
    ['[CSV_MAPPING_CARD:', '[APPROVAL_CARD:', '[SWITCH_TO_AGENT_CARD:', '[WORKFLOW_CARD:'].forEach(marker => {
      const idx = text.indexOf(marker);
      if (idx !== -1) text = text.substring(0, idx);
    });
    return text.trim();
  };

  const handleCopy = async (content: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(stripMarkers(content));
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  };

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
      const filename = data.filename || '';
      const isDemoFile = filename.toLowerCase().includes('supplier_inventory') || filename.toLowerCase().includes('supplier');
      const contentText = isDemoFile
        ? `Mapped supplier file to catalog schema.

35 products recognized.

4 SKU mismatches found.

Suggested corrections:
• ABC123 ➔ SKU-ABC123
• XYZ777 ➔ SKU-XYZ777`
        : `I have analyzed the CSV file and generated column mapping recommendations.`;

      setChatSessions(prev => ({
        ...prev,
        [activeChatId]: [
          ...(prev[activeChatId] || []),
          { role: 'assistant', content: `${contentText}\n\n${formattedPreview}` }
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
    if (!text.trim() || isStreaming) return;

    const chatId = activeChatId;
    const newMessages: Message[] = [...(chatSessions[chatId] || []), { role: 'user', content: text }];

    // Auto-title a fresh conversation from its first user message (ChatGPT-style).
    const hadUserMessage = (chatSessions[chatId] || []).some(m => m.role === 'user');
    if (!hadUserMessage) {
      const trimmed = text.trim().replace(/\s+/g, ' ');
      renameChat(chatId, trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed);
    }

    // Update local state first
    setChatSessions(prev => ({
      ...prev,
      [chatId]: newMessages
    }));

    setInput('');

    // WORKSPACE ACTION SWITCH:
    // If user checks delayed shipments, automatically switch main workspace to Dashboard/Timeline
    if (text.toLowerCase().includes('delay') || text.toLowerCase().includes('shipment')) {
      setActiveTab('dashboard');
    }
    if (text.toLowerCase().includes('inventory') || text.toLowerCase().includes('product')) {
      setActiveTab('inventory');
    }

    streamAssistant(newMessages, modeOverride || mode, chatId);
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
  const handleInlineApprove = async (approvalId: string, type: string, isCsv?: boolean) => {
    if (role !== 'manager') {
      showToast('Only a Manager can approve governed actions. Switch the role toggle in the sidebar to Manager.', 'warning', 'APPROVAL BLOCKED');
      return;
    }
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
        ? (isCsv
          ? [
              'Import CSV File',
              'Validate Schema & Mappings',
              'Approval Granted',
              'Correct SKU Mismatches',
              'Execute Database Import',
              'Log Sync Transaction'
            ]
          : [
              'Draft inventory update created',
              'Check Policy Gate',
              'Approval Granted',
              'Execute Update',
              'Sync Shopify',
              'Log Audit Transaction'
            ])
        : type === 'DISCOUNT_CREATION'
        ? [
            'Validate Discount Rules',
            'Margin Risk Check',
            'Approval Granted',
            'Published to Shopify',
            'Sync with Stripe Checkout',
            'Audit Recorded'
          ]
        : [
            'Validate Order Details',
            'Check Eligibility & History',
            'Approval Granted',
            'Refund Processed',
            'Ticket Updated',
            'Audit Logged'
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
    if (role !== 'manager') {
      showToast('Only a Manager can reject governed actions. Switch the role toggle in the sidebar to Manager.', 'warning', 'ACTION BLOCKED');
      return;
    }
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

    // Switching to Manager role is a UI state change, not a chat message.
    if (/switch.*manager|manager\s*role|become\s*manager/i.test(cleanAction)) {
      setRole('manager');
      showToast('You are now acting as Manager — you can approve and reject requests.', 'success', 'ROLE: MANAGER');
      return;
    }

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
    const csvRegex = /\[CSV_MAPPING_CARD:\s*(\{[\s\S]*?\})\s*\](?!\s*[,\]\}])/g;
    let match;
    while ((match = csvRegex.exec(messageContent)) !== null) {
      try {
        const cardData = JSON.parse(match[1]);
        const isWhyCsvOpen = showCsvWhy === messageIdx;
        cards.push(
          <div key={`csv-${match.index}`} className="mt-4 p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div>
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">CSV Mapping Recommendations</span>
              </div>
              <div className="flex gap-1.5 items-center">
                <button
                  onClick={() => setShowCsvWhy(isWhyCsvOpen ? null : messageIdx)}
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-[8.5px] transition-all flex items-center gap-1 cursor-pointer border border-zinc-700"
                >
                  Why mapped this way?
                </button>
                <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-semibold">AI suggestion</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              {Object.entries(cardData.mapping).slice(0, 4).map(([header, target], idx) => {
                return (
                  <div key={header} className="p-2 rounded bg-zinc-900 border border-zinc-800 flex justify-between">
                    <span className="text-zinc-400 truncate max-w-[80px]">{header}</span>
                    <span className="text-blue-400 font-semibold">
                      → {(target as string) || 'ignore'}
                    </span>
                  </div>
                );
              })}
            </div>

            {isWhyCsvOpen && (
              <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 space-y-1 text-[9.5px] text-zinc-400 animate-in fade-in slide-in-from-top-1 duration-200">
                <span className="font-bold text-zinc-200 block mb-0.5">Mapping Rules:</span>
                <p>• <strong>SKU ➔ Product Code</strong>: matched based on field names.</p>
                <p>• <strong>Stock ➔ Available Qty</strong>: matched via value distribution.</p>
                <p>• <strong>Price ➔ Cost</strong>: matched via semantic synonym mapping.</p>
              </div>
            )}

            <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900 text-[10px]">
              <table className="w-full text-left">
                <thead className="bg-zinc-950 text-zinc-400 uppercase tracking-wider text-[8px] font-bold border-b border-zinc-800">
                  <tr>
                    <th className="p-2">SKU</th>
                    <th className="p-2">Name</th>
                    <th className="p-2 text-right">Price</th>
                    <th className="p-2 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                  {cardData.preview.slice(0, 3).map((p: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2 font-mono text-[9px] text-blue-400">{p.sku}</td>
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
              className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-semibold text-white transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer"
            >
              <span>Approve Import</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      } catch (err) {
        cards.push(<p key={`csv-err-${match.index}`} className="text-[10px] text-rose-500 mt-2">Failed to render CSV preview card.</p>);
      }
    }

    // 2. Check for Approval Cards
    const approvalRegex = /\[APPROVAL_CARD:\s*(\{[\s\S]*?\})\s*\](?!\s*[,\]\}])/g;
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
            <div key={`approval-state-${cardData.id}`} className="mt-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4 animate-in fade-in duration-200 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Inline Execution Pipeline</span>
                  <span className="text-[8px] text-blue-400 font-mono">Intent: {cardData.type === 'REFUND_REQUEST' ? 'Refund Order' : cardData.type === 'DISCOUNT_CREATION' ? 'Create Promo' : 'Sync Inventory'}</span>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                  approvalState.status === 'REJECTED'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    : approvalState.status === 'FAILED'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    : isSuccess
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                }`}>
                  {approvalState.status === 'REJECTED' ? 'REJECTED' : approvalState.status === 'FAILED' ? 'FAILED' : isSuccess ? 'SUCCESS' : 'EXECUTING'}
                </span>
              </div>

              <div className="space-y-0 pl-1">
                {approvalState.steps.map((step, idx) => {
                  const isPending = idx > approvalState.currentStepIndex;
                  const isRunning = idx === approvalState.currentStepIndex && approvalState.status === 'APPROVED';
                  const isFailed = idx === approvalState.currentStepIndex && approvalState.status === 'FAILED';
                  const isCompleted = idx < approvalState.currentStepIndex || (idx === approvalState.currentStepIndex && approvalState.status === 'APPROVED' && isSuccess);
                  const isRejected = approvalState.status === 'REJECTED';

                  return (
                    <div key={idx} className="flex gap-3 text-[10px] relative">
                      {/* Left Timeline Indicator */}
                      <div className="flex flex-col items-center shrink-0">
                        {isCompleted ? (
                          <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                          </div>
                        ) : isRunning ? (
                          <div className="w-4 h-4 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400" />
                          </div>
                        ) : isFailed ? (
                          <div className="w-4 h-4 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                            <X className="w-2.5 h-2.5 text-rose-400" />
                          </div>
                        ) : isRejected && idx === approvalState.currentStepIndex ? (
                          <div className="w-4 h-4 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                            <X className="w-2.5 h-2.5 text-rose-400" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full border border-zinc-700 bg-zinc-950" />
                          </div>
                        )}
                        
                        {idx < approvalState.steps.length - 1 && (
                          <div className={`w-[1px] h-3 my-0.5 ${isCompleted ? 'bg-emerald-500/20' : 'bg-zinc-800'}`} />
                        )}
                      </div>
                      
                      {/* Right Text Content & Timestamp */}
                      <div className="pt-0.5 pb-2.5 flex-1 min-w-0 flex justify-between items-start gap-2">
                        <span className={`leading-snug break-words ${
                          isPending 
                            ? 'text-zinc-500 opacity-50' 
                            : isRunning 
                            ? 'text-blue-400 font-medium' 
                            : isFailed 
                            ? 'text-rose-400 font-bold' 
                            : 'text-zinc-300 font-medium'
                        }`}>
                          {step}
                        </span>
                        {!isPending && !isRunning && !isFailed && (
                          <span className="text-zinc-400 font-mono text-[8px] bg-zinc-950 px-1 py-0.5 rounded border border-zinc-800 shrink-0 mt-0.5">
                            {timestamps[idx] || '10:01'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {isSuccess && (
                <div className="pt-3 border-t border-zinc-800 space-y-3">
                  <div className="space-y-1.5">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-400 block px-1">
                      Recommended Actions
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {nextActions.map((action) => (
                        <button
                          key={action}
                          onClick={() => handleNextActionClick(action)}
                          className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-[9px] transition-all cursor-pointer font-medium"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => handleReplayPipeline(cardData.id, approvalState.steps)}
                    className="w-full py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-[9px] font-medium text-zinc-300 hover:text-white transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Replay Execution Sequence</span>
                  </button>
                </div>
              )}

              {approvalState.status === 'FAILED' && (
                <div className="pt-3 border-t border-zinc-800 space-y-3">
                  <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-[10px] text-zinc-300">
                    <span className="font-bold text-rose-400 block mb-0.5">Execution Error:</span>
                    <p className="italic text-zinc-400">"{approvalState.error}"</p>
                  </div>
                  <button
                    onClick={() => handleInlineApprove(cardData.id, cardData.type, !!cardData.uploadId)}
                    className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-semibold text-white transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer"
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
            ? (cardData.uploadId
              ? ['Import CSV File', 'Validate Schema & Mappings', 'Waiting Approval', 'Correct SKU Mismatches', 'Execute Database Import', 'Log Sync Transaction']
              : ['Draft inventory update created', 'Check Policy Gate', 'Waiting Approval', 'Execute Update', 'Sync Shopify', 'Log Audit Transaction'])
            : cardData.type === 'DISCOUNT_CREATION'
            ? ['Validate Discount Rules', 'Margin Risk Check', 'Waiting Approval', 'Publish to Shopify', 'Sync with Stripe Checkout', 'Log Audit Transaction']
            : ['Validate Order Details', 'Check Eligibility & History', 'Waiting Approval', 'Process Payout via Stripe', 'Update Support Ticket', 'Log Audit Transaction'];

          cards.push(
            <div key={`approval-${cardData.id}`} className="mt-4 p-4 rounded-xl border border-zinc-800 border-l-4 border-l-amber-500 bg-zinc-900 space-y-4 shadow-sm">
              <div className="pb-3 border-b border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Governance Check Required</span>
                  </span>
                  <button
                    onClick={() => setShowApprovalWhy(prev => ({ ...prev, [cardData.id]: !prev[cardData.id] }))}
                    className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-[8.5px] transition-all flex items-center gap-1 cursor-pointer border border-zinc-700 active:scale-[0.95]"
                  >
                    Why?
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {cardData.riskScore !== undefined && (
                    <span className="text-[8.5px] bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded font-bold border border-rose-500/20">
                      Risk Score: {cardData.riskScore}/100
                    </span>
                  )}
                </div>
              </div>

              <div className="text-[11px] space-y-3">
                <div className="grid grid-cols-2 gap-2.5 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider block">Operation Type</span>
                    <span className="text-[11.5px] font-semibold text-zinc-200 block leading-tight">
                      {cardData.type === 'INVENTORY_UPDATE' ? 'Sync Inventory' : cardData.type === 'DISCOUNT_CREATION' ? 'Create Coupon' : 'Order Refund'}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider block">Details</span>
                    <span className="text-[11.5px] font-semibold text-zinc-200 block leading-tight break-words">
                      {cardData.type === 'INVENTORY_UPDATE'
                        ? `${cardData.productCount} SKU updates mapped`
                        : cardData.type === 'DISCOUNT_CREATION'
                        ? `Coupon ${cardData.code} (${cardData.amount}% Off)`
                        : `₹${cardData.amount?.toLocaleString('en-IN')} Payout`}
                    </span>
                  </div>
                </div>

                {isWhyOpen && cardData.explanation && (
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-[10px] italic text-zinc-400 animate-in fade-in slide-in-from-top-1 duration-200 leading-normal">
                    "{cardData.explanation}"
                  </div>
                )}

                {/* Blocked Execution Plan */}
                <div className="border-t border-zinc-800 pt-3.5 space-y-3">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 block px-1">
                    Blocked Execution Plan
                  </span>
                  <div className="space-y-0 pl-1">
                    {blockedSteps.map((step, idx) => {
                      const isCompleted = idx < 2;
                      const isRunning = idx === 2;
                      const isPending = idx > 2;

                      return (
                        <div key={idx} className="flex gap-3 text-[10px] relative">
                          {/* Left Timeline Indicator */}
                          <div className="flex flex-col items-center shrink-0">
                            {isCompleted ? (
                              <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                              </div>
                            ) : isRunning ? (
                              <div className="w-4 h-4 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                                <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400" />
                              </div>
                            ) : (
                              <div className="w-4 h-4 flex items-center justify-center">
                                <div className="w-1.5 h-1.5 rounded-full border border-zinc-700 bg-zinc-950" />
                              </div>
                            )}
                            
                            {idx < blockedSteps.length - 1 && (
                              <div className={`w-[1px] h-3 my-0.5 ${isCompleted ? 'bg-emerald-500/20' : 'bg-zinc-800'}`} />
                            )}
                          </div>
                          
                          {/* Right Text Content */}
                          <div className="pt-0.5 pb-2.5 flex-1 min-w-0">
                            <p className={`text-[10px] leading-snug break-words ${
                              isCompleted 
                                ? 'text-emerald-400 font-medium' 
                                : isRunning 
                                ? 'text-blue-400 font-medium' 
                                : 'text-zinc-500 opacity-50'
                            }`}>
                              {step}
                              {isRunning && (
                                <span className="text-[8px] font-normal text-blue-400 ml-1.5 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 inline-block align-middle">
                                  Awaiting Manager Sign-off
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Governance Insight & Memory */}
                {isWhyOpen && (
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 space-y-1.5 text-[10px] animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex justify-between text-zinc-400 items-center">
                      <span className="font-semibold text-zinc-300">Why was this flagged?</span>
                      <span className="text-[9px] bg-rose-500/10 text-rose-400 px-1 py-0.5 rounded font-mono font-bold">Policy Breach</span>
                    </div>
                    <p className="text-zinc-400 leading-relaxed text-[9.5px]">
                      {cardData.type === 'DISCOUNT_CREATION'
                        ? `Coupon discount (${cardData.amount}%) exceeds the 20% safe-limit threshold for store managers.`
                        : `Refund payout (₹${cardData.amount?.toLocaleString('en-IN')}) exceeds the ₹10,000 threshold and triggers return velocity checks.`}
                    </p>
                    <div className="border-t border-zinc-800 pt-2 flex justify-between text-[9px] text-zinc-500 font-medium">
                      <span>Memory: 3 similar cases approved last week</span>
                      <span className="text-emerald-400 font-bold">100% Approval Rate</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => handleInlineReject(cardData.id)}
                  disabled={!!processingInlineApprovals[cardData.id]}
                  className="py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] font-medium text-zinc-300 hover:text-white transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]"
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
                  onClick={() => handleInlineApprove(cardData.id, cardData.type, !!cardData.uploadId)}
                  disabled={!!processingInlineApprovals[cardData.id]}
                  className="py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-semibold text-white transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]"
                >
                  {processingInlineApprovals[cardData.id] === 'APPROVING' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin animate-infinite duration-1000" />
                      <span>{!!cardData.uploadId ? 'Processing CSV...' : 'Executing...'}</span>
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

    // 4. Check for Workflow Status Cards
    const workflowRegex = /\[WORKFLOW_CARD:\s*(\{.*?\})\s*\]/g;
    while ((match = workflowRegex.exec(messageContent)) !== null) {
      try {
        const cardData = JSON.parse(match[1]);
        const type = cardData.activeObjectType;
        const state = cardData.workflowState; // 'draft' | 'review' | 'approval_required' | 'completed'
        const meta = cardData.metadata || {};

        const steps = (type === 'discount' || type === 'product')
          ? [
              { key: 'draft', label: 'Draft' },
              { key: 'review', label: 'Review' },
              { key: 'approval_required', label: 'Approvals' },
              { key: 'completed', label: 'Active' }
            ]
          : [
              { key: 'draft', label: 'Draft' },
              { key: 'review', label: 'Review' },
              { key: 'approval_required', label: 'Approvals' },
              { key: 'completed', label: 'Refunded' }
            ];

        const activeIdx = steps.findIndex(s => s.key === state);

        cards.push(
          <div key={`workflow-${match.index}`} className="mt-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4 shadow-sm">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-[11px] text-zinc-200 font-bold uppercase tracking-wider">
                  {type === 'discount' ? `Discount Campaign: ${meta.code || 'Draft'}` : 
                   type === 'product' ? `Product Creation: ${meta.name || 'Draft'}` :
                   `Refund Campaign: ${meta.orderNumber || 'Draft'}`}
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border ${
                state === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                state === 'approval_required' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                'bg-blue-500/10 text-blue-400 border-blue-500/20'
              }`}>
                {state}
              </span>
            </div>

            {/* Stepper track */}
            <div className="flex items-center justify-between px-2 py-1 bg-zinc-950 rounded-lg border border-zinc-800/60">
              {steps.map((step, idx) => {
                const isPassed = idx < activeIdx;
                const isCurrent = idx === activeIdx;
                return (
                  <React.Fragment key={step.key}>
                    <div className="flex flex-col items-center shrink-0 space-y-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border transition-colors ${
                        isPassed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                        isCurrent ? 'bg-blue-600 border-blue-500 text-white' :
                        'bg-zinc-900 border-zinc-800 text-zinc-500'
                      }`}>
                        {isPassed ? '✓' : idx + 1}
                      </div>
                      <span className={`text-[7.5px] sm:text-[8px] font-semibold whitespace-nowrap leading-none mt-1 ${
                        isCurrent ? 'text-blue-400' : 
                        isPassed ? 'text-emerald-400' : 
                        'text-zinc-500'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className={`flex-1 min-w-[4px] h-[2px] mx-1 sm:mx-2 ${
                        idx < activeIdx ? 'bg-emerald-500/30' : 'bg-zinc-800'
                      }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Parameter checklist */}
            <div className="text-[11px] space-y-2 py-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 block">
                Workflow Verification Checklist
              </span>
              {type === 'discount' ? (
                <div className="space-y-1.5 pl-1">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-zinc-400">Discount Percent: <strong className="text-zinc-200">{meta.discountPercent}%</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    {meta.expiry ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded border border-zinc-700 flex items-center justify-center text-[8px] text-zinc-500 font-bold shrink-0">□</div>
                    )}
                    <span className="text-zinc-400">Expiry Date: {meta.expiry ? <strong className="text-zinc-200">{meta.expiry}</strong> : <span className="text-zinc-500 italic">Not set</span>}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {meta.segment ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded border border-zinc-700 flex items-center justify-center text-[8px] text-zinc-500 font-bold shrink-0">□</div>
                    )}
                    <span className="text-zinc-400">Target Segment: {meta.segment ? <strong className="text-zinc-200">{meta.segment}</strong> : <span className="text-zinc-500 italic">All customers</span>}</span>
                  </div>
                </div>
              ) : type === 'product' ? (
                <div className="space-y-1.5 pl-1">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-zinc-400">Product Name: <strong className="text-zinc-200">{meta.name}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    {meta.price !== null && meta.price !== undefined ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded border border-zinc-700 flex items-center justify-center text-[8px] text-zinc-500 font-bold shrink-0">□</div>
                    )}
                    <span className="text-zinc-400">Price: {meta.price !== null && meta.price !== undefined ? <strong className="text-zinc-200">₹{Number(meta.price).toLocaleString('en-IN')}</strong> : <span className="text-zinc-500 italic">Price required</span>}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {meta.stock !== null && meta.stock !== undefined ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded border border-zinc-700 flex items-center justify-center text-[8px] text-zinc-500 font-bold shrink-0">□</div>
                    )}
                    <span className="text-zinc-400">Initial Stock: {meta.stock !== null && meta.stock !== undefined ? <strong className="text-zinc-200">{meta.stock} units</strong> : <span className="text-zinc-500 italic">Stock count required</span>}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 pl-1">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-zinc-400">Customer Name: <strong className="text-zinc-200">{meta.customerName}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-zinc-400">Total Refund: <strong className="text-zinc-200">₹{meta.amount?.toLocaleString('en-IN')}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    {meta.reason ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded border border-zinc-700 flex items-center justify-center text-[8px] text-zinc-500 font-bold shrink-0">□</div>
                    )}
                    <span className="text-zinc-400">Refund Reason: {meta.reason ? <strong className="text-zinc-200">{meta.reason}</strong> : <span className="text-zinc-500 italic">Reason required</span>}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {meta.actions && meta.actions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
                {meta.actions.includes('Set Expiry') && (
                  <button
                    onClick={() => handleSend('Set expiry next month')}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] text-zinc-200 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>Set Expiry</span>
                  </button>
                )}
                {meta.actions.includes('VIP Only') && (
                  <button
                    onClick={() => handleSend('VIP customers only')}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] text-zinc-200 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>VIP Only</span>
                  </button>
                )}
                {meta.actions.includes('Publish') && (
                  <button
                    onClick={() => handleSend('Publish')}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] text-white font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <span>Publish Campaign</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {meta.actions.includes('Set Price') && (
                  <button
                    onClick={() => handleSend('Set price to ₹1,500')}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] text-zinc-200 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>Set Price: ₹1,500</span>
                  </button>
                )}
                {meta.actions.includes('Set Stock') && (
                  <button
                    onClick={() => handleSend('Set stock to 100')}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] text-zinc-200 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>Set Stock: 100</span>
                  </button>
                )}
                {meta.actions.includes('Publish Product') && (
                  <button
                    onClick={() => handleSend('Publish Product')}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] text-white font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <span>Publish Product</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {meta.actions.includes('Set Reason') && (
                  <button
                    onClick={() => handleSend('Reason: Customer dispute')}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] text-zinc-200 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>Set Reason: Dispute</span>
                  </button>
                )}
                {meta.actions.includes('Submit Refund') && (
                  <button
                    onClick={() => handleSend('Submit Refund')}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] text-white font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <span>Submit Refund</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      } catch (err) {
        cards.push(<p key={`workflow-err-${match.index}`} className="text-[10px] text-rose-500 mt-2">Failed to render Workflow card.</p>);
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
    if (textOnly.includes('[WORKFLOW_CARD:')) {
      textOnly = textOnly.substring(0, textOnly.indexOf('[WORKFLOW_CARD:'));
    }

    // Parse out dynamic Suggested Actions
    const dynamicActions: string[] = [];
    
    const suggestedActionsIndex = textOnly.toLowerCase().indexOf('suggested actions:');
    if (suggestedActionsIndex !== -1) {
      const actionRegex = /\[([^\]]+)\]/g;
      const suggestionsText = textOnly.substring(suggestedActionsIndex);
      let match;
      while ((match = actionRegex.exec(suggestionsText)) !== null) {
        const actionLabel = match[1].trim();
        if (actionLabel && !actionLabel.includes('_CARD') && !actionLabel.startsWith('http') && actionLabel.length < 35) {
          dynamicActions.push(actionLabel);
        }
      }
      textOnly = textOnly.substring(0, suggestedActionsIndex).trim();
    } else {
      // Look for trailing action chips at the end of the text (e.g. [Notify Operations Manager] [Create SLA Report])
      while (textOnly.trim().endsWith(']')) {
        const trimmed = textOnly.trim();
        const lastBracketOpenIdx = trimmed.lastIndexOf('[');
        if (lastBracketOpenIdx !== -1) {
          const possibleLabel = trimmed.substring(lastBracketOpenIdx + 1, trimmed.length - 1).trim();
          if (
            possibleLabel && 
            !possibleLabel.includes('\n') && 
            !possibleLabel.includes('_CARD') && 
            !possibleLabel.startsWith('http') && 
            possibleLabel.length < 40
          ) {
            dynamicActions.unshift(possibleLabel);
            textOnly = trimmed.substring(0, lastBracketOpenIdx).trim();
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }

    const lines = textOnly.split('\n');
    const blocks: React.ReactNode[] = [];
    let codeLines: string[] | null = null;

    lines.forEach((line, idx) => {
      // Multi-line code fence ``` ... ```
      if (line.trim().startsWith('```')) {
        if (codeLines === null) {
          codeLines = [];
        } else {
          blocks.push(
            <pre key={`code-${idx}`} className="my-2 p-3 rounded-lg bg-zinc-950 border border-zinc-800 overflow-x-auto">
              <code className="text-[10px] font-mono text-zinc-300 whitespace-pre">{codeLines.join('\n')}</code>
            </pre>
          );
          codeLines = null;
        }
        return;
      }
      if (codeLines !== null) {
        codeLines.push(line);
        return;
      }

      if (line.startsWith('### ')) {
        blocks.push(
          <h4 key={idx} className="text-xs font-semibold text-blue-400 mt-3 mb-1 uppercase tracking-wider">
            {line.substring(4)}
          </h4>
        );
        return;
      }
      if (line.startsWith('#### ')) {
        blocks.push(
          <h5 key={idx} className="text-[11px] font-bold text-zinc-200 mt-2 mb-0.5">{parseInlineMarkdown(line.substring(5))}</h5>
        );
        return;
      }

      // Blockquote / GitHub-style callout (e.g. > [!IMPORTANT])
      if (line.startsWith('>')) {
        const quote = line.replace(/^>\s?/, '');
        const callout = quote.match(/^\[!(\w+)\]\s*(.*)$/);
        blocks.push(
          <div key={idx} className="border-l-2 border-zinc-700 pl-3 my-1 text-zinc-400 italic">
            {callout ? (
              <span>
                <strong className="text-zinc-200 not-italic uppercase text-[9px] tracking-wider">{callout[1]}</strong>
                {callout[2] ? <> — {parseInlineMarkdown(callout[2])}</> : null}
              </span>
            ) : (
              parseInlineMarkdown(quote)
            )}
          </div>
        );
        return;
      }

      // Ordered list item: "1. ..."
      const ordered = line.match(/^(\d+)\.\s+(.*)$/);
      if (ordered) {
        blocks.push(
          <div key={idx} className="flex items-start gap-2 pl-2 my-0.5 text-zinc-300">
            <span className="text-blue-400 font-mono text-[10px] mt-px shrink-0">{ordered[1]}.</span>
            <span>{parseInlineMarkdown(ordered[2])}</span>
          </div>
        );
        return;
      }

      // Unordered list item
      if (line.startsWith('* ') || line.startsWith('- ')) {
        blocks.push(
          <div key={idx} className="flex items-start gap-1.5 pl-2 my-0.5 text-zinc-300">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-500 shrink-0" />
            <span>{parseInlineMarkdown(line.substring(2))}</span>
          </div>
        );
        return;
      }

      if (line.trim() === '') {
        blocks.push(<div key={idx} className="h-1.5" />);
        return;
      }

      blocks.push(<p key={idx}>{parseInlineMarkdown(line)}</p>);
    });

    // Unterminated fence (still streaming) — render what we have so far.
    if (codeLines !== null) {
      blocks.push(
        <pre key="code-open" className="my-2 p-3 rounded-lg bg-zinc-950 border border-zinc-800 overflow-x-auto">
          <code className="text-[10px] font-mono text-zinc-300 whitespace-pre">{(codeLines as string[]).join('\n')}</code>
        </pre>
      );
    }

    return (
      <div className="space-y-1 text-zinc-200 leading-relaxed">
        {blocks}

        {dynamicActions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                Suggested Operational Actions
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {dynamicActions.map((action) => (
                <button
                  key={action}
                  onClick={() => handleNextActionClick(action)}
                  className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 hover:text-white text-[10px] transition-all cursor-pointer font-medium shadow-sm active:scale-[0.97]"
                >
                  <span>{action}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 group-hover:text-zinc-200 transition-all" />
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
    // Split on bold, inline code, and [label](url) links (links need parens, so
    // they never collide with action chips like [Notify Customer]).
    const parts = text.split(/(\*\*.*?\*\*|`.*?`|\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-bold text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={index} className="px-1 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-blue-400 text-[10px] font-mono">
            {part.slice(1, -1)}
          </code>
        );
      }
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        return (
          <a
            key={index}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
          >
            {link[1]}
          </a>
        );
      }
      return part;
    });
  };

  const currentSuggestions = ['Check Inventory', 'Investigate Delay', 'Refund Order', 'Create Discount', 'Import CSV'];

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
      {/* Floating Chat Popup Window */}
      {isChatOpen && (
        <div
          ref={containerRef}
          style={
            isMaximized
              ? {
                  width: 'calc(100vw - 3rem)',
                  height: 'calc(100vh - 7.5rem)',
                  maxWidth: '1200px'
                }
              : {
                  width: `${width}px`,
                  height: `${height}px`,
                  maxWidth: 'calc(100vw - 3rem)',
                  maxHeight: 'calc(100vh - 7.5rem)'
                }
          }
          className="pointer-events-auto mb-4 rounded-2xl shadow-2xl border border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200 relative select-text"
        >
          {/* Top-Left Corner Resize Handle (Diagonal drag) */}
          <div
            onMouseDown={(e) => startResize(e, 'both')}
            title="Drag to resize width and height"
            className="absolute top-0 left-0 w-6 h-6 cursor-nwse-resize z-50 flex items-center justify-center group/resize hover:bg-blue-500/20 rounded-tl-2xl transition-colors"
          >
            <div className="w-2.5 h-2.5 border-t-2 border-l-2 border-zinc-500 group-hover/resize:border-blue-400 rounded-tl-sm transition-colors" />
          </div>

          {/* Left Edge Resize Handle (Horizontal width drag) */}
          <div
            onMouseDown={(e) => startResize(e, 'width')}
            title="Drag to resize width"
            className="absolute top-6 left-0 w-2.5 bottom-0 cursor-ew-resize z-40 hover:bg-blue-500/30 transition-colors"
          />

          {/* Top Edge Resize Handle (Vertical height drag) */}
          <div
            onMouseDown={(e) => startResize(e, 'height')}
            title="Drag to resize height"
            className="absolute top-0 left-6 right-0 h-2.5 cursor-ns-resize z-40 hover:bg-blue-500/30 transition-colors"
          />

          {/* Header */}
          <div className="px-3.5 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900 shrink-0">
            <div className="flex items-center gap-2 pl-3">
              <button
                type="button"
                onClick={toggleHistory}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  showHistory 
                    ? 'bg-blue-600/10 border-blue-500/30 text-blue-400' 
                    : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
                title={showHistory ? "Hide history sidebar" : "Show history sidebar"}
              >
                <Clock className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <div>
                  <h3 className="font-bold text-xs text-zinc-100 tracking-tight leading-none">OpsPilot</h3>
                  <span className="text-[8.5px] font-mono text-zinc-400 tracking-wider uppercase">
                    MODE: {mode === 'ask' ? 'CONVERSATIONAL' : 'AGENT_EXECUTION'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const newId = createChat();
                  setActiveChatId(newId);
                }}
                className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                title="Start a new chat session"
              >
                <Plus className="w-3 h-3" />
                <span>New</span>
              </button>
              <button
                type="button"
                onClick={() => setIsMaximized(!isMaximized)}
                className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                title={isMaximized ? "Restore size" : "Maximize popup"}
              >
                {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                title="Minimize chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Body: Fixed-Width History Sidebar + Chat Column */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Fixed-Width History Sidebar (260px) */}
            {showHistory && (
              <div className="w-[260px] shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col h-full animate-in slide-in-from-left duration-150">
                <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-blue-400" />
                    History ({chatList.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHistory(false)}
                    className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors cursor-pointer"
                    title="Hide history sidebar"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {/* Search */}
                {chatList.length > 2 && (
                  <div className="p-2 border-b border-zinc-800/60">
                    <div className="relative">
                      <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search conversations..."
                        className="w-full pl-7 pr-2 py-1 bg-zinc-900 border border-zinc-800 focus:border-blue-500/50 rounded-lg text-[10px] text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* Conversations List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {filteredHistory.length === 0 ? (
                    <p className="p-3 text-[10px] text-zinc-500 italic text-center">No matching conversations.</p>
                  ) : (
                    filteredHistory.map((session) => {
                      const isSelected = activeChatId === session.id;
                      const isEditing = editingChatId === session.id;

                      return (
                        <div
                          key={session.id}
                          onClick={() => {
                            if (!isEditing) {
                              setActiveChatId(session.id);
                            }
                          }}
                          className={`group w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-left text-xs transition-all duration-150 cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600/10 border border-blue-500/40 text-blue-300 font-semibold shadow-sm'
                              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
                          }`}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editingChatTitle}
                              onChange={(e) => setEditingChatTitle(e.target.value)}
                              onBlur={() => commitChatRename(session.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitChatRename(session.id);
                                if (e.key === 'Escape') { setEditingChatId(null); setEditingChatTitle(''); }
                              }}
                              className="flex-1 min-w-0 bg-zinc-900 border border-blue-500 rounded px-1.5 py-0.5 text-[10px] text-zinc-100 focus:outline-none"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <MessageSquare className="w-3 h-3 text-zinc-500 shrink-0" />
                              <span className="truncate text-[10.5px]">{session.title}</span>
                            </div>
                          )}

                          {!isEditing && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingChatId(session.id);
                                  setEditingChatTitle(session.title);
                                }}
                                className="p-0.5 rounded text-zinc-400 hover:text-blue-400 hover:bg-zinc-800 transition-colors"
                                title="Rename"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteChat(session.id);
                                }}
                                className="p-0.5 rounded text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Bottom New Chat Trigger */}
                <div className="p-2 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      const newId = createChat();
                      setActiveChatId(newId);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10.5px] font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Chat</span>
                  </button>
                </div>
              </div>
            )}

            {/* Chat Conversation Column */}
            <div className="flex-1 min-w-0 flex flex-col h-full bg-zinc-950 overflow-hidden">

      {/* Active Case Banner (Phase C) */}
      {activeWorkflow && activeWorkflow.activeObjectType && (
        <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900 flex flex-col gap-2 shrink-0 animate-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              ACTIVE CASE
            </span>
            <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
              activeWorkflow.workflowState === 'approval_required' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
              activeWorkflow.workflowState === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              'bg-zinc-800 text-zinc-300 border border-zinc-700'
            }`}>
              {activeWorkflow.workflowState === 'approval_required' ? 'Approval Required' :
               activeWorkflow.workflowState === 'completed' ? 'Completed' :
               activeWorkflow.workflowState === 'review' ? 'Ready to Submit' : 'Drafting'}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10.5px] text-zinc-300">
            {activeWorkflow.activeObjectType === 'refund' && (
              <>
                <div><span className="text-zinc-500">Customer:</span> <strong className="text-zinc-200">{activeWorkflow.metadata?.customerName || 'Alice Smith'}</strong></div>
                <div><span className="text-zinc-500">Ticket:</span> <strong className="text-zinc-200">{activeWorkflow.metadata?.ticketNumber || 'TKT-003'}</strong></div>
                <div><span className="text-zinc-500">Order:</span> <strong className="text-zinc-200">{activeWorkflow.activeObjectId || 'ORD-1024'}</strong></div>
                <div>
                  <span className="text-zinc-500">Risk Score:</span>{' '}
                  <strong className={activeWorkflow.metadata?.riskScore && activeWorkflow.metadata.riskScore >= 70 ? 'text-rose-400' : 'text-zinc-200'}>
                    {activeWorkflow.metadata?.riskScore || 88}/100
                  </strong>
                </div>
              </>
            )}
            
            {activeWorkflow.activeObjectType === 'discount' && (
              <>
                <div><span className="text-zinc-500">Code:</span> <strong className="text-zinc-200">{activeWorkflow.activeObjectId || 'SUMMER25'}</strong></div>
                <div><span className="text-zinc-500">Segment:</span> <strong className="text-zinc-200">{activeWorkflow.metadata?.segment || 'VIP (Pending)'}</strong></div>
                <div><span className="text-zinc-500">Expiry:</span> <strong className="text-zinc-200">{activeWorkflow.metadata?.expiry || 'Not Set'}</strong></div>
                <div>
                  <span className="text-zinc-500">Margin Risk:</span>{' '}
                  <strong className="text-rose-400">
                    {activeWorkflow.metadata?.riskScore || 65}/100
                  </strong>
                </div>
              </>
            )}

            {activeWorkflow.activeObjectType === 'inventory' && (
              <>
                <div><span className="text-zinc-500">Product:</span> <strong className="text-zinc-200">{activeWorkflow.metadata?.name || 'Ergonomic Office Chair'}</strong></div>
                <div><span className="text-zinc-500">SKU:</span> <strong className="text-zinc-200">{activeWorkflow.activeObjectId || 'PROD-003'}</strong></div>
                <div><span className="text-zinc-500">Current Stock:</span> <strong className="text-zinc-200">{activeWorkflow.metadata?.currentInventory || 15}</strong></div>
                <div><span className="text-zinc-500">Restock Target:</span> <strong className="text-emerald-400 font-bold">{activeWorkflow.metadata?.newInventory || 'Pending'}</strong></div>
              </>
            )}

            {activeWorkflow.activeObjectType === 'ticket' && (
              <>
                <div><span className="text-zinc-500">Customer:</span> <strong className="text-zinc-200">{activeWorkflow.metadata?.customerName || 'Sarah Connor'}</strong></div>
                <div><span className="text-zinc-500">Ticket:</span> <strong className="text-zinc-200">{activeWorkflow.activeObjectId || 'TKT-001'}</strong></div>
                <div><span className="text-zinc-500">Order:</span> <strong className="text-zinc-200">{activeWorkflow.metadata?.orderNumber || 'ORD-1022'}</strong></div>
                <div><span className="text-zinc-500">Status:</span> <strong className="text-zinc-200">{activeWorkflow.metadata?.status || 'REVIEWING'}</strong></div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, i) => {
          const isLast = i === messages.length - 1;
          const isAssistant = message.role === 'assistant';
          // Hide the empty assistant placeholder while waiting — the loader covers it.
          if (isAssistant && message.content === '' && isStreaming && isLast) return null;
          const streamingThis = isStreaming && isLast && isAssistant;
          const showActions = isAssistant && message.content !== '' && !streamingThis;

          return (
            <div
              key={i}
              className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-xl p-3 text-xs border ${
                  message.role === 'user'
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-100'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                }`}
              >
                {formatContent(message.content, i)}
                {streamingThis && (
                  <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-blue-400 animate-pulse rounded-sm" />
                )}
              </div>

              {showActions && (
                <div className="flex items-center gap-1 mt-1 px-1">
                  <button
                    onClick={() => handleCopy(message.content, i)}
                    className="flex items-center gap-1 text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Copy message"
                  >
                    {copiedIdx === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedIdx === i ? 'Copied' : 'Copy'}
                  </button>
                  {isLast && !isStreaming && i > 0 && messages[i - 1]?.role === 'user' && (
                    <button
                      onClick={handleRegenerate}
                      className="flex items-center gap-1 text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors ml-1"
                      title="Regenerate response"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Regenerate
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {isStreaming &&
          messages[messages.length - 1]?.role === 'assistant' &&
          messages[messages.length - 1]?.content === '' && <WorkflowLoader />}

        {turnError && turnError.chatId === activeChatId && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-xl p-3 text-xs bg-rose-500/5 border border-rose-500/20 text-zinc-300 space-y-2">
              <div className="flex items-center gap-1.5 text-rose-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="font-semibold text-[11px]">Couldn't generate a response.</span>
              </div>
              <button
                onClick={handleRetry}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[10px] font-medium transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          </div>
        )}

        {fileUploadMutation.isPending && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-xl p-3 text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
              <span className="text-[10px]">Analyzing CSV schema mapping recommendations...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      {currentSuggestions.length > 0 && !isStreaming && messages.length <= 1 && (
        <div className="px-4 py-2 flex flex-col gap-1.5 bg-zinc-950 border-t border-zinc-800/80 shrink-0">
          <span className="text-[8px] text-zinc-500 font-semibold uppercase tracking-wider">Suggested Queries</span>
          <div className="flex flex-wrap gap-1.5">
            {currentSuggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSend(s)}
                className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-[10px] text-zinc-300 border border-zinc-800 hover:border-zinc-700 text-left transition-all duration-200"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Panel */}
      <div className="p-3 border-t border-zinc-800 bg-zinc-950 shrink-0 space-y-2">
        {/* Mode Selector Pill & Online Status */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
            <button
              type="button"
              onClick={() => setMode('ask')}
              className={`px-3 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                mode === 'ask'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Ask
            </button>
            <button
              type="button"
              onClick={() => setMode('agent')}
              className={`px-3 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                mode === 'agent'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Agent
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-400 uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>ONLINE</span>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv"
          className="hidden"
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="flex items-end gap-2 p-2 rounded-xl border border-zinc-800 bg-zinc-900 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all duration-200"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 transition-all duration-150 flex items-center justify-center shrink-0 cursor-pointer mb-0.5 active:scale-95"
            title="Attach supplier CSV file"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            rows={1}
            disabled={fileUploadMutation.isPending}
            placeholder={mode === 'ask' ? "Type your message..." : "Submit discount creation, issue refunds..."}
            className="flex-1 bg-transparent text-xs text-zinc-150 placeholder-zinc-500 focus:outline-none resize-none max-h-24 overflow-y-auto leading-relaxed border-0 focus:ring-0 p-1.5 focus:border-transparent focus:ring-offset-0 focus:ring-transparent py-1"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
            }}
          />

          <div className="flex items-center shrink-0 mb-0.5 gap-1.5">
            {input.trim().length > 0 && (
              <span className="text-[9px] text-zinc-500 font-mono pr-1 hidden sm:inline">{input.length} chars</span>
            )}
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                title="Stop generating"
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-all cursor-pointer active:scale-95 flex items-center justify-center"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || fileUploadMutation.isPending}
                className="p-1.5 rounded-lg disabled:bg-zinc-800 disabled:text-zinc-600 bg-blue-600 hover:bg-blue-500 text-white transition-all cursor-pointer shadow-sm active:scale-95 flex items-center justify-center border border-blue-500/20"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
  )}

  {/* Floating Action Button (FAB) launcher */}
  <button
    type="button"
    onClick={() => setIsChatOpen(!isChatOpen)}
    data-testid="chat-widget-toggle"
    className="pointer-events-auto w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer border border-blue-400/30"
    title={isChatOpen ? "Close OpsPilot Chat" : "Open OpsPilot Chat"}
  >
    {isChatOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
  </button>
</div>
  );
}
