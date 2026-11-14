import "server-only";

import type { ChatMessage } from "@/lib/types";
import { isKeyOwnedBy, keyFromAppFileUrl } from "./keys";
import { getObjectBytes, isStorageConfigured } from "./s3";

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Los mensajes guardan URLs internas (`/api/files/...`) porque el bucket es
 * privado y las URLs prefirmadas caducan. Antes de llamar al modelo se leen
 * los bytes desde S3 y se envían como `data:` URL, de modo que el proveedor de
 * IA nunca necesita acceso a nuestro almacenamiento.
 */
export function resolveFileUrlsForModel(
  messages: ChatMessage[],
  userId: string
): Promise<ChatMessage[]> {
  if (!isStorageConfigured()) {
    return Promise.resolve(messages);
  }

  return Promise.all(
    messages.map(async (message) => {
      if (!message.parts.some((part) => part.type === "file")) {
        return message;
      }
      const parts = await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== "file") {
            return part;
          }
          const key = keyFromAppFileUrl(part.url);
          if (!key || !isKeyOwnedBy(key, userId)) {
            return part;
          }
          try {
            const { bytes } = await getObjectBytes(key);
            return {
              ...part,
              url: `data:${part.mediaType};base64,${toBase64(bytes)}`,
            };
          } catch {
            return part;
          }
        })
      );
      return { ...message, parts };
    })
  );
}
