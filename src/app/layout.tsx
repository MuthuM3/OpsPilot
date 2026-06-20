import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Sidebar from "@/components/Sidebar";
import ChatInterface from "@/components/chat/ChatInterface";
import WorkflowHUD from "@/components/WorkflowHUD";

export const metadata: Metadata = {
  title: "OpsPilot - AI Operations Agent for E-Commerce Teams",
  description: "Governance-first AI operations orchestrator for e-commerce updates and refunds.",
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
          <div className="flex h-full w-full overflow-hidden">
            {/* Sidebar Left (Nav & History) */}
            <Sidebar />

            {/* AI Assistant Chat Panel Middle */}
            <ChatInterface />

            {/* Main Workspace Area Right */}
            <main className="flex-1 h-full overflow-hidden bg-[#090d16] flex flex-col relative">
              {/* Interactive Workflow HUD Banner */}
              <WorkflowHUD />

              <div className="flex-1 overflow-y-auto">
                {children}
              </div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}

