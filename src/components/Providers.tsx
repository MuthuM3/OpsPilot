'use client';

import React, { useState, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Sparkles, AlertTriangle, XCircle, Info, X } from 'lucide-react';

interface WorkspaceContextProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeChatId: string;
  setActiveChatId: (id: string) => void;
  chatMode: 'ask' | 'agent';
  setChatMode: (mode: 'ask' | 'agent') => void;
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
  showToast: (message: string, type?: 'success' | 'warning' | 'error' | 'info', title?: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextProps | undefined>(undefined);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 5000,
      },
    },
  }));

  const [activeTab, setActiveTabState] = useState('dashboard');
  const [activeChatId, setActiveChatId] = useState('refund-flow');
  const [chatMode, setChatMode] = useState<'ask' | 'agent'>('agent');
  const [isChatOpen, setIsChatOpen] = useState(true);
  
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'warning' | 'error' | 'info';
    title?: string;
  }>({
    show: false,
    message: '',
    type: 'success',
  });

  const router = useRouter();

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    router.push(`/${tab}`);
  };

  const showToast = (message: string, type: 'success' | 'warning' | 'error' | 'info' = 'success', title?: string) => {
    setToast({
      show: true,
      message,
      type,
      title: title || (type === 'success' ? 'SUCCESS' : type === 'warning' ? 'WARNING' : type === 'error' ? 'ERROR' : 'INFO')
    });

    // Auto dismiss after 5 seconds
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 5000);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceContext.Provider value={{
        activeTab,
        setActiveTab,
        activeChatId,
        setActiveChatId,
        chatMode,
        setChatMode,
        isChatOpen,
        setIsChatOpen,
        showToast
      }}>
        {children}

        {/* Custom Premium Toast Overlay */}
        {toast.show && (
          <div className="fixed top-5 right-5 z-[9999] max-w-sm w-full bg-zinc-950/85 backdrop-blur-xl border rounded-2xl p-4 shadow-2xl animate-in slide-in-from-top-4 duration-300 flex items-start gap-3"
               style={{
                 borderColor: 
                   toast.type === 'success' ? 'rgba(16, 185, 129, 0.3)' :
                   toast.type === 'warning' ? 'rgba(245, 158, 11, 0.3)' :
                   toast.type === 'error' ? 'rgba(244, 63, 94, 0.3)' :
                   'rgba(56, 189, 248, 0.3)',
                 boxShadow: 
                   toast.type === 'success' ? '0 10px 30px -10px rgba(16, 185, 129, 0.2)' :
                   toast.type === 'warning' ? '0 10px 30px -10px rgba(245, 158, 11, 0.2)' :
                   toast.type === 'error' ? '0 10px 30px -10px rgba(244, 63, 94, 0.2)' :
                   '0 10px 30px -10px rgba(56, 189, 248, 0.2)'
               }}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <Sparkles className="w-5 h-5 text-emerald-400" />}
              {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
              {toast.type === 'error' && <XCircle className="w-5 h-5 text-rose-400" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-sky-400" />}
            </div>

            <div className="flex-1 space-y-0.5">
              <h5 className={`text-[10px] font-bold uppercase tracking-wider ${
                toast.type === 'success' ? 'text-emerald-400' :
                toast.type === 'warning' ? 'text-amber-400' :
                toast.type === 'error' ? 'text-rose-400' :
                'text-sky-400'
              }`}>
                {toast.title}
              </h5>
              <p className="text-[11px] text-zinc-200 font-medium leading-relaxed">
                {toast.message}
              </p>
            </div>

            <button 
              onClick={() => setToast(prev => ({ ...prev, show: false }))}
              className="p-0.5 rounded hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </WorkspaceContext.Provider>
    </QueryClientProvider>
  );
}
