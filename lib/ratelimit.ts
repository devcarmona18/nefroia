import { createClient } from "redis";

import { isTestEnvironment } from "@/lib/constants";
import { AppError } from "@/lib/errors";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type MemoryEntry = { count: number; resetAt: number };

/** Almacén en memoria (por proceso). Se usa si no hay Redis disponible. */
const memoryStore = new Map<string, MemoryEntry>();
const MAX_MEMORY_ENTRIES = 10_000;

function sweepMemoryStore(now: number) {
  if (memoryStore.size < MAX_MEMORY_ENTRIES) {
    return;
  }
  for (const [key, entry] of memoryStore) {
    if (entry.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}

export function resetMemoryRateLimits() {
  memoryStore.clear();
}

let client: ReturnType<typeof createClient> | null = null;

function getRedis() {
  if (!client && process.env.REDIS_URL) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => undefined);
    client.connect().catch(() => {
      client = null;
    });
  }
  return client;
}

function consumeMemory(
  key: string,
  limit: number,
  windowSeconds: number,
  now: number
): RateLimitResult {
  sweepMemoryStore(now);
  let entry = memoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowSeconds * 1000 };
    memoryStore.set(key, entry);
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

/**
 * Limitador de ventana fija. Usa Redis si `REDIS_URL` está definida y la
 * conexión está lista; si no, cae a memoria del proceso.
 */
export async function consumeRateLimit({
  key,
  limit,
  windowSeconds,
  now = Date.now(),
}: {
  key: string;
  limit: number;
  windowSeconds: number;
  now?: number;
}): Promise<RateLimitResult> {
  const redis = getRedis();

  if (redis?.isReady) {
    try {
      const redisKey = `rl:${key}`;
      const [count, ttl] = await redis
        .multi()
        .incr(redisKey)
        .expire(redisKey, windowSeconds, "NX")
        .ttl(redisKey)
        .exec()
        .then(([c, , t]) => [Number(c), Number(t)] as const);

      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    } catch {
      // Redis falló a mitad de operación: usar el respaldo en memoria.
    }
  }

  return consumeMemory(key, limit, windowSeconds, now);
}

function envInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Límite de peticiones de chat por IP (RATE_LIMIT_IP_MESSAGES_PER_HOUR, def. 100). */
export async function checkIpRateLimit(ip: string | undefined) {
  if (isTestEnvironment || !ip) {
    return;
  }

  const result = await consumeRateLimit({
    key: `chat-ip:${ip}`,
    limit: envInt("RATE_LIMIT_IP_MESSAGES_PER_HOUR", 100),
    windowSeconds: 60 * 60,
  });

  if (!result.allowed) {
    throw new AppError("rate_limit:chat");
  }
}

export type AuthAction = "login" | "register";

/**
 * Limita intentos de login/registro por email (AUTH_RATE_LIMIT_MAX_ATTEMPTS,
 * def. 10) y por IP (5 veces ese valor, porque varias personas pueden compartir
 * IP en una misma unidad). Ventana: AUTH_RATE_LIMIT_WINDOW_MINUTES (def. 15).
 */
export async function checkAuthRateLimit({
  action,
  email,
  ip,
}: {
  action: AuthAction;
  email?: string;
  ip?: string;
}): Promise<RateLimitResult> {
  const limit = envInt("AUTH_RATE_LIMIT_MAX_ATTEMPTS", 10);
  const windowSeconds = envInt("AUTH_RATE_LIMIT_WINDOW_MINUTES", 15) * 60;

  if (isTestEnvironment) {
    return { allowed: true, limit, remaining: limit, retryAfterSeconds: 0 };
  }

  const checks: Promise<RateLimitResult>[] = [];
  if (ip) {
    checks.push(
      consumeRateLimit({
        key: `auth:${action}:ip:${ip}`,
        limit: limit * 5,
        windowSeconds,
      })
    );
  }
  if (email) {
    checks.push(
      consumeRateLimit({
        key: `auth:${action}:email:${email.toLowerCase()}`,
        limit,
        windowSeconds,
      })
    );
  }

  const results = await Promise.all(checks);
  const blocked = results.find((r) => !r.allowed);
  return (
    blocked ?? {
      allowed: true,
      limit,
      remaining: Math.min(...results.map((r) => r.remaining), limit),
      retryAfterSeconds: 0,
    }
  );
}
