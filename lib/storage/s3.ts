import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  getStorageConfig,
  PRESIGNED_URL_TTL_SECONDS,
  type StorageConfig,
} from "./config";

function createClient(config: StorageConfig, endpoint?: string) {
  return new S3Client({
    credentials:
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined,
    endpoint,
    forcePathStyle: config.forcePathStyle,
    region: config.region,
  });
}

let internalClient: S3Client | null = null;
let signingClient: S3Client | null = null;

function requireConfig(): StorageConfig {
  const config = getStorageConfig();
  if (!config) {
    throw new Error("Almacenamiento S3 no configurado (falta S3_BUCKET).");
  }
  return config;
}

/** Cliente para operaciones del servidor (put/get). */
function getInternalClient(config: StorageConfig) {
  internalClient ??= createClient(config, config.endpoint);
  return internalClient;
}

/**
 * Cliente usado solo para firmar URLs. Usa el endpoint público para que la
 * URL sea accesible desde el navegador (p. ej. localhost:9000 con MinIO
 * mientras la app habla con `minio:9000` dentro de Docker).
 */
function getSigningClient(config: StorageConfig) {
  signingClient ??= createClient(
    config,
    config.publicEndpoint ?? config.endpoint
  );
  return signingClient;
}

export function isStorageConfigured(): boolean {
  return getStorageConfig() !== null;
}

export async function putObject({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Uint8Array;
  contentType: string;
}) {
  const config = requireConfig();
  await getInternalClient(config).send(
    new PutObjectCommand({
      Body: body,
      Bucket: config.bucket,
      ContentType: contentType,
      Key: key,
    })
  );
}

export async function getObjectBytes(
  key: string
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const config = requireConfig();
  const result = await getInternalClient(config).send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key })
  );
  if (!result.Body) {
    throw new Error("Objeto vacío");
  }
  return {
    bytes: await result.Body.transformToByteArray(),
    contentType: result.ContentType ?? "application/octet-stream",
  };
}

export async function deleteObject(key: string) {
  const config = requireConfig();
  await getInternalClient(config).send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key })
  );
}

/** URL de lectura prefirmada y temporal (el bucket es privado). */
export function getPresignedGetUrl(
  key: string,
  expiresIn = PRESIGNED_URL_TTL_SECONDS
): Promise<string> {
  const config = requireConfig();
  return getSignedUrl(
    getSigningClient(config),
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn }
  );
}
