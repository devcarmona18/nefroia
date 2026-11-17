import path from "node:path";
import { defineConfig } from "vitest/config";

/** Pruebas de integración (PGlite + pgvector y, opcionalmente, PostgreSQL). */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 120_000,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
