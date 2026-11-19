import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getEntitlements } from "@/lib/ai/entitlements";
import { deleteProtocol } from "@/lib/protocols/service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  if (!getEntitlements(session.user.type).canManageProtocols) {
    return NextResponse.json({ code: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ code: "not_found" }, { status: 404 });
  }
  const deleted = await deleteProtocol(session.user.id, id);
  if (!deleted) {
    return NextResponse.json({ code: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ id: deleted.id });
}
