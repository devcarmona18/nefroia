"use client";

import { BookOpenTextIcon, FileTextIcon, SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import useSWR from "swr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ProtocolCitation,
  ProtocolSearchOutput,
} from "@/lib/ai/tools/search-protocols";
import { fetcher } from "@/lib/utils";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type ChunkResponse = {
  id: string;
  content: string;
  documentTitle: string;
  heading: string | null;
  page: number | null;
  isDemo: boolean;
};

export function useCitationLabel() {
  const t = useTranslations("protocols.citations");
  return (citation: Pick<ProtocolCitation, "page" | "heading">) => {
    if (citation.page !== null) {
      return t("page", { page: citation.page });
    }
    if (citation.heading) {
      return t("section", {
        section: citation.heading.split(" › ").at(-1) ?? "",
      });
    }
    return t("fragment");
  };
}

/** Diálogo con el fragmento completo del protocolo (leído del servidor). */
export function ChunkDialog({
  chunkId,
  open,
  onOpenChange,
  fallback,
}: {
  chunkId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallback?: ProtocolCitation;
}) {
  const t = useTranslations("protocols.citations");
  const label = useCitationLabel();
  const { data, error, isLoading } = useSWR<ChunkResponse>(
    open ? `${BASE_PATH}/api/protocolos/fragmentos/${chunkId}` : null,
    fetcher
  );
  const title = data?.documentTitle ?? fallback?.documentTitle ?? "";
  const meta = data ?? fallback;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {meta?.page === null || meta?.page === undefined
              ? (meta?.heading ?? null)
              : [label(meta), meta.heading].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : null}
        {error && !data ? (
          <p className="text-destructive text-sm" role="alert">
            {t("loadError")}
          </p>
        ) : null}
        <div
          className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-relaxed"
          data-testid="chunk-content"
        >
          {data?.content ?? fallback?.excerpt}
        </div>
        <p className="text-muted-foreground text-xs">{t("verifyNotice")}</p>
      </DialogContent>
    </Dialog>
  );
}

export function CitationChip({ citation }: { citation: ProtocolCitation }) {
  const [open, setOpen] = useState(false);
  const label = useCitationLabel();
  const t = useTranslations("protocols.citations");
  const handleOpen = useCallback(() => setOpen(true), []);

  return (
    <>
      <button
        aria-label={t("open", {
          location: label(citation),
          title: citation.documentTitle,
        })}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-left text-xs transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="citation-chip"
        onClick={handleOpen}
        type="button"
      >
        <span className="rounded bg-primary/10 px-1 font-mono font-semibold text-[10px] text-primary">
          {citation.ref}
        </span>
        <FileTextIcon aria-hidden="true" className="size-3 shrink-0" />
        <span className="truncate">{citation.documentTitle}</span>
        <span className="shrink-0 text-muted-foreground">
          · {label(citation)}
        </span>
      </button>
      <ChunkDialog
        chunkId={citation.chunkId}
        fallback={citation}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  );
}

export function ProtocolSearchResult({
  output,
}: {
  output: ProtocolSearchOutput;
}) {
  const t = useTranslations("protocols.citations");
  if (!output.grounded || output.results.length === 0) {
    return (
      <div
        className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-muted-foreground text-sm"
        data-testid="protocol-search-empty"
      >
        <SearchXIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{t("noResults", { query: output.query })}</span>
      </div>
    );
  }
  return (
    <div className="space-y-1.5" data-testid="protocol-citations">
      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <BookOpenTextIcon aria-hidden="true" className="size-3.5" />
        {t("sources", { count: output.results.length })}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {output.results.map((citation) => (
          <CitationChip citation={citation} key={citation.chunkId} />
        ))}
      </div>
    </div>
  );
}
