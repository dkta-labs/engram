# Engram Agent Memory Pivot — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Evolve Engram from an encrypted blob store into a full agent memory API — with semantic search, temporal facts, multi-agent shared namespaces, and a cleaner developer experience.

**Architecture:** Add a SQLite metadata index alongside the existing blobstore. Embeddings are generated server-side (local model) and stored in a SQLite-vec virtual table for fast ANN search. Shared namespaces get their own wallet-signed membership list. Existing blob storage, x402 billing, and wallet auth are untouched.

**Tech Stack:** TypeScript, Express, SQLite (better-sqlite3), sqlite-vec, transformers.js (local embeddings, no external API), existing ethers/x402 stack.

**Repo:** `/home/hermes/engram` — monorepo, API at `packages/api/`

**New API surface (summary):**
- `POST /v1/memory` — store memory blob (existing, extended with tags + TTL)
- `POST /v1/memory/search` — semantic search over agent's memories (**new**, x402 gated)
- `GET /v1/memory/:hash` — retrieve blob (existing)
- `DELETE /v1/memory/:hash` — delete memory + index entry (**new**, x402 gated)
- `POST /v1/namespace` — create shared namespace (**new**, free)
- `POST /v1/namespace/:id/member` — add member wallet (**new**, sig gated)
- `POST /v1/namespace/:id/memory` — store into shared namespace (**new**, x402 gated)
- `POST /v1/namespace/:id/search` — search shared namespace (**new**, x402 gated)

**Pricing:**
- Store: $0.001 (unchanged)
- Search: $0.001 per query
- Delete: $0.0001
- Namespace create: free
- Namespace store: $0.001
- Namespace search: $0.001

---

## Phase 1: SQLite Metadata Index

### Task 1: Install dependencies

**Objective:** Add better-sqlite3 and sqlite-vec to the API package.

**Files:**
- Modify: `packages/api/package.json`

**Steps:**

```bash
cd /home/hermes/engram/packages/api
npm install better-sqlite3 sqlite-vec
npm install --save-dev @types/better-sqlite3
```

Verify: `node -e "require('better-sqlite3')"` exits 0.

**Commit:**
```bash
git add package.json package-lock.json
git commit -m "chore: add better-sqlite3 and sqlite-vec deps"
```

---

### Task 2: Create the SQLite database service

**Objective:** Initialize SQLite DB with sqlite-vec extension and a `memories` metadata table.

**Files:**
- Create: `packages/api/src/services/db.ts`
- Modify: `packages/api/src/config.ts` (add `dbPath`)

**Step 1: Add dbPath to config**

In `packages/api/src/config.ts`, add to the config object:
```typescript
dbPath: process.env.DB_PATH || "/data/engram.db",
```

**Step 2: Create `packages/api/src/services/db.ts`**

```typescript
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { config } from "../config.js";
import { mkdirSync } from "fs";
import { dirname } from "path";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  mkdirSync(dirname(config.dbPath), { recursive: true });
  _db = new Database(config.dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Load sqlite-vec extension
  sqliteVec.load(_db);

  // Memories metadata table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      hash        TEXT PRIMARY KEY,
      agent_addr  TEXT NOT NULL,
      type        TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]',
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER,
      deleted_at  INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_addr);
    CREATE INDEX IF NOT EXISTS idx_memories_expires ON memories(expires_at) WHERE expires_at IS NOT NULL;

    -- sqlite-vec virtual table for embeddings (384 dims = all-MiniLM-L6-v2)
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(
      hash TEXT PRIMARY KEY,
      embedding FLOAT[384]
    );

    CREATE TABLE IF NOT EXISTS namespaces (
      id          TEXT PRIMARY KEY,
      owner_addr  TEXT NOT NULL,
      name        TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS namespace_members (
      namespace_id  TEXT NOT NULL REFERENCES namespaces(id),
      member_addr   TEXT NOT NULL,
      added_at      INTEGER NOT NULL,
      PRIMARY KEY (namespace_id, member_addr)
    );

    CREATE TABLE IF NOT EXISTS namespace_memories (
      hash          TEXT NOT NULL,
      namespace_id  TEXT NOT NULL REFERENCES namespaces(id),
      agent_addr    TEXT NOT NULL,
      type          TEXT NOT NULL,
      tags          TEXT NOT NULL DEFAULT '[]',
      created_at    INTEGER NOT NULL,
      expires_at    INTEGER,
      PRIMARY KEY (hash, namespace_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS namespace_embeddings USING vec0(
      hash TEXT PRIMARY KEY,
      embedding FLOAT[384]
    );
  `);

  return _db;
}
```

**Step 3: Initialize DB on startup**

In `packages/api/src/index.ts`, add after imports:
```typescript
import { getDb } from "./services/db.js";
```
And in `start()`, before `app.listen`:
```typescript
getDb(); // initialize schema
console.log("Database initialized");
```

**Step 4: Build and verify**
```bash
cd /home/hermes/engram/packages/api
npm run build 2>&1 | grep -E "error|warning" | head -20
```
Expected: no TypeScript errors.

**Commit:**
```bash
git add src/services/db.ts src/config.ts src/index.ts
git commit -m "feat: add SQLite metadata + vec index service"
```

---

### Task 3: Create embedding service

**Objective:** Generate 384-dim sentence embeddings locally using transformers.js (no external API calls).

**Files:**
- Create: `packages/api/src/services/embeddings.ts`

**Step 1: Install transformers.js**
```bash
cd /home/hermes/engram/packages/api
npm install @xenova/transformers
```

**Step 2: Create `packages/api/src/services/embeddings.ts`**

```typescript
import { pipeline, env } from "@xenova/transformers";

// Cache model in /data/models to survive container restarts
env.cacheDir = process.env.MODEL_CACHE_DIR || "/data/models";
env.allowRemoteModels = true;

let _embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

async function getEmbedder() {
  if (!_embedder) {
    console.log("Loading embedding model (first run downloads ~90MB)...");
    _embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
    console.log("Embedding model ready.");
  }
  return _embedder;
}

export async function embed(text: string): Promise<Float32Array> {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return output.data as Float32Array;
}

// Warm up on startup (downloads model if needed)
export async function warmUp(): Promise<void> {
  await embed("warmup");
}
```

**Step 3: Warm up in startup**

In `packages/api/src/index.ts`, add:
```typescript
import { warmUp } from "./services/embeddings.js";
```
And in `start()`:
```typescript
await warmUp();
```

**Step 4: Build and verify**
```bash
npm run build 2>&1 | grep -E "^.*error" | head -10
```

**Commit:**
```bash
git add src/services/embeddings.ts src/index.ts package.json package-lock.json
git commit -m "feat: add local embedding service (all-MiniLM-L6-v2)"
```

---

## Phase 2: Extend Memory Routes

### Task 4: Extend POST /v1/memory to index metadata + embedding

**Objective:** When storing a memory blob, also write a metadata row and embedding to SQLite so it's searchable later.

**Files:**
- Modify: `packages/api/src/routes/memory.ts`

**Changes to `POST /` handler** — after `const hash = await blobstore.writeBlob(serialized);`, add:

```typescript
// Index metadata
const db = getDb();
const now = Math.floor(Date.now() / 1000);
const tags = Array.isArray(metadata?.tags) ? JSON.stringify(metadata.tags) : "[]";
const expiresAt = typeof metadata?.ttl === "number" ? now + metadata.ttl : null;

db.prepare(`
  INSERT OR REPLACE INTO memories (hash, agent_addr, type, tags, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(hash, agentAddress, type, tags, now, expiresAt);

// Generate and store embedding (best-effort — don't fail the whole request)
try {
  const textToEmbed = typeof data === "string"
    ? data
    : JSON.stringify(data);
  const embedding = await embed(textToEmbed.slice(0, 2000)); // cap input
  db.prepare(`
    INSERT OR REPLACE INTO memory_embeddings (hash, embedding)
    VALUES (?, ?)
  `).run(hash, Buffer.from(embedding.buffer));
} catch (embErr) {
  console.warn("Embedding failed (non-fatal):", embErr);
}
```

Add imports at top:
```typescript
import { getDb } from "../services/db.js";
import { embed } from "../services/embeddings.js";
```

**Build and verify:**
```bash
npm run build 2>&1 | grep error | head -10
```

**Commit:**
```bash
git add src/routes/memory.ts
git commit -m "feat: index memory metadata and embedding on store"
```

---

### Task 5: Add POST /v1/memory/search

**Objective:** New endpoint — embed the query, ANN search sqlite-vec, return ranked hashes + metadata.

**Files:**
- Modify: `packages/api/src/routes/memory.ts`

Add before `export default router;`:

```typescript
// POST /v1/memory/search — x402 gated, auth required
router.post("/search", agentAuth, async (req: Request, res: Response) => {
  try {
    const agentAddress = req.agentAddress!;
    const { query, limit = 10, tags } = req.body as {
      query: string;
      limit?: number;
      tags?: string[];
    };

    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "query (string) is required" });
      return;
    }

    const db = getDb();
    const queryEmbedding = await embed(query.slice(0, 2000));
    const k = Math.min(Math.max(1, limit), 50);

    // ANN search via sqlite-vec, scoped to this agent
    const rows = db.prepare(`
      SELECT e.hash, e.distance
      FROM memory_embeddings e
      JOIN memories m ON m.hash = e.hash
      WHERE m.agent_addr = ?
        AND m.deleted_at IS NULL
        AND (m.expires_at IS NULL OR m.expires_at > unixepoch())
        AND e.embedding MATCH ?
        AND k = ?
      ORDER BY e.distance
    `).all(agentAddress, Buffer.from(queryEmbedding.buffer), k) as Array<{hash: string; distance: number}>;

    // Tag filter (post-ANN)
    let results = rows;
    if (tags && tags.length > 0) {
      const metas = db.prepare(
        `SELECT hash, tags FROM memories WHERE hash IN (${rows.map(() => "?").join(",")})`
      ).all(...rows.map(r => r.hash)) as Array<{hash: string; tags: string}>;
      const tagMap = new Map(metas.map(m => [m.hash, JSON.parse(m.tags) as string[]]));
      results = rows.filter(r => {
        const memTags = tagMap.get(r.hash) || [];
        return tags.every(t => memTags.includes(t));
      });
    }

    // Fetch metadata for results
    if (results.length === 0) {
      res.json({ results: [] });
      return;
    }
    const metaRows = db.prepare(
      `SELECT hash, type, tags, created_at, expires_at FROM memories WHERE hash IN (${results.map(() => "?").join(",")})`
    ).all(...results.map(r => r.hash)) as Array<{hash: string; type: string; tags: string; created_at: number; expires_at: number | null}>;
    const metaMap = new Map(metaRows.map(m => [m.hash, m]));

    res.json({
      results: results.map(r => ({
        hash: r.hash,
        score: 1 - r.distance, // cosine similarity
        type: metaMap.get(r.hash)?.type,
        tags: JSON.parse(metaMap.get(r.hash)?.tags || "[]"),
        createdAt: metaMap.get(r.hash)?.created_at,
        expiresAt: metaMap.get(r.hash)?.expires_at ?? null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Search failed", details: String(err) });
  }
});
```

**Build and verify:**
```bash
npm run build 2>&1 | grep error | head -10
```

**Commit:**
```bash
git add src/routes/memory.ts
git commit -m "feat: add POST /v1/memory/search with ANN via sqlite-vec"
```

---

### Task 6: Add DELETE /v1/memory/:hash

**Objective:** Soft-delete a memory (marks deleted_at, removes embedding).

**Files:**
- Modify: `packages/api/src/routes/memory.ts`

Add before `export default router;`:

```typescript
// DELETE /v1/memory/:hash — x402 gated, auth required
router.delete("/:hash", agentAuth, async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;
    const agentAddress = req.agentAddress!;
    const db = getDb();

    const row = db.prepare("SELECT agent_addr FROM memories WHERE hash = ?").get(hash) as {agent_addr: string} | undefined;
    if (!row) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }
    if (row.agent_addr.toLowerCase() !== agentAddress.toLowerCase()) {
      res.status(403).json({ error: "Not your memory" });
      return;
    }

    db.prepare("UPDATE memories SET deleted_at = ? WHERE hash = ?")
      .run(Math.floor(Date.now() / 1000), hash);
    db.prepare("DELETE FROM memory_embeddings WHERE hash = ?").run(hash);

    res.json({ hash, deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Delete failed", details: String(err) });
  }
});
```

**Commit:**
```bash
git add src/routes/memory.ts
git commit -m "feat: add DELETE /v1/memory/:hash soft delete"
```

---

## Phase 3: Shared Namespaces

### Task 7: Create namespace routes file

**Objective:** New route file handling namespace CRUD and membership.

**Files:**
- Create: `packages/api/src/routes/namespace.ts`
- Modify: `packages/api/src/index.ts`

**Create `packages/api/src/routes/namespace.ts`:**

```typescript
import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { agentAuth } from "../middleware/auth.js";
import { getDb } from "../services/db.js";
import { embed } from "../services/embeddings.js";
import * as blobstore from "../services/blobstore.js";
import {
  deriveKey,
  encryptJson,
  serializeEncrypted,
} from "../services/crypto.js";

const router = Router();

// POST /v1/namespace — create namespace (free, auth required)
router.post("/", agentAuth, async (req: Request, res: Response) => {
  try {
    const agentAddress = req.agentAddress!;
    const { name } = req.body as { name: string };
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const id = randomUUID();
    const db = getDb();
    db.prepare(`
      INSERT INTO namespaces (id, owner_addr, name, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, agentAddress, name, Math.floor(Date.now() / 1000));

    // Owner is automatically a member
    db.prepare(`
      INSERT INTO namespace_members (namespace_id, member_addr, added_at)
      VALUES (?, ?, ?)
    `).run(id, agentAddress, Math.floor(Date.now() / 1000));

    res.json({ id, name, owner: agentAddress });
  } catch (err) {
    res.status(500).json({ error: "Failed to create namespace", details: String(err) });
  }
});

// POST /v1/namespace/:id/member — add member (owner only, sig gated)
router.post("/:id/member", agentAuth, async (req: Request, res: Response) => {
  try {
    const agentAddress = req.agentAddress!;
    const { id } = req.params;
    const { memberAddress } = req.body as { memberAddress: string };

    if (!memberAddress) {
      res.status(400).json({ error: "memberAddress is required" });
      return;
    }

    const db = getDb();
    const ns = db.prepare("SELECT owner_addr FROM namespaces WHERE id = ?").get(id) as {owner_addr: string} | undefined;
    if (!ns) {
      res.status(404).json({ error: "Namespace not found" });
      return;
    }
    if (ns.owner_addr.toLowerCase() !== agentAddress.toLowerCase()) {
      res.status(403).json({ error: "Only the namespace owner can add members" });
      return;
    }

    db.prepare(`
      INSERT OR IGNORE INTO namespace_members (namespace_id, member_addr, added_at)
      VALUES (?, ?, ?)
    `).run(id, memberAddress.toLowerCase(), Math.floor(Date.now() / 1000));

    res.json({ namespaceId: id, memberAddress, added: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to add member", details: String(err) });
  }
});

// Helper: check membership
function isMember(db: ReturnType<typeof getDb>, namespaceId: string, addr: string): boolean {
  const row = db.prepare(
    "SELECT 1 FROM namespace_members WHERE namespace_id = ? AND LOWER(member_addr) = LOWER(?)"
  ).get(namespaceId, addr);
  return !!row;
}

// POST /v1/namespace/:id/memory — store into namespace (x402, member only)
router.post("/:id/memory", agentAuth, async (req: Request, res: Response) => {
  try {
    const agentAddress = req.agentAddress!;
    const { id } = req.params;
    const db = getDb();

    if (!isMember(db, id, agentAddress)) {
      res.status(403).json({ error: "Not a namespace member" });
      return;
    }

    const { type, data, metadata } = req.body as {
      type: "blob" | "kv" | "text";
      data: unknown;
      metadata?: Record<string, unknown>;
    };

    if (!type || !data) {
      res.status(400).json({ error: "type and data are required" });
      return;
    }

    const keyDeriveSig = req.headers["x-derive-sig"] as string | undefined;
    if (!keyDeriveSig) {
      res.status(400).json({ error: "X-Derive-Sig header required" });
      return;
    }

    const key = await deriveKey(agentAddress, keyDeriveSig);
    const payload = { type, data, metadata: metadata || null };
    const encrypted = encryptJson(payload, key);
    const serialized = serializeEncrypted(encrypted);
    const hash = await blobstore.writeBlob(serialized);

    const now = Math.floor(Date.now() / 1000);
    const tags = Array.isArray(metadata?.tags) ? JSON.stringify(metadata.tags) : "[]";
    const expiresAt = typeof metadata?.ttl === "number" ? now + metadata.ttl : null;

    db.prepare(`
      INSERT OR REPLACE INTO namespace_memories (hash, namespace_id, agent_addr, type, tags, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(hash, id, agentAddress, type, tags, now, expiresAt);

    try {
      const textToEmbed = typeof data === "string" ? data : JSON.stringify(data);
      const embedding = await embed(textToEmbed.slice(0, 2000));
      // Use namespace_embeddings — store as namespace:hash composite key
      const vecKey = `${id}::${hash}`;
      db.prepare(`INSERT OR REPLACE INTO namespace_embeddings (hash, embedding) VALUES (?, ?)`)
        .run(vecKey, Buffer.from(embedding.buffer));
    } catch (embErr) {
      console.warn("Namespace embedding failed (non-fatal):", embErr);
    }

    res.json({ hash, type, namespaceId: id });
  } catch (err) {
    res.status(500).json({ error: "Failed to store memory", details: String(err) });
  }
});

// POST /v1/namespace/:id/search — search namespace (x402, member only)
router.post("/:id/search", agentAuth, async (req: Request, res: Response) => {
  try {
    const agentAddress = req.agentAddress!;
    const { id } = req.params;
    const db = getDb();

    if (!isMember(db, id, agentAddress)) {
      res.status(403).json({ error: "Not a namespace member" });
      return;
    }

    const { query, limit = 10 } = req.body as { query: string; limit?: number };
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }

    const k = Math.min(Math.max(1, limit), 50);
    const queryEmbedding = await embed(query.slice(0, 2000));

    // Fetch all namespace vec keys, then ANN
    const rows = db.prepare(`
      SELECT hash, distance
      FROM namespace_embeddings
      WHERE embedding MATCH ?
        AND k = ?
      ORDER BY distance
    `).all(Buffer.from(queryEmbedding.buffer), k) as Array<{hash: string; distance: number}>;

    // Filter to this namespace and non-expired
    const now = Math.floor(Date.now() / 1000);
    const nsRows = rows
      .filter(r => r.hash.startsWith(`${id}::`))
      .map(r => ({ ...r, realHash: r.hash.slice(id.length + 2) }));

    const metaRows = db.prepare(
      `SELECT hash, agent_addr, type, tags, created_at, expires_at FROM namespace_memories
       WHERE namespace_id = ? AND hash IN (${nsRows.map(() => "?").join(",") || "''"})
       AND (expires_at IS NULL OR expires_at > ?)`.replace("IN ('')", "IN (SELECT NULL WHERE 0)")
    ).all(id, ...nsRows.map(r => r.realHash), now) as Array<{hash: string; agent_addr: string; type: string; tags: string; created_at: number; expires_at: number | null}>;

    const metaMap = new Map(metaRows.map(m => [m.hash, m]));

    res.json({
      results: nsRows
        .filter(r => metaMap.has(r.realHash))
        .map(r => ({
          hash: r.realHash,
          score: 1 - r.distance,
          storedBy: metaMap.get(r.realHash)?.agent_addr,
          type: metaMap.get(r.realHash)?.type,
          tags: JSON.parse(metaMap.get(r.realHash)?.tags || "[]"),
          createdAt: metaMap.get(r.realHash)?.created_at,
        })),
    });
  } catch (err) {
    res.status(500).json({ error: "Search failed", details: String(err) });
  }
});

export default router;
```

**Register in `packages/api/src/index.ts`:**
```typescript
import namespaceRoutes from "./routes/namespace.js";
// ...
app.use("/v1/namespace", namespaceRoutes);
```

**Build and verify:**
```bash
npm run build 2>&1 | grep error | head -10
```

**Commit:**
```bash
git add src/routes/namespace.ts src/index.ts
git commit -m "feat: add shared namespace routes (create, member, store, search)"
```

---

## Phase 4: Update Pricing + x402 Config

### Task 8: Wire x402 pricing for new endpoints

**Objective:** Ensure search ($0.001), delete ($0.0001), and namespace store/search ($0.001) are properly x402-gated.

**Files:**
- Modify: `packages/api/src/middleware/payment.ts`

Read the current payment middleware first:
```bash
cat packages/api/src/middleware/payment.ts
```

Add route entries for new endpoints following the same pattern as existing ones:
- `POST /v1/memory/search` → `$0.001`
- `DELETE /v1/memory/:hash` → `$0.0001`
- `POST /v1/namespace/:id/memory` → `$0.001`
- `POST /v1/namespace/:id/search` → `$0.001`

**Build and verify:**
```bash
npm run build 2>&1 | grep error | head -10
```

**Commit:**
```bash
git add src/middleware/payment.ts
git commit -m "feat: add x402 pricing for search, delete, namespace endpoints"
```

---

## Phase 5: Update SDK + Docs

### Task 9: Update the README API reference table

**Objective:** Document all new endpoints in README.md.

**Files:**
- Modify: `README.md`

Replace the API Reference table with:

| Method | Route | Price | Auth | Description |
|--------|-------|-------|------|-------------|
| POST | /v1/agent/register | free | sig | Register agent wallet |
| GET | /v1/agent/:agentId | free | — | Get agent info |
| GET | /v1/agent/:agentId/index | $0.0001 | sig | Get memory index |
| PUT | /v1/agent/:agentId/index | $0.0005 | sig | Update memory index |
| POST | /v1/memory | $0.001 | sig | Store encrypted memory |
| GET | /v1/memory/:hash | $0.0001 | sig | Retrieve memory |
| POST | /v1/memory/search | $0.001 | sig | Semantic search your memories |
| DELETE | /v1/memory/:hash | $0.0001 | sig | Delete a memory |
| POST | /v1/namespace | free | sig | Create shared namespace |
| POST | /v1/namespace/:id/member | free | sig (owner) | Add member to namespace |
| POST | /v1/namespace/:id/memory | $0.001 | sig | Store into shared namespace |
| POST | /v1/namespace/:id/search | $0.001 | sig | Search shared namespace |
| GET | /v1/health | free | — | Service status |

Add a **Semantic Search** section to README with example:
```typescript
// Search your memories
const results = await client.search("user preferences for dark mode", { limit: 5 });
// returns: [{ hash, score, type, tags, createdAt }]

// Retrieve top result
const { data } = await client.retrieve(results[0].hash);
```

**Commit:**
```bash
git add README.md
git commit -m "docs: update API reference with search, delete, namespace endpoints"
```

---

## Phase 6: Deploy

### Task 10: Update Dockerfile and deploy

**Objective:** Ensure the new deps and DB path are in the Docker image, redeploy on VPS.

**Files:**
- Check: `packages/api/Dockerfile`
- Modify if needed: ensure `/data/models` volume is mounted for embedding model cache

**Steps:**

1. Check current Dockerfile:
```bash
cat packages/api/Dockerfile
```

2. Ensure `/data/models` is in the volumes (alongside existing `/data/blobs` and `/data/engram.db`).

3. Build and push:
```bash
cd /home/hermes/engram
git push origin main
```

4. On VPS (via terminal):
```bash
cd /opt/engram  # or wherever it's deployed
docker compose pull
docker compose up -d
docker compose logs -f api | head -30
```

Expected logs:
```
Initializing services...
Loading embedding model (first run downloads ~90MB)...
Embedding model ready.
Database initialized
Engram API listening on port 3000
```

5. Smoke test:
```bash
curl https://engram.dkta.dev/v1/health
```
Expected: `{"status":"ok",...}`

**Commit:**
```bash
git add packages/api/Dockerfile docker-compose.yml
git commit -m "chore: add model cache volume for embeddings"
```

---

## Completion Checklist

- [ ] Task 1: Dependencies installed
- [ ] Task 2: SQLite + sqlite-vec schema live
- [ ] Task 3: Embedding service warm on startup
- [ ] Task 4: Store endpoint indexes metadata + embedding
- [ ] Task 5: `/v1/memory/search` returns ranked results
- [ ] Task 6: DELETE endpoint soft-deletes
- [ ] Task 7: Namespace routes (create, member, store, search)
- [ ] Task 8: x402 pricing wired for all new endpoints
- [ ] Task 9: README updated
- [ ] Task 10: Deployed and smoke-tested

**Done when:** `POST /v1/memory/search` returns semantically relevant results for a query against stored memories, and `POST /v1/namespace/:id/search` returns results across multiple agents' contributions to a shared namespace.
