import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getProtocolChunk } from "@/lib/protocols/service";

/** Fragmento citado (solo si pertenece al usuario de la sesión). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const chunk = z.uuid().safeParse(id).success
    ? await getProtocolChunk(session.user.id, id)
    : null;
  if (!chunk) {
    // 404 también para fragmentos ajenos: no se revela su existencia.
    return NextResponse.json({ code: "not_found" }, { status: 404 });
  }
  return NextResponse.json(chunk);
}
