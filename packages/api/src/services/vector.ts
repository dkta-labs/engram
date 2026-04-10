import { Pool } from "pg";
import { config } from "../config.js";

let pool: Pool | null = null;

const INIT_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_embeddings (
  id BIGSERIAL PRIMARY KEY,
  agent_id BIGINT NOT NULL,
  cid TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_embedding
  ON memory_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_agent_id
  ON memory_embeddings (agent_id);
`;

export async function initVector(): Promise<void> {
  pool = new Pool({ connectionString: config.databaseUrl });
  await pool.query(INIT_SQL);
  console.log("pgvector initialized");
}

export async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embedding failed: ${res.status} ${body}`);
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

export async function storeEmbedding(
  agentId: number,
  cid: string,
  embedding: number[],
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!pool) throw new Error("Vector DB not initialized");

  const embeddingStr = `[${embedding.join(",")}]`;
  await pool.query(
    `INSERT INTO memory_embeddings (agent_id, cid, embedding, metadata)
     VALUES ($1, $2, $3::vector, $4)`,
    [agentId, cid, embeddingStr, metadata ? JSON.stringify(metadata) : null]
  );
}

export async function searchSimilar(
  agentId: number,
  queryEmbedding: number[],
  topK: number = 5
): Promise<Array<{ cid: string; score: number; metadata: Record<string, unknown> | null }>> {
  if (!pool) throw new Error("Vector DB not initialized");

  const embeddingStr = `[${queryEmbedding.join(",")}]`;
  const result = await pool.query(
    `SELECT cid, metadata, 1 - (embedding <=> $1::vector) AS score
     FROM memory_embeddings
     WHERE agent_id = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, agentId, topK]
  );

  return result.rows.map((row) => ({
    cid: row.cid as string,
    score: parseFloat(row.score as string),
    metadata: row.metadata as Record<string, unknown> | null,
  }));
}

export async function stopVector(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
