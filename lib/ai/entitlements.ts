import type { UserType } from "@/app/(auth)/auth";

type Entitlements = {
  maxMessagesPerHour: number;
  /** Subir y borrar protocolos de la unidad. */
  canManageProtocols: boolean;
  /** Adjuntar archivos en el chat. */
  canUploadFiles: boolean;
};

function envInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Límite de mensajes por usuario y hora. Configurable con:
 * - RATE_LIMIT_GUEST_MESSAGES_PER_HOUR (por defecto 10)
 * - RATE_LIMIT_USER_MESSAGES_PER_HOUR (por defecto 60; también usuarios
 *   administradores que entran desde Hoja Diaria)
 * - RATE_LIMIT_SSO_DEMO_MESSAGES_PER_HOUR (por defecto 5; visitantes del modo
 *   demo de Hoja Diaria, que además no pueden subir protocolos ni archivos)
 */
export function getEntitlements(userType: UserType): Entitlements {
  if (userType === "hdr-demo") {
    return {
      canManageProtocols: false,
      canUploadFiles: false,
      maxMessagesPerHour: envInt("RATE_LIMIT_SSO_DEMO_MESSAGES_PER_HOUR", 5),
    };
  }
  return {
    canManageProtocols: true,
    canUploadFiles: true,
    maxMessagesPerHour:
      userType === "guest"
        ? envInt("RATE_LIMIT_GUEST_MESSAGES_PER_HOUR", 10)
        : envInt("RATE_LIMIT_USER_MESSAGES_PER_HOUR", 60),
  };
}
