import { getTranslations } from "next-intl/server";
import { auth } from "@/app/(auth)/auth";
import {
  CSV_COLUMNS,
  type CsvColumn,
  sessionRecordsToCsv,
} from "@/lib/session-records/csv";
import { listSessionRecords } from "@/lib/session-records/service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  const t = await getTranslations("sessionRecords.csv");
  const headers = Object.fromEntries(
    CSV_COLUMNS.map((column) => [column, t(column)])
  ) as Record<CsvColumn, string>;
  const records = await listSessionRecords(session.user.id, 5000);
  const csv = sessionRecordsToCsv(records, headers);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="hojas-de-sesion-${date}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
