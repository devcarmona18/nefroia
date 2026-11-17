import { cookies } from "next/headers";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "../(auth)/auth";

/**
 * Layout de las páginas clínicas (/protocolos, /hojas): misma barra lateral
 * que el chat, pero sin el panel de conversación.
 */
export default function ClinicalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="flex h-dvh bg-sidebar" />}>
      <ClinicalShell>{children}</ClinicalShell>
    </Suspense>
  );
}

async function ClinicalShell({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <AppSidebar user={session?.user} />
      <SidebarInset className="print:m-0 print:shadow-none">
        <Toaster position="top-center" theme="system" />
        <main className="h-dvh overflow-y-auto bg-background print:h-auto print:overflow-visible">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
