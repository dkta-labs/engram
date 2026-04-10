# Engram — Full Project Build

Build the complete Engram project at /home/hermes/engram/. This is a production-quality decentralized encrypted memory API for AI agents.

## What to build

### Stack
- TypeScript throughout
- Express.js API server
- x402-express for payment gating
- Helia (IPFS node, in-process) + Pinata SDK for pinning
- Wallet-signature-derived AES-256-GCM encryption (no Lit Protocol)
- pgvector via pg driver for semantic/vector search
- ethers.js v6 for wallet operations
- Hardhat + OpenZeppelin for smart contracts
- Docker + docker-compose for deployment

### Project Structure

```
/home/hermes/engram/
├── packages/
│   ├── contracts/          # Hardhat project
│   │   ├── contracts/
│   │   │   └── AgentRegistry.sol
│   │   ├── scripts/
│   │   │   └── deploy.ts
│   │   ├── test/
│   │   │   └── AgentRegistry.test.ts
│   │   ├── hardhat.config.ts
│   │   └── package.json
│   ├── api/                # Express API server
│   │   ├── src/
│   │   │   ├── index.ts           # entry point
│   │   │   ├── routes/
│   │   │   │   ├── agent.ts       # /v1/agent routes
│   │   │   │   └── memory.ts      # /v1/memory routes
│   │   │   ├── services/
│   │   │   │   ├── crypto.ts      # AES-256-GCM from wallet sig
│   │   │   │   ├── ipfs.ts        # Helia + Pinata
│   │   │   │   ├── vector.ts      # pgvector semantic search
│   │   │   │   └── registry.ts    # AgentRegistry contract calls
│   │   │   ├── middleware/
│   │   │   │   ├── payment.ts     # x402 middleware config
│   │   │   │   └── auth.ts        # agent wallet verification
│   │   │   └── config.ts          # env + constants
│   │   ├── Dockerfile
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── sdk/                # npm SDK for consumers
│       ├── src/
│       │   ├── index.ts           # main export
│       │   ├── client.ts          # EngramClient class
│       │   ├── crypto.ts          # matching client-side crypto
│       │   └── types.ts           # shared types
│       ├── tsconfig.json
│       └── package.json
├── docker-compose.yml      # api + postgres (with pgvector)
├── .env.example
├── .gitignore
├── README.md
└── package.json            # workspace root
```

---

## Detailed Specs

### AgentRegistry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    uint256 private _nextId = 1;

    mapping(address => uint256) public agentIds;
    mapping(uint256 => address) public agentOwners;
    mapping(uint256 => string) public memoryIndex; // agentId -> CID of index doc

    event AgentRegistered(uint256 indexed agentId, address indexed owner);
    event IndexUpdated(uint256 indexed agentId, string cid);

    function register() external returns (uint256) {
        require(agentIds[msg.sender] == 0, "Already registered");
        uint256 id = _nextId++;
        agentIds[msg.sender] = id;
        agentOwners[id] = msg.sender;
        emit AgentRegistered(id, msg.sender);
        return id;
    }

    function updateIndex(uint256 agentId, string calldata cid) external {
        require(agentOwners[agentId] == msg.sender, "Not owner");
        memoryIndex[agentId] = cid;
        emit IndexUpdated(agentId, cid);
    }

    function getAgentId(address owner) external view returns (uint256) {
        return agentIds[owner];
    }

    function getIndex(uint256 agentId) external view returns (string memory) {
        return memoryIndex[agentId];
    }
}
```

### Encryption Design (crypto.ts)

The agent proves ownership by signing a deterministic message with their private key. We derive an AES-256-GCM key from that signature using HKDF-SHA256. No external key management.

```
deriveKey(agentAddress, signature) -> CryptoKey (AES-256-GCM)
encrypt(plaintext: Buffer, key: CryptoKey) -> { ciphertext: Buffer, iv: Buffer, tag: Buffer }
decrypt(ciphertext: Buffer, iv: Buffer, tag: Buffer, key: CryptoKey) -> Buffer
```

The signature the agent provides is over: `keccak256("engram:derive-key:v1:" + agentAddress.toLowerCase())`

This is deterministic - the same wallet always derives the same key. The agent re-signs to retrieve.

For the API side: the agent sends their wallet address + signature in the request. We verify the sig, derive the key server-side, encrypt before IPFS write, decrypt before returning.

Important: we never store the key or signature. Derive, use, discard.

### API Routes

#### POST /v1/agent/register
- Free (no x402)
- Body: `{ address: string, signature: string }`
- Verify: signature is over `keccak256("engram:register:v1:" + address.toLowerCase())`
- Call AgentRegistry.register() on behalf of agent (server pays gas)
- Returns: `{ agentId: number, address: string }`

#### GET /v1/agent/:agentId
- Free
- Returns: `{ agentId, owner, indexCid }`

#### GET /v1/agent/:agentId/index  
- x402 gated: $0.0001
- Agent must provide auth header: `X-Agent-Sig: <sig over keccak256("engram:auth:v1:" + agentId + ":" + timestamp)>`
- Returns decrypted index document (list of CID entries with metadata)

#### PUT /v1/agent/:agentId/index
- x402 gated: $0.0005
- Requires X-Agent-Sig
- Body: `{ indexDoc: object }` (the new index state)
- Encrypt indexDoc, write to IPFS, call contract updateIndex
- Returns: `{ cid: string, txHash: string }`

#### POST /v1/memory
- x402 gated: $0.001
- Requires X-Agent-Sig
- Body: `{ agentId: number, type: 'blob' | 'kv' | 'text', data: any, metadata?: object }`
- Encrypt data, write to IPFS via Helia, pin to Pinata
- If type=text, also embed and store in pgvector
- Returns: `{ cid: string, type: string }`

#### GET /v1/memory/:cid
- x402 gated: $0.0001  
- Requires X-Agent-Sig
- Fetch from IPFS, decrypt, return
- Returns: `{ cid, data, metadata, type }`

#### POST /v1/memory/search
- x402 gated: $0.005
- Requires X-Agent-Sig
- Body: `{ agentId: number, query: string, topK?: number (default 5) }`
- Embed query with OpenAI text-embedding-3-small
- pgvector cosine similarity search filtered by agentId
- Return top-k CIDs with scores (don't decrypt here - let client fetch individually)
- Returns: `{ results: [{ cid, score, metadata }] }`

#### GET /v1/health
- Free, no auth
- Returns: `{ status: 'ok', version, network, contractAddress }`

### X-Agent-Sig Auth Middleware

For all authenticated routes, before x402 check:
1. Parse `X-Agent-Sig` header: `{ sig: string, agentId: number, timestamp: number }`
2. Reject if timestamp > 5 minutes old (replay protection)
3. Verify sig is over `keccak256("engram:auth:v1:" + agentId + ":" + timestamp)`
4. Look up agentOwners[agentId] from contract, verify matches recovered address
5. Attach `req.agentId` and `req.agentAddress` for downstream handlers

### x402 Payment Config

```typescript
paymentMiddleware(
  process.env.PAYMENT_ADDRESS,  // Dakota's wallet
  {
    '/v1/memory': { price: '$0.001', network: 'base-sepolia', config: { description: 'Store encrypted memory on IPFS' } },
    '/v1/memory/*': { price: '$0.0001', network: 'base-sepolia', config: { description: 'Retrieve encrypted memory' } },
    '/v1/memory/search': { price: '$0.005', network: 'base-sepolia', config: { description: 'Semantic memory search' } },
    '/v1/agent/*/index': { price: '$0.0001', network: 'base-sepolia', config: { description: 'Read memory index' } },
    '/v1/agent/*/index PUT': { price: '$0.0005', network: 'base-sepolia', config: { description: 'Update memory index' } },
  },
  { url: 'https://facilitator.coinbase.com' }
)
```

### pgvector Setup

Schema:
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE memory_embeddings (
  id BIGSERIAL PRIMARY KEY,
  agent_id BIGINT NOT NULL,
  cid TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-3-small
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON memory_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON memory_embeddings (agent_id);
```

### SDK (EngramClient)

```typescript
import { EngramClient } from 'engram-sdk'

const client = new EngramClient({
  privateKey: '0x...',      // agent's wallet private key
  network: 'base-sepolia',  // or 'base'
  apiUrl: 'https://engram.dkta.dev',
})

// Register (once)
const { agentId } = await client.register()

// Store
const { cid } = await client.store({
  type: 'kv',
  data: { preference: 'dark mode', language: 'en' },
  metadata: { tags: ['preferences'] }
})

// Retrieve
const { data } = await client.retrieve(cid)

// Semantic search
const { results } = await client.search('what are the user preferences?')

// Update index
await client.updateIndex()  // automatically manages the index CID
```

The SDK handles:
- Signing auth headers automatically
- x402-fetch payment (agent needs USDC on Base)
- Deriving encryption key from wallet signature
- Client-side encrypt before sending (double encryption for belt-and-suspenders)

Actually for simplicity: encryption is server-side only (agent sends plaintext, server encrypts before IPFS). The auth sig proves ownership. This keeps the SDK lightweight.

### docker-compose.yml

```yaml
version: '3.9'
services:
  api:
    build: ./packages/api
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: engram
      POSTGRES_USER: engram
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U engram"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
```

### .env.example

```
# Server wallet (receives no payments - just for gas)
SERVER_PRIVATE_KEY=0x...

# Payment destination (Dakota's wallet)
PAYMENT_ADDRESS=0x...

# Network
NETWORK=base-sepolia
CONTRACT_ADDRESS=0x...  # filled after deploy

# Pinata
PINATA_JWT=...
PINATA_GATEWAY=gateway.pinata.cloud

# Database
POSTGRES_PASSWORD=...
DATABASE_URL=postgresql://engram:${POSTGRES_PASSWORD}@postgres:5432/engram

# OpenAI (for embeddings)
OPENAI_API_KEY=...

# Optional: RPC override
BASE_SEPOLIA_RPC=https://sepolia.base.org
```

### README.md

Write a complete README with:
- What Engram is (one paragraph)
- Architecture diagram (ASCII)
- API reference table (all endpoints, price, auth required)
- Quick start for agent developers (npm install engram-sdk, 10 lines of code)
- Self-hosting instructions (docker-compose up)
- Contributing section

---

## Constraints

- TypeScript strict mode everywhere
- No Lit Protocol - crypto.ts is the encryption layer
- Hardhat for contracts, not Foundry
- Use ethers v6 (not v5) - import from 'ethers' not 'ethers/lib/...'
- pgvector/pgvector:pg16 Docker image
- Helia v4+ (createHelia from 'helia', not go-ipfs or ipfs-core)
- x402-express from npm (it exists, install it)
- All route handlers must be async with proper try/catch returning JSON errors
- DO NOT add authentication beyond what's specified - no JWT, no sessions, no API keys
- DO NOT add a web UI or admin panel
- DO NOT install unnecessary dependencies

## Do NOT do

- Do not create a frontend
- Do not use Lit Protocol
- Do not use ethers v5
- Do not use ipfs-core or go-ipfs (use helia)
- Do not add database migrations tooling (just run the SQL on startup)
- Do not add rate limiting (x402 pricing handles that economically)
