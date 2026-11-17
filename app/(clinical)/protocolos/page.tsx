import { getTranslations } from "next-intl/server";
import { auth } from "@/app/(auth)/auth";
import { PageHeader } from "@/components/clinical/page-header";
import { ProtocolsManager } from "@/components/clinical/protocols-manager";
import { ClinicalDisclaimer } from "@/components/clinical/safety-notices";
import { listProtocols } from "@/lib/protocols/service";

export async function generateMetadata() {
  const t = await getTranslations("protocols");
  return { title: t("title") };
}

export default async function ProtocolsPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("protocols"),
  ]);
  const documents = session?.user?.id
    ? await listProtocols(session.user.id)
    : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8">
      <PageHeader description={t("description")} title={t("title")} />
      <ClinicalDisclaimer variant="banner" />
      <ProtocolsManager
        initialDocuments={JSON.parse(JSON.stringify(documents))}
      />
    </div>
  );
}
