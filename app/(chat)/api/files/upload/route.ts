import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  MAX_UPLOAD_BYTES,
  sanitizeFilename,
  validateUpload,
} from "@/lib/storage/file-validation";
import { appFileUrl, userUploadPrefix } from "@/lib/storage/keys";
import { isStorageConfigured, putObject } from "@/lib/storage/s3";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Los códigos son claves del namespace "upload" en messages/*.json.
function errorResponse(code: string, status: number) {
  return NextResponse.json({ code }, { status });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return errorResponse("unauthorized", 401);
  }

  if (!isStorageConfigured()) {
    return errorResponse("storage_not_configured", 503);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES + 64 * 1024) {
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

  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse("too_large", 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateUpload(bytes);

  if (!validation.ok) {
    if (validation.reason === "too_large") {
      return errorResponse("too_large", 413);
    }
    return errorResponse(
      validation.reason === "empty" ? "no_file" : "invalid_type",
      400
    );
  }

  const safeName = sanitizeFilename(file.name, validation.extension);
  const key = `${userUploadPrefix(session.user.id)}${crypto.randomUUID()}-${safeName}`;

  try {
    await putObject({ body: bytes, contentType: validation.contentType, key });
  } catch (error) {
    console.error("Error al subir archivo a S3:", error);
    return errorResponse("upload_failed", 500);
  }

  return NextResponse.json({
    contentType: validation.contentType,
    pathname: safeName,
    url: appFileUrl(key, BASE_PATH),
  });
}
