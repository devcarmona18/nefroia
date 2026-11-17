import { z } from "zod";
import { ALLOWED_UPLOAD_TYPES } from "@/lib/storage/file-validation";
import { keyFromAppFileUrl } from "@/lib/storage/keys";

// 6000 caracteres: admite pegar las notas completas de una sesión.
const textPartSchema = z.object({
  text: z.string().min(1).max(6000),
  type: z.enum(["text"]),
});

const filePartSchema = z.object({
  mediaType: z.enum(ALLOWED_UPLOAD_TYPES),
  name: z.string().min(1).max(100),
  type: z.enum(["file"]),
  // Solo se aceptan URLs internas generadas por /api/files/upload.
  url: z
    .string()
    .max(2048)
    .refine((value) => keyFromAppFileUrl(value) !== null),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

const userMessageSchema = z.object({
  id: z.uuid(),
  parts: z.array(partSchema),
  role: z.enum(["user"]),
});

const toolApprovalMessageSchema = z.object({
  id: z.string(),
  parts: z.array(z.record(z.string(), z.unknown())),
  role: z.enum(["user", "assistant"]),
});

export const postRequestBodySchema = z.object({
  id: z.uuid(),
  message: userMessageSchema.optional(),
  messages: z.array(toolApprovalMessageSchema).optional(),
  selectedChatModel: z.string(),
  selectedVisibilityType: z.enum(["public", "private"]),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
