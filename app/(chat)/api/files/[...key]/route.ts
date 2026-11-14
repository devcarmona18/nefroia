import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { isKeyOwnedBy } from "@/lib/storage/keys";
import { getPresignedGetUrl, isStorageConfigured } from "@/lib/storage/s3";

/**
 * Lectura de archivos subidos. El bucket es privado: tras comprobar que el
 * archivo pertenece al usuario autenticado se redirige a una URL prefirmada
 * de corta duración.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { code: "storage_not_configured" },
      { status: 503 }
    );
  }

  const { key: segments } = await params;
  const key = segments.map(decodeURIComponent).join("/");

  if (!isKeyOwnedBy(key, session.user.id)) {
    return NextResponse.json({ code: "forbidden" }, { status: 403 });
  }

  const url = await getPresignedGetUrl(key);
  return NextResponse.redirect(url, {
    headers: { "Cache-Control": "private, max-age=300" },
    status: 302,
  });
}
