import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { searchProtocols } from "@/lib/protocols/service";

/** Búsqueda de prueba (misma recuperación que usa el asistente). */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  const query = new URL(request.url).searchParams.get("q")?.slice(0, 300) ?? "";
  if (!query.trim()) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  }
  const result = await searchProtocols(session.user.id, query, 5);
  return NextResponse.json(result);
}
