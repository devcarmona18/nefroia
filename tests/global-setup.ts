import { execFileSync } from "node:child_process";

/**
 * Prepara los datos de demostración antes de las pruebas e2e (usuario demo,
 * protocolos y hojas). Con PLAYWRIGHT=True el seed usa embeddings "hash".
 */
export default function globalSetup() {
  if (process.env.SKIP_E2E_SEED) {
    return;
  }
  execFileSync("pnpm", ["exec", "tsx", "scripts/seed-demo.ts"], {
    env: { ...process.env, PLAYWRIGHT: "True" },
    stdio: "inherit",
  });
}
