import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { auth } from "@/app/(auth)/auth";
import { getChatById, getStreamIdsByChatId } from "@/lib/db/queries";
import { AppError } from "@/lib/errors";
import { getStreamContext } from "@/lib/stream-context";

/**
 * Reanuda el último stream de un chat (requiere Redis). Responde 204 cuando
 * no hay nada que reanudar: sin Redis, sin streams, o stream ya terminado
 * (en ese caso el mensaje completo ya está guardado en la base de datos).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chatId } = await params;

  const session = await auth();
  if (!session?.user) {
    return new AppError("unauthorized:stream").toResponse();
  }

  const streamContext = getStreamContext();
  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  const chat = await getChatById({ id: chatId });
  if (!chat) {
    return new AppError("not_found:stream").toResponse();
  }
  if (chat.userId !== session.user.id) {
    return new AppError("forbidden:stream").toResponse();
  }

  const streamIds = await getStreamIdsByChatId({ chatId });
  const recentStreamId = streamIds.at(-1);
  if (!recentStreamId) {
    return new Response(null, { status: 204 });
  }

  const stream = await streamContext.resumeExistingStream(recentStreamId);
  if (!stream) {
    return new Response(null, { status: 204 });
  }

  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
}
