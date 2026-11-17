import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { CalculationResultView } from "@/components/clinical/calculation-card";
import { ClinicalDisclaimer } from "@/components/clinical/safety-notices";
import { SessionAlertList } from "@/components/clinical/session-alerts";
import {
  DeleteRecordButton,
  PrintButton,
} from "@/components/clinical/session-record-actions";
import { FieldList } from "@/components/clinical/session-record-card";
import { buttonVariants } from "@/components/ui/button";
import type { SessionAlert } from "@/lib/clinical/session-record";
import type { CalculationResult } from "@/lib/clinical/types";
import { getSessionRecord } from "@/lib/session-records/service";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("sessionRecords.detail");
  return { title: t("title") };
}

export default async function SessionRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!(session?.user?.id && z.uuid().safeParse(id).success)) {
    notFound();
  }
  const record = await getSessionRecord(session.user.id, id);
  if (!record) {
    notFound();
  }
  const [t, format] = await Promise.all([
    getTranslations("sessionRecords"),
    getFormatter(),
  ]);
  const dash = t("detail.noData");
  const num = (value: number | null) =>
    value === null ? dash : format.number(value, { maximumFractionDigits: 2 });

  const fields: [string, string][] = [
    ["patientAlias", record.patientAlias ?? t("noAlias")],
    ["sessionDate", record.sessionDate ?? dash],
    ["machine", record.machine ?? dash],
    ["dialyzer", record.dialyzer ?? dash],
    ["vascularAccess", record.vascularAccess ?? dash],
    ["heparin", record.heparin ?? dash],
    ["preWeightKg", num(record.preWeightKg)],
    ["postWeightKg", num(record.postWeightKg)],
    ["dryWeightKg", num(record.dryWeightKg)],
    ["previousPostWeightKg", num(record.previousPostWeightKg)],
    ["durationHours", num(record.durationHours)],
    ["ufGoalMl", num(record.ufGoalMl)],
    ["ufAchievedMl", num(record.ufAchievedMl)],
    ["fluidsAdministeredMl", num(record.fluidsAdministeredMl)],
    ["bunPreMgDl", num(record.bunPreMgDl)],
    ["bunPostMgDl", num(record.bunPostMgDl)],
  ];
  const calculations = record.calculations as CalculationResult[];
  const alerts = record.alerts as SessionAlert[];

  return (
    <article
      className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 md:px-8 print:max-w-none print:gap-3 print:p-0 print:text-[11pt]"
      data-testid="session-record-detail"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
          href="/hojas"
        >
          <ArrowLeftIcon className="size-4" />
          {t("back")}
        </Link>
        <div className="flex gap-2">
          <PrintButton />
          <DeleteRecordButton id={record.id} />
        </div>
      </div>

      <header className="border-b pb-3">
        <h1 className="font-semibold text-2xl tracking-tight print:text-xl">
          {t("detail.title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("detail.createdAt", {
            date: format.dateTime(record.createdAt, {
              dateStyle: "long",
              timeStyle: "short",
            }),
          })}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 print:grid-cols-4">
        {fields.map(([key, value]) => (
          <div className="break-inside-avoid" key={key}>
            <dt className="text-muted-foreground text-xs">
              {t(`fields.${key}`)}
            </dt>
            <dd
              className={cn(
                "font-medium tabular-nums",
                value === dash && "text-muted-foreground"
              )}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {(record.missingFields.length > 0 ||
        record.unverifiedFields.length > 0) && (
        <div className="space-y-1 rounded-lg border border-dashed px-3 py-2 text-sm">
          {record.missingFields.length > 0 && (
            <p data-testid="missing-fields">
              <span className="font-medium">{t("missing")}: </span>
              <FieldList fields={record.missingFields} />
            </p>
          )}
          {record.unverifiedFields.length > 0 && (
            <p className="text-amber-800 dark:text-amber-200 print:text-black">
              <span className="font-medium">{t("unverified")}: </span>
              <FieldList fields={record.unverifiedFields} />
            </p>
          )}
        </div>
      )}

      {alerts.length > 0 && (
        <section className="break-inside-avoid space-y-2">
          <h2 className="font-medium">{t("detail.alerts")}</h2>
          <SessionAlertList alerts={alerts} />
        </section>
      )}

      <section className="break-inside-avoid space-y-2">
        <h2 className="font-medium">{t("detail.vitals")}</h2>
        {record.vitals.length === 0 ? (
          <p className="text-muted-foreground text-sm">{dash}</p>
        ) : (
          <table className="w-full max-w-md text-sm">
            <thead className="text-left text-muted-foreground text-xs">
              <tr>
                <th className="py-1 font-medium" scope="col">
                  {t("detail.time")}
                </th>
                <th className="py-1 font-medium" scope="col">
                  {t("detail.bp")}
                </th>
                <th className="py-1 font-medium" scope="col">
                  {t("detail.hr")}
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {record.vitals.map((vital, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lista inmutable, sin id propio
                <tr className="border-t" key={`${vital.time}-${index}`}>
                  <td className="py-1">{vital.time ?? dash}</td>
                  <td className="py-1">
                    {vital.systolic ?? "?"}/{vital.diastolic ?? "?"}
                  </td>
                  <td className="py-1">{vital.heartRate ?? dash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="break-inside-avoid space-y-2">
        <h2 className="font-medium">{t("detail.events")}</h2>
        {record.events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("detail.noEvents")}
          </p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {record.events.map((event, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lista inmutable, sin id propio
              <li key={`${event.time}-${index}`}>
                {event.time ? (
                  <span className="font-medium tabular-nums">
                    {event.time}:{" "}
                  </span>
                ) : null}
                {event.description}
              </li>
            ))}
          </ul>
        )}
        {record.notes ? (
          <p className="text-sm">
            <span className="font-medium">{t("fields.notes")}: </span>
            {record.notes}
          </p>
        ) : null}
      </section>

      {calculations.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("detail.calculations")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
            {calculations.map((result) => (
              <div className="break-inside-avoid" key={result.calculator}>
                <CalculationResultView compact result={result} />
              </div>
            ))}
          </div>
        </section>
      )}

      <details className="text-sm print:hidden">
        <summary className="cursor-pointer text-muted-foreground">
          {t("detail.sourceNotes")}
        </summary>
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 p-3">
          {record.sourceNotes}
        </p>
      </details>

      <div className="hidden print:mt-8 print:grid print:grid-cols-2 print:gap-8">
        <p className="border-t pt-1 text-xs">{t("detail.signature")}</p>
      </div>

      <ClinicalDisclaimer className="print:text-black" variant="banner" />
      <p className="text-muted-foreground text-xs">{t("reviewNotice")}</p>
    </article>
  );
}
