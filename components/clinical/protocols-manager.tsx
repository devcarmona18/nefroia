"use client";

import {
  FileTextIcon,
  Loader2Icon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProtocolDocument } from "@/lib/db/schema";
import type { SearchResponse } from "@/lib/rag/search";
import { cn } from "@/lib/utils";
import { ChunkDialog, useCitationLabel } from "./protocol-citations";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const API = `${BASE_PATH}/api/protocolos`;

type SerializedDocument = Omit<ProtocolDocument, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

const STATUS_STYLES: Record<ProtocolDocument["status"], string> = {
  failed:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100",
  processing:
    "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100",
  ready:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100",
};

async function listFetcher(url: string): Promise<SerializedDocument[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(String(response.status));
  }
  return response.json();
}

/** true tras la hidratación: evita envíos nativos del formulario antes. */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const t = useTranslations("protocols");
  const hydrated = useHydrated();
  const [isUploading, setIsUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const file = data.get("file");
      if (!(file instanceof File) || file.size === 0) {
        toast.error(t("errors.no_file"));
        return;
      }
      setIsUploading(true);
      try {
        const response = await fetch(API, { body: data, method: "POST" });
        if (!response.ok) {
          const { code } = await response.json().catch(() => ({ code: "" }));
          toast.error(
            t.has(`errors.${code}`)
              ? t(`errors.${code}`)
              : t("errors.upload_failed")
          );
          return;
        }
        toast.success(t("upload.success"));
        formRef.current?.reset();
        onUploaded();
      } catch {
        toast.error(t("errors.upload_failed"));
      } finally {
        setIsUploading(false);
      }
    },
    [onUploaded, t]
  );

  return (
    <form
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] md:grid-cols-[1fr_1fr_auto] md:items-end"
      data-testid="protocol-upload-form"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="protocol-file">{t("upload.label")}</Label>
        <Input
          accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
          id="protocol-file"
          name="file"
          required
          type="file"
        />
        <p className="text-muted-foreground text-xs">{t("upload.hint")}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="protocol-title">{t("upload.titleLabel")}</Label>
        <Input
          id="protocol-title"
          maxLength={200}
          name="title"
          placeholder={t("upload.titlePlaceholder")}
        />
        <p className="text-muted-foreground text-xs">{t("upload.noPii")}</p>
      </div>
      <Button
        className="md:mb-5"
        disabled={!hydrated || isUploading}
        type="submit"
      >
        {isUploading ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <UploadIcon className="size-4" />
        )}
        {isUploading ? t("upload.uploading") : t("upload.submit")}
      </Button>
    </form>
  );
}

function DocumentRow({
  doc,
  onDeleted,
  canManage,
}: {
  doc: SerializedDocument;
  onDeleted: () => void;
  canManage: boolean;
}) {
  const t = useTranslations("protocols");
  const format = useFormatter();

  const handleDelete = useCallback(async () => {
    // biome-ignore lint/suspicious/noAlert: confirmación nativa, accesible
    if (!window.confirm(t("list.deleteConfirm", { title: doc.title }))) {
      return;
    }
    const response = await fetch(`${API}/${doc.id}`, { method: "DELETE" });
    if (response.ok) {
      toast.success(t("list.deleted"));
      onDeleted();
    } else {
      toast.error(t("errors.not_found"));
    }
  }, [doc.id, doc.title, onDeleted, t]);

  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3"
      data-status={doc.status}
      data-testid="protocol-row"
    >
      <FileTextIcon
        aria-hidden="true"
        className="size-5 text-muted-foreground"
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium text-sm">
          <span className="truncate">{doc.title}</span>
          {doc.isDemo ? (
            <span className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 font-normal text-violet-900 text-xs dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100">
              {t("list.demo")}
            </span>
          ) : null}
        </p>
        <p className="text-muted-foreground text-xs">
          {doc.filename} ·{" "}
          {t("list.uploadedAt", {
            date: format.dateTime(new Date(doc.createdAt), {
              dateStyle: "medium",
            }),
          })}
          {doc.pages ? ` · ${t("list.pages", { count: doc.pages })}` : ""}
          {doc.status === "ready"
            ? ` · ${t("list.chunks", { count: doc.chunkCount })}`
            : ""}
          {doc.status === "failed" && doc.error
            ? ` · ${t.has(`errors.${doc.error}`) ? t(`errors.${doc.error}`) : doc.error}`
            : ""}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-xs",
          STATUS_STYLES[doc.status]
        )}
        data-testid="protocol-status"
      >
        {doc.status === "processing" && (
          <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
        )}
        {t(`status.${doc.status}`)}
      </span>
      {canManage ? (
        <Button
          aria-label={`${t("list.delete")}: ${doc.title}`}
          onClick={handleDelete}
          size="icon"
          variant="ghost"
        >
          <TrashIcon className="size-4" />
        </Button>
      ) : null}
    </li>
  );
}

function SearchHitItem({
  hit,
  index,
}: {
  hit: SearchResponse["hits"][number];
  index: number;
}) {
  const t = useTranslations("protocols.search");
  const label = useCitationLabel();
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const handleOpen = useCallback(() => setOpen(true), []);

  return (
    <li>
      <button
        className="w-full rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="protocol-search-hit"
        onClick={handleOpen}
        type="button"
      >
        <p className="flex flex-wrap items-center gap-x-2 font-medium text-sm">
          <span className="font-mono text-primary text-xs">P{index + 1}</span>
          {hit.documentTitle}
          <span className="font-normal text-muted-foreground text-xs">
            {label(hit)}
            {hit.heading ? ` · ${hit.heading}` : ""}
          </span>
        </p>
        <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
          {hit.content}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
          {t("score", {
            score: format.number(hit.score, { maximumFractionDigits: 4 }),
          })}
          {hit.vectorRank ? ` · ${t("vector", { rank: hit.vectorRank })}` : ""}
          {hit.lexicalRank
            ? ` · ${t("lexical", { rank: hit.lexicalRank })}`
            : ""}
        </p>
      </button>
      <ChunkDialog chunkId={hit.chunkId} onOpenChange={setOpen} open={open} />
    </li>
  );
}

function SearchTester() {
  const t = useTranslations("protocols.search");
  const hydrated = useHydrated();
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const query = String(new FormData(event.currentTarget).get("q") ?? "");
      if (!query.trim()) {
        return;
      }
      setIsSearching(true);
      try {
        const response = await fetch(
          `${API}/buscar?q=${encodeURIComponent(query)}`
        );
        setResult(response.ok ? await response.json() : null);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  return (
    <section
      aria-labelledby="search-tester-title"
      className="space-y-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]"
    >
      <div>
        <h2 className="font-medium" id="search-tester-title">
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>
      <form className="flex gap-2" onSubmit={handleSubmit}>
        <Input
          aria-label={t("title")}
          data-testid="protocol-search-input"
          maxLength={300}
          name="q"
          placeholder={t("placeholder")}
        />
        <Button
          disabled={!hydrated || isSearching}
          type="submit"
          variant="secondary"
        >
          {isSearching ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SearchIcon className="size-4" />
          )}
          {t("submit")}
        </Button>
      </form>
      {result ? (
        <div className="space-y-2" data-testid="protocol-search-results">
          <p className="text-muted-foreground text-xs">
            {t("mode", { mode: result.mode })}
          </p>
          {result.hits.length === 0 ? (
            <p className="text-sm">{t("empty")}</p>
          ) : (
            <ol className="space-y-2">
              {result.hits.map((hit, index) => (
                <SearchHitItem hit={hit} index={index} key={hit.chunkId} />
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function ProtocolsManager({
  initialDocuments,
  canManage = true,
}: {
  initialDocuments: SerializedDocument[];
  /** `false` en el modo demo de Hoja Diaria (solo lectura). */
  canManage?: boolean;
}) {
  const t = useTranslations("protocols");
  const { data, mutate } = useSWR(API, listFetcher, {
    fallbackData: initialDocuments,
  });
  const documents = data ?? [];
  const isProcessing = documents.some((doc) => doc.status === "processing");

  // Mientras haya documentos indexándose, se consulta su estado cada 2 s.
  useEffect(() => {
    if (!isProcessing) {
      return;
    }
    const timer = setInterval(() => {
      mutate();
    }, 2000);
    return () => clearInterval(timer);
  }, [isProcessing, mutate]);
  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <UploadForm onUploaded={refresh} />
      ) : (
        <p
          className="rounded-lg border bg-muted/40 px-4 py-3 text-muted-foreground text-sm"
          data-testid="protocol-readonly"
        >
          {t("errors.forbidden")}
        </p>
      )}
      <section aria-label={t("title")}>
        {documents.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
            {t("list.empty")}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="protocol-list">
            {documents.map((doc) => (
              <DocumentRow
                canManage={canManage}
                doc={doc}
                key={doc.id}
                onDeleted={refresh}
              />
            ))}
          </ul>
        )}
      </section>
      <SearchTester />
    </div>
  );
}
