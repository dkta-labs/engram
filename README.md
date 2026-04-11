# Engram

Encrypted persistent memory for AI agents. Wallet-as-identity, pay-per-operation with USDC on Base.

**engram.dkta.dev** — no accounts, no API keys. Just a wallet.

## Quick Start

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

// Store a memory
const { hash } = await client.store({
  type: 'kv',
  data: { userName: 'Alice', preference: 'dark mode' },
  metadata: { tags: ['preferences'] },
})

// Retrieve it
const { data } = await client.retrieve(hash)
```

Your agent needs USDC on Base Sepolia to pay for operations. Get testnet USDC from the [Circle faucet](https://faucet.circle.com/).

## How It Works

Your agent's wallet **is** its identity. No sign-up, no API keys, no OAuth.

1. Agent signs a message with its private key to prove wallet ownership
2. An AES-256-GCM encryption key is derived from that signature via HKDF-SHA256
3. Data is encrypted and stored as content-addressed blobs (SHA-256 hash = address)
4. Agent registration is recorded on-chain via a lightweight smart contract on Base
5. Each paid operation uses [x402](https://x402.org) micropayments — USDC on Base, fractions of a cent

The server never stores keys or signatures. Derive, use, discard.

## API Reference

All authenticated routes require `X-Agent-Sig` header. Paid routes require x402 payment (USDC on Base Sepolia).

| Method | Route | Price | Auth | Description |
|--------|-------|-------|------|-------------|
| POST | /v1/agent/register | free | sig | Register agent wallet, get agentId |
| GET | /v1/agent/:agentId | free | — | Get agent info |
| GET | /v1/agent/:agentId/index | $0.0001 | sig | Get decrypted memory index |
| PUT | /v1/agent/:agentId/index | $0.0005 | sig | Update memory index |
| POST | /v1/memory | $0.001 | sig | Store encrypted memory |
| GET | /v1/memory/:hash | $0.0001 | sig | Retrieve + decrypt memory |
| GET | /v1/health | free | — | Service status |

### Authentication

The `X-Agent-Sig` header is a JSON object:

```json
{
  "sig": "0x...",
  "agentId": 42,
  "timestamp": 1714857600
}
```

Signature is over `keccak256("engram:auth:v1:" + agentId + ":" + timestamp)`. Valid for 5 minutes.

## Architecture

```
Agent (wallet)
    │
    │  HTTP + x402 payment
    ▼
engram.dkta.dev
    │
    ├── x402 middleware (payment verification)
    ├── auth middleware (wallet signature verification)
    ├── crypto service (AES-256-GCM encrypt/decrypt)
    ├── blobstore (SHA-256 content-addressed file storage)
    └── registry service (Base on-chain AgentRegistry contract)
```

## Self-Hosting

```bash
git clone https://github.com/dsr-restyn/engram
cd engram
cp .env.example .env
# Fill in: SERVER_PRIVATE_KEY, PAYMENT_ADDRESS, CONTRACT_ADDRESS

# Deploy contract
cd packages/contracts
npm install
npx hardhat run scripts/deploy.ts --network base-sepolia
# Copy CONTRACT_ADDRESS to .env

# Run
cd ../..
docker-compose up -d
```

## License

MIT
