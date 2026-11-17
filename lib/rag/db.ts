import { type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/**
 * Base de datos inyectada: el mismo código funciona con postgres-js (app,
 * scripts) y con PGlite (pruebas de integración con pgvector en WASM).
 */
export type RagDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/** postgres-js devuelve un array; PGlite y node-postgres, `{ rows }`. */
export async function queryRows<T>(db: RagDb, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown;
  if (Array.isArray(result)) {
    return result as T[];
  }
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

const vectorSupport = new WeakMap<object, Promise<boolean>>();

/**
 * ¿Existe la columna generada `embeddingVec` (pgvector)? Se consulta una vez
 * por conexión: la decide la migración 0003 según el servidor.
 */
export function hasVectorColumn(db: RagDb): Promise<boolean> {
  let cached = vectorSupport.get(db);
  if (!cached) {
    cached = queryRows<{ present: boolean }>(
      db,
      sql`SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'protocol_chunk'
          AND column_name = 'embeddingVec'
      ) AS present`
    )
      .then((rows) => Boolean(rows[0]?.present))
      .catch(() => false);
    vectorSupport.set(db, cached);
  }
  return cached;
}
