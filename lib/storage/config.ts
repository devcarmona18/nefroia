import "server-only";

/**
 * Configuración del almacenamiento compatible con S3 (AWS S3, MinIO, R2...).
 * Todas las variables se leen en tiempo de ejecución.
 */
export type StorageConfig = {
  bucket: string;
  endpoint?: string;
  /** Endpoint accesible desde el navegador (para URLs prefirmadas). */
  publicEndpoint?: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
};

export function getStorageConfig(): StorageConfig | null {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    return null;
  }
  return {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
    bucket,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || undefined,
    region: process.env.S3_REGION || "us-east-1",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
  };
}

export const PRESIGNED_URL_TTL_SECONDS = 60 * 10;
