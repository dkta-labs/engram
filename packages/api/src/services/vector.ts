import { Pool } from "pg";
import { config } from "../config.js";

let pool: Pool | null = null;

const INIT_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS embedding_dimensions (
  dimension INTEGER PRIMARY KEY,
  table_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

/** Validate dimension is a positive integer to prevent SQL injection in dynamic table names */
function validateDimension(dim: number): void {
  if (!Number.isInteger(dim) || dim < 64 || dim > 16000) {
    throw new Error(`Invalid embedding dimension: ${dim}. Must be integer between 64 and 16000.`);
  }
}

function tableName(dim: number): string {
  validateDimension(dim);
  return `memory_embeddings_${dim}`;
}

export async function initVector(): Promise<void> {
  pool = new Pool({ connectionString: config.databaseUrl });
  await pool.query(INIT_SQL);
  console.log("pgvector initialized");
}

/** Ensure a dimension-specific table exists, creating it if needed with advisory lock to prevent races */
export async function ensureDimensionTable(dim: number): Promise<string> {
  if (!pool) throw new Error("Vector DB not initialized");
  const name = tableName(dim);

  // Fast path: check if already registered
  const existing = await pool.query(
    `SELECT table_name FROM embedding_dimensions WHERE dimension = $1`,
    [dim]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].table_name as string;
  }

  // Slow path: acquire advisory lock, then create table if still missing
  // Use dimension as lock key so different dimensions don't block each other
  const client = await pool.connect();
  try {
    const lockResult = await client.query(`SELECT pg_try_advisory_lock($1)`, [dim]);
    const gotLock = lockResult.rows[0].pg_try_advisory_lock as boolean;

    if (gotLock) {
      try {
        // Re-check under lock
        const recheck = await client.query(
          `SELECT table_name FROM embedding_dimensions WHERE dimension = $1`,
          [dim]
        );
        if (recheck.rows.length === 0) {
          // Table name is safe: validated as memory_embeddings_<positive int>
          await client.query(`
            CREATE TABLE IF NOT EXISTS ${name} (
              id BIGSERIAL PRIMARY KEY,
              agent_id BIGINT NOT NULL,
              cid TEXT NOT NULL,
              embedding vector(${dim}),
              metadata JSONB,
              created_at TIMESTAMPTZ DEFAULT NOW()
            )
          `);
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_${name}_embedding
              ON ${name} USING hnsw (embedding vector_cosine_ops)
          `);
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_${name}_agent_id
              ON ${name} (agent_id)
          `);
          await client.query(
            `INSERT INTO embedding_dimensions (dimension, table_name) VALUES ($1, $2)`,
            [dim, name]
          );
        }
      } finally {
        await client.query(`SELECT pg_advisory_unlock($1)`, [dim]);
      }
    } else {
      // Another process is creating this table — wait briefly and retry
      await new Promise((resolve) => setTimeout(resolve, 100));
      return ensureDimensionTable(dim);
    }
  } finally {
    client.release();
  }

  return name;
}

export async function insertEmbedding(
  agentId: bigint,
  cid: string,
  embedding: number[],
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!pool) throw new Error("Vector DB not initialized");

  const name = await ensureDimensionTable(embedding.length);
  const embeddingStr = `[${embedding.join(",")}]`;
  // name is safe (validated via tableName())
  await pool.query(
    `INSERT INTO ${name} (agent_id, cid, embedding, metadata)
     VALUES ($1, $2, $3::vector, $4)`,
    [agentId.toString(), cid, embeddingStr, metadata ? JSON.stringify(metadata) : null]
  );
}

export async function searchEmbeddings(
  agentId: bigint,
  queryEmbedding: number[],
  topK: number = 5
): Promise<Array<{ cid: string; score: number; metadata: Record<string, unknown> | null }>> {
  if (!pool) throw new Error("Vector DB not initialized");

  const dim = queryEmbedding.length;
  try {
    validateDimension(dim);
  } catch {
    return [];
  }

  // Check if dimension table exists without creating it
  const existing = await pool.query(
    `SELECT table_name FROM embedding_dimensions WHERE dimension = $1`,
    [dim]
  );
  if (existing.rows.length === 0) {
    return [];
  }

  const name = existing.rows[0].table_name as string;
  const embeddingStr = `[${queryEmbedding.join(",")}]`;
  // name comes from DB but was originally validated; re-validate for defense in depth
  if (!/^memory_embeddings_\d+$/.test(name)) {
    throw new Error(`Invalid table name in embedding_dimensions: ${name}`);
  }
  const result = await pool.query(
    `SELECT cid, metadata, 1 - (embedding <=> $1::vector) AS score
     FROM ${name}
     WHERE agent_id = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, agentId.toString(), topK]
  );

  return result.rows.map((row) => ({
    cid: row.cid as string,
    score: parseFloat(row.score as string),
    metadata: row.metadata as Record<string, unknown> | null,
  }));
}

export async function deleteEmbeddings(
  agentId: bigint,
  cid: string
): Promise<void> {
  if (!pool) throw new Error("Vector DB not initialized");

  const dims = await pool.query(`SELECT table_name FROM embedding_dimensions`);
  for (const row of dims.rows) {
    const name = row.table_name as string;
    if (!/^memory_embeddings_\d+$/.test(name)) continue;
    await pool.query(
      `DELETE FROM ${name} WHERE agent_id = $1 AND cid = $2`,
      [agentId.toString(), cid]
    );
  }
}

export async function stopVector(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
