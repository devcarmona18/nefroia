/**
 * Protección contra reutilización de tokens de SSO: cada `jti` se acepta una
 * sola vez mientras el token esté vigente.
 */
export type ReplayStore = {
  /** `true` si es el primer uso del `jti`; `false` si ya se había usado. */
  consume: (jti: string, expiresAtMs: number) => Promise<boolean>;
};

const MAX_MEMORY_ENTRIES = 50_000;

/** Respaldo en memoria del proceso (también se usa en las pruebas). */
export function createMemoryReplayStore(
  clock: () => number = Date.now
): ReplayStore {
  const seen = new Map<string, number>();

  function sweep(now: number) {
    for (const [jti, expiresAt] of seen) {
      if (expiresAt <= now) {
        seen.delete(jti);
      }
    }
  }

  return {
    consume(jti, expiresAtMs) {
      const now = clock();
      if (seen.size >= MAX_MEMORY_ENTRIES) {
        sweep(now);
      }
      const previous = seen.get(jti);
      if (previous !== undefined && previous > now) {
        return Promise.resolve(false);
      }
      // Si el almacén está lleno de tokens vigentes, se rechaza (falla cerrado).
      if (seen.size >= MAX_MEMORY_ENTRIES) {
        return Promise.resolve(false);
      }
      seen.set(jti, expiresAtMs);
      return Promise.resolve(true);
    },
  };
}
