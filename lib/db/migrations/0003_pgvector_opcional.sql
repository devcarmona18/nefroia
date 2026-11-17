-- Búsqueda vectorial con pgvector, OPCIONAL y protegida.
--
-- La columna canónica es protocol_chunk.embedding (real[]), que funciona en
-- cualquier PostgreSQL. Si la extensión pgvector está disponible (imagen
-- pgvector/pgvector:pg16, servicios gestionados), se crea la extensión y una
-- columna generada vector(384) con índice HNSW de distancia coseno. Si no lo
-- está, o el rol no tiene permiso para crearla, la migración solo emite un
-- NOTICE y la aplicación usa el ranking por producto escalar sobre real[]
-- (ver lib/rag/search.ts). PL/pgSQL planifica cada sentencia al ejecutarla,
-- así que el tipo `vector` no se resuelve en servidores sin la extensión.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS vector;
      ALTER TABLE "protocol_chunk"
        ADD COLUMN IF NOT EXISTS "embeddingVec" vector(384)
        GENERATED ALWAYS AS ("embedding"::vector(384)) STORED;
      CREATE INDEX IF NOT EXISTS "protocol_chunk_embeddingVec_hnsw_idx"
        ON "protocol_chunk" USING hnsw ("embeddingVec" vector_cosine_ops);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pgvector no se pudo activar (%): se usará el modo sin índice vectorial', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pgvector no está instalado: se usará el modo sin índice vectorial';
  END IF;
END
$$;
