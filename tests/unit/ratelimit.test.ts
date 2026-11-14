import { beforeEach, describe, expect, it } from "vitest";
import { consumeRateLimit, resetMemoryRateLimits } from "@/lib/ratelimit";

describe("consumeRateLimit (almacén en memoria)", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    resetMemoryRateLimits();
  });

  it("permite hasta el límite y bloquea después", async () => {
    const opts = { key: "t1", limit: 3, now: 1000, windowSeconds: 60 };
    const results = [
      await consumeRateLimit(opts),
      await consumeRateLimit(opts),
      await consumeRateLimit(opts),
      await consumeRateLimit(opts),
    ];
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[0].remaining).toBe(2);
    expect(results[3].remaining).toBe(0);
  });

  it("aísla las claves entre sí", async () => {
    const base = { limit: 1, now: 1000, windowSeconds: 60 };
    await consumeRateLimit({ ...base, key: "a" });
    const b = await consumeRateLimit({ ...base, key: "b" });
    expect(b.allowed).toBe(true);
  });

  it("reinicia el contador al terminar la ventana", async () => {
    const base = { key: "w", limit: 1, windowSeconds: 10 };
    await consumeRateLimit({ ...base, now: 0 });
    expect((await consumeRateLimit({ ...base, now: 5000 })).allowed).toBe(
      false
    );
    expect((await consumeRateLimit({ ...base, now: 10_001 })).allowed).toBe(
      true
    );
  });

  it("informa el tiempo restante para reintentar", async () => {
    const base = { key: "r", limit: 1, windowSeconds: 60 };
    await consumeRateLimit({ ...base, now: 0 });
    const blocked = await consumeRateLimit({ ...base, now: 20_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(40);
  });
});
