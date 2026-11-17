import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { auth } from "@/app/(auth)/auth";
import { PageHeader } from "@/components/clinical/page-header";
import { ClinicalDisclaimer } from "@/components/clinical/safety-notices";
import { SessionRecordForm } from "@/components/clinical/session-record-form";
import { buttonVariants } from "@/components/ui/button";
import type { SessionAlert } from "@/lib/clinical/session-record";
import { listSessionRecords } from "@/lib/session-records/service";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("sessionRecords");
  return { title: t("title") };
}

const SEVERITY_DOT: Record<SessionAlert["severity"], string> = {
  critical: "bg-red-600",
  info: "bg-slate-400",
  warning: "bg-amber-500",
};

export default async function SessionRecordsPage() {
  const [session, t, format] = await Promise.all([
    auth(),
    getTranslations("sessionRecords"),
    getFormatter(),
  ]);
  const records = session?.user?.id
    ? await listSessionRecords(session.user.id)
    : [];
  const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const dash = t("detail.noData");
  const num = (value: number | null) =>
    value === null ? dash : format.number(value, { maximumFractionDigits: 1 });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <PageHeader
        actions={
          records.length > 0 ? (
            <a
              className={cn(buttonVariants({ variant: "outline" }))}
              data-testid="export-csv"
              download
              href={`${BASE_PATH}/api/hojas/export`}
            >
              <DownloadIcon className="size-4" />
              {t("exportCsv")}
            </a>
          ) : null
        }
        description={t("description")}
        title={t("title")}
      />
      <ClinicalDisclaimer variant="banner" />
      <SessionRecordForm />

      {records.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm" data-testid="session-records-table">
            <thead className="bg-muted/50 text-left text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 font-medium" scope="col">
                  {t("table.date")}
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  {t("table.patient")}
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  {t("table.machine")}
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  {t("table.weights")}
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  {t("table.uf")}
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  {t("table.alerts")}
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  <span className="sr-only">{t("table.open")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const alerts = record.alerts as SessionAlert[];
                return (
                  <tr
                    className="border-t"
                    data-testid="session-record-row"
                    key={record.id}
                  >
                    <td className="px-3 py-2 tabular-nums">
                      {record.sessionDate ??
                        format.dateTime(record.createdAt, {
                          dateStyle: "medium",
                        })}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {record.patientAlias ?? t("noAlias")}
                    </td>
                    <td className="px-3 py-2">{record.machine ?? dash}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {num(record.preWeightKg)} / {num(record.postWeightKg)} /{" "}
                      {num(record.dryWeightKg)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {num(record.ufAchievedMl)}
                    </td>
                    <td className="px-3 py-2">
                      {alerts.length === 0 ? (
                        dash
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          {alerts.slice(0, 5).map((alert) => (
                            <span
                              className={cn(
                                "size-2.5 rounded-full",
                                SEVERITY_DOT[alert.severity]
                              )}
                              key={`${alert.code}-${JSON.stringify(alert.params)}`}
                              title={t(`alerts.severity.${alert.severity}`)}
                            >
                              <span className="sr-only">
                                {t(`alerts.severity.${alert.severity}`)}
                              </span>
                            </span>
                          ))}
                          <span className="text-muted-foreground text-xs">
                            {alerts.length}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        className="text-primary hover:underline"
                        href={`/hojas/${record.id}`}
                      >
                        {t("table.open")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
