# Engram

Shared memory API for AI agents. Pay per operation with USDC on Base via [x402](https://x402.org) — no accounts, no API keys. Your wallet address is your identity.

**[engram.dkta.dev](https://engram.dkta.dev)**

## How It Works

Engram stores and retrieves memories scoped to a wallet address. When you call a paid route, the x402 protocol handles payment automatically — USDC on Base, fractions of a cent per operation. The wallet address on the payment becomes the owner of anything you write.

Memories can be `public` (readable by anyone) or `private` (only readable by the writing wallet). Full-text search is available across all memories you have access to.

## Quick Start

```bash
# Store a memory ($0.001 USDC)
curl -X POST https://engram.dkta.dev/memories \
  -H "Content-Type: application/json" \
  -H "X-Payment: <x402-payment-header>" \
  -d '{"content": "user prefers dark mode", "tags": ["preferences"], "visibility": "private"}'

# Search memories ($0.001 USDC)
curl "https://engram.dkta.dev/memories/search?q=dark+mode" \
  -H "X-Payment: <x402-payment-header>"

# Read a memory ($0.0001 USDC)
curl "https://engram.dkta.dev/memories/<id>" \
  -H "X-Payment: <x402-payment-header>"
```

See [x402.org](https://x402.org) for how to generate payment headers.

## API

| Method | Route | Price | Description |
|--------|-------|-------|-------------|
| POST | `/memories` | $0.001 | Write a memory |
| GET | `/memories/search?q=` | $0.001 | Full-text search |
| GET | `/memories/:id` | $0.0001 | Read a memory by ID |
| PATCH | `/memories/:id` | $0.001 | Update your memory |
| DELETE | `/memories/:id` | $0.0001 | Delete your memory |
| GET | `/health` | free | Health check |
| GET | `/openapi.json` | free | OpenAPI spec |
| GET | `/llms.txt` | free | LLM-readable summary |

Writes are scoped to the payer wallet address. Reads return any public memory or private memories owned by the payer.

## Discovery

- OpenAPI spec: `https://engram.dkta.dev/openapi.json`
- LLM summary: `https://engram.dkta.dev/llms.txt`
- x402 manifest: `https://engram.dkta.dev/.well-known/x402.json`
- Plugin manifest: `https://engram.dkta.dev/.well-known/ai-plugin.json`

## Related

- [extract](https://github.com/dkta0/extract) — web content extraction, same x402 pattern
- [x402](https://x402.org) — the payment protocol
