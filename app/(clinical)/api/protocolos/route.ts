import { after, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getEntitlements } from "@/lib/ai/entitlements";
import {
  createProtocol,
  ingestProtocol,
  listProtocols,
} from "@/lib/protocols/service";
import {
  PROTOCOL_UPLOAD_MAX_BYTES,
  validateProtocolUpload,
} from "@/lib/storage/file-validation";

// La ingesta (extracción + embeddings) puede tardar con PDF grandes.
export const maxDuration = 300;

// Los códigos son claves de `protocols.errors.*` en messages/*.json.
function errorResponse(code: string, status: number) {
  return NextResponse.json({ code }, { status });
}

function toTitle(filename: string, requested: FormDataEntryValue | null) {
  const fromForm = typeof requested === "string" ? requested.trim() : "";
  const fallback = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  return (fromForm || fallback || "Protocolo").slice(0, 200);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("unauthorized", 401);
  }
  const documents = await listProtocols(session.user.id);
  return NextResponse.json(documents);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("unauthorized", 401);
  }
  // Modo demo de Hoja Diaria: solo lectura de protocolos.
  if (!getEntitlements(session.user.type).canManageProtocols) {
    return errorResponse("forbidden", 403);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > PROTOCOL_UPLOAD_MAX_BYTES + 64 * 1024) {
    return errorResponse("too_large", 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("invalid_request", 400);
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse("no_file", 400);
  }
  if (file.size > PROTOCOL_UPLOAD_MAX_BYTES) {
    return errorResponse("too_large", 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateProtocolUpload(bytes, file.name);
  if (!validation.ok) {
    const status = validation.reason === "too_large" ? 413 : 400;
    return errorResponse(
      validation.reason === "empty" ? "no_file" : validation.reason,
      status
    );
  }

  let doc: Awaited<ReturnType<typeof createProtocol>>;
  try {
    doc = await createProtocol({
      bytes,
      contentType: validation.contentType,
      extension: validation.extension,
      filename: file.name.slice(0, 255),
      title: toTitle(file.name, formData.get("title")),
      userId: session.user.id,
    });
  } catch (error) {
    console.error("No se pudo registrar el protocolo:", error);
    return errorResponse("upload_failed", 500);
  }

  // Se responde ya (202) y se indexa después: la interfaz consulta el estado.
  after(() => ingestProtocol({ bytes, doc, kind: validation.kind }));

  return NextResponse.json(doc, { status: 202 });
}
