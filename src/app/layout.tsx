import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Sidebar from "@/components/Sidebar";
import ChatInterface from "@/components/chat/ChatInterface";
import WorkflowHUD from "@/components/WorkflowHUD";

export const metadata: Metadata = {
  title: "OpsPilot — E-Commerce Operations Prototype",
  description: "A public e-commerce operations prototype using synthetic store records and simulated integrations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark" suppressHydrationWarning>
      <body className="h-full bg-background text-foreground overflow-hidden">
        <Providers>
          <div className="flex h-full w-full overflow-hidden relative">
            {/* Sidebar Left (Nav & History) */}
            <Sidebar />

            {/* Main Workspace Area (Full Width) */}
            <main className="min-w-0 flex-1 h-full overflow-hidden bg-background flex flex-col relative">
              {/* Interactive Workflow HUD Banner */}
              <WorkflowHUD />

              <div className="flex-1 overflow-y-auto">
                <p className="px-4 md:px-8 py-3 border-b border-zinc-800 bg-blue-500/5 text-xs text-zinc-400">
                  <strong className="text-blue-300">Public prototype.</strong> Synthetic store data and simulated integrations. Changes affect shared demo records only. The role selector demonstrates behavior; it is not production authentication.
                </p>
                {children}
              </div>
            </main>

            {/* Floating Chat Popup & Launcher in Bottom-Right */}
            <ChatInterface />
          </div>
        </Providers>
      </body>
    </html>
  );
}

