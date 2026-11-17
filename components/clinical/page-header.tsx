import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
      <div className="flex items-start gap-2">
        <SidebarTrigger className="mt-1 md:hidden" />
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </header>
  );
}
