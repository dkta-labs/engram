# engram-sdk

TypeScript SDK for [Engram](https://engram.dkta.dev) — encrypted agent memory with crypto payments.

Engram gives AI agents persistent, encrypted memory with on-chain indexing and [x402](https://x402.org) micropayments on Base Sepolia.

> **Testnet only** — this SDK currently targets Base Sepolia. Mainnet support is coming soon.

## Requirements

- **Node.js >= 18** (uses `node:crypto` and `Buffer` — not browser-compatible)
- An Ethereum private key for agent identity and encryption

## Install

```bash
npm install engram-sdk
```

## Quick start

```typescript
import { EngramClient } from 'engram-sdk';

const client = new EngramClient({
  apiUrl: 'https://engram.dkta.dev',
  privateKey: process.env.AGENT_PRIVATE_KEY!,
});

// Register your agent (free, one-time)
const { agentId } = await client.register();

// Store a memory ($0.001)
const hash = await client.store({ type: 'text', data: 'remember this' });

// Retrieve it ($0.0001)
const memory = await client.retrieve(hash);
console.log(memory.data); // "remember this"
```

## API Reference

### `new EngramClient(config)`

Create a new client instance.

```typescript
const client = new EngramClient({
  apiUrl: 'https://engram.dkta.dev',  // Engram API URL
  privateKey: '0x...',                 // Agent wallet private key
  network: 'base-sepolia',            // Optional, defaults to 'base-sepolia'
});
```

The private key is used to:
- Sign authentication headers for every API request
- Derive the AES-256-GCM encryption key (all data is encrypted client-side before upload)
- Sign x402 payment transactions automatically

### `client.register()`

Register a new agent on-chain. Free, only needs to be called once per wallet.

```typescript
const { agentId, address, txHash } = await client.register();
```

### `client.setAgentId(agentId)`

Set the agent ID for an already-registered agent (skips the registration call).

```typescript
client.setAgentId(42);
```

### `client.store(request)`

Store an encrypted memory blob. Returns the content hash.

**Cost:** $0.001 per call (x402, paid automatically)

```typescript
const hash = await client.store({
  type: 'text',               // 'text' | 'blob' | 'kv'
  data: 'remember this',
  metadata: { tag: 'important' },  // optional
});
```

### `client.retrieve(hash)`

Retrieve and decrypt a memory blob by its hash.

**Cost:** $0.0001 per call

```typescript
const memory = await client.retrieve(hash);
// { hash, type, data, metadata }
```

### `client.setIndex(indexDoc)`

Replace the agent's memory index with a new document.

**Cost:** $0.0005 per call

```typescript
await client.setIndex({
  memories: [hash1, hash2],
  updated: Date.now(),
});
```

### `client.getIndex()`

Read the agent's current memory index. Returns `null` if no index has been set.

**Cost:** $0.0001 per call

```typescript
const index = await client.getIndex();
```

### `client.appendToIndex(hash)`

Convenience method: reads the current index, appends a hash to the `memories` array, and writes it back.

**Cost:** $0.0001 (read) + $0.0005 (write) = $0.0006 per call

```typescript
await client.appendToIndex(hash);
```

### `client.getAgent(agentId)`

Look up any agent by ID (free, no auth required).

```typescript
const info = await client.getAgent(42);
// { agentId, owner, indexHash }
```

### `client.health()`

Check API health (free).

```typescript
const status = await client.health();
```

## Error handling

The SDK throws typed errors:

- **`EngramAuthError`** — authentication failed (missing registration, expired signature, wrong key)
- **`EngramPaymentError`** — x402 payment failed (insufficient balance, network error)
- **`EngramIntegrityError`** — data integrity check failed (decryption error, corrupted blob)

```typescript
import { EngramAuthError, EngramPaymentError } from 'engram-sdk';

try {
  await client.store({ type: 'text', data: 'hello' });
} catch (err) {
  if (err instanceof EngramPaymentError) {
    console.error('Payment failed — check your wallet balance');
  } else if (err instanceof EngramAuthError) {
    console.error('Auth failed — call register() first');
  }
}
```

## Encryption

All memory data is encrypted **client-side** with **AES-256-GCM** before being sent to the API. The encryption key is derived from the agent's Ethereum wallet signature using **HKDF-SHA256**:

1. The agent signs a deterministic key-derivation message with its private key
2. The signature is fed through HKDF-SHA256 to derive a 256-bit AES key
3. Each `store()` call encrypts the full payload (type, data, metadata) with AES-256-GCM using a random 12-byte IV
4. On `retrieve()`, the SDK deserializes and decrypts using the same derived key

The encryption key is derived once per client instance and cached — the wallet only signs the derivation message on the first operation. Only the agent that stored a memory can decrypt it.

## License

MIT
