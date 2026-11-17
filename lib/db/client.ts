import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Conexión única de la aplicación (un pool por proceso). Los módulos de
 * dominio (RAG, hojas de sesión) reciben la conexión por parámetro para poder
 * probarse contra PGlite o un PostgreSQL de pruebas.
 */
const client = postgres(process.env.POSTGRES_URL ?? "", {
  onnotice: () => null,
});

export const db = drizzle(client);
export type AppDb = typeof db;
