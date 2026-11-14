import type { UserType } from "@/app/(auth)/auth";

type Entitlements = {
  maxMessagesPerHour: number;
};

function envInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Límite de mensajes por usuario y hora. Configurable con:
 * - RATE_LIMIT_GUEST_MESSAGES_PER_HOUR (por defecto 10)
 * - RATE_LIMIT_USER_MESSAGES_PER_HOUR (por defecto 60)
 */
export function getEntitlements(userType: UserType): Entitlements {
  return {
    maxMessagesPerHour:
      userType === "guest"
        ? envInt("RATE_LIMIT_GUEST_MESSAGES_PER_HOUR", 10)
        : envInt("RATE_LIMIT_USER_MESSAGES_PER_HOUR", 60),
  };
}
