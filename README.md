# Engram

Decentralized encrypted memory for AI agents.

**engram.dkta.dev** — pay per operation with USDC on Base, no accounts, no API keys.

## What it is

Engram is an HTTP API that lets any AI agent store and retrieve encrypted memory blobs on IPFS, gated by [x402](https://x402.org) micropayments. Agents pay fractions of a cent per operation using USDC on Base — no sign-up, no subscriptions, no human in the loop.

```
Agent → POST /v1/memory → Encrypt → IPFS → Pin → CID returned
Agent → GET /v1/memory/:cid → Fetch → Decrypt → Plaintext returned
Agent → POST /v1/memory/search → Embed → pgvector → ranked CIDs returned
```

All memory is encrypted with AES-256-GCM. The key is derived from the agent's wallet signature — no key escrow, no third-party key manager.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Agent (any LLM)                    │
│         wallet: 0xABCD  |  USDC on Base Sepolia      │
└────────────────────┬────────────────────────────────┘
                     │ HTTP + x402 payment header
                     ▼
┌─────────────────────────────────────────────────────┐
│              engram.dkta.dev (Express API)            │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ x402 mw  │  │ auth mw  │  │    route handlers  │ │
│  │(payment) │→ │(sig verify│→ │ store/retrieve/    │ │
│  └──────────┘  └──────────┘  │ search/index       │ │
│                               └────────┬───────────┘ │
│                                        │              │
│  ┌──────────────────────────────────────────────────┐│
│  │                   Services                        ││
│  │  crypto.ts    ipfs.ts    vector.ts  registry.ts  ││
│  │  (AES-256)  (Helia+Pin) (pgvector) (Base chain)  ││
│  └──────────────────────────────────────────────────┘│
└──────────────┬──────────────────┬────────────────────┘
               │                  │
       ┌───────▼──────┐  ┌────────▼────────┐
       │  IPFS Network │  │  Base Sepolia   │
       │  (Pinata pin) │  │  AgentRegistry  │
       └──────────────┘  └─────────────────┘
               │
       ┌───────▼──────┐
       │  PostgreSQL  │
       │  + pgvector  │
       └──────────────┘
```

## API Reference

All authenticated routes require `X-Agent-Sig` header. All paid routes require x402 payment (USDC on Base Sepolia / Base mainnet).

| Method | Route | Price | Auth | Description |
|--------|-------|-------|------|-------------|
| POST | /v1/agent/register | free | sig | Register agent wallet, get agentId |
| GET | /v1/agent/:agentId | free | — | Get agent info + index CID |
| GET | /v1/agent/:agentId/index | $0.0001 | sig | Get decrypted memory index |
| PUT | /v1/agent/:agentId/index | $0.0005 | sig | Update memory index |
| POST | /v1/memory | $0.001 | sig | Store encrypted memory blob |
| GET | /v1/memory/:cid | $0.0001 | sig | Retrieve + decrypt memory |
| POST | /v1/memory/search | $0.005 | sig | Semantic search (returns CIDs) |
| GET | /v1/health | free | — | Service status |

### X-Agent-Sig header format

```json
{
  "sig": "0x...",
  "agentId": 42,
  "timestamp": 1714857600
}
```

The signature is over: `keccak256("engram:auth:v1:" + agentId + ":" + timestamp)`

Valid for 5 minutes. Prevents replay attacks.

## Quick Start (SDK)

```bash
npm install engram-sdk
```

```typescript
import { EngramClient } from 'engram-sdk'

const client = new EngramClient({
  privateKey: '0x...',         // agent's wallet private key
  network: 'base-sepolia',     // testnet
  apiUrl: 'https://engram.dkta.dev',
})

// Register once
const { agentId } = await client.register()
console.log('Agent ID:', agentId)

// Store a key/value memory
const { cid } = await client.store({
  type: 'kv',
  data: { userName: 'Alice', preference: 'dark mode' },
  metadata: { tags: ['preferences'] },
})
console.log('Stored at CID:', cid)

// Retrieve it
const { data } = await client.retrieve(cid)
console.log('Retrieved:', data)

// Store text for semantic search
await client.store({
  type: 'text',
  data: 'The user prefers concise responses and dislikes jargon.',
  metadata: { category: 'personality' },
})

// Search semantically
const { results } = await client.search('user communication style', { topK: 3 })
console.log('Top matches:', results)
```

**Your agent needs USDC on Base Sepolia to pay for operations.** Get testnet USDC from the [Circle faucet](https://faucet.circle.com/).

## Self-Hosting

```bash
git clone https://github.com/dsr-restyn/engram
cd engram
cp .env.example .env
# Fill in .env: SERVER_PRIVATE_KEY, PAYMENT_ADDRESS, PINATA_JWT, OPENAI_API_KEY

# Deploy contracts first
cd packages/contracts
npm install
npx hardhat run scripts/deploy.ts --network base-sepolia
# Copy CONTRACT_ADDRESS to .env

# Run
cd ../..
docker-compose up -d
```

## Project Structure

```
packages/
  contracts/    Hardhat project — AgentRegistry.sol
  api/          Express API server
  sdk/          TypeScript SDK for agent consumers
```

## Contributing

PRs welcome. Open an issue first for anything non-trivial.

## License

MIT
