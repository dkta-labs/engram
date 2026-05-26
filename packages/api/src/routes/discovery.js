import { PRICES } from '../plugins/payment.js'

const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS
const NETWORK = process.env.NETWORK || 'base'

const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Engram — Agent Memory API</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0f;
      --surface: #12121a;
      --border: #1e1e2e;
      --accent: #7c6af7;
      --accent2: #4ade80;
      --text: #e2e2f0;
      --muted: #6b6b8a;
      --code-bg: #0f0f18;
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', system-ui, sans-serif;
      line-height: 1.6;
      min-height: 100vh;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    header {
      border-bottom: 1px solid var(--border);
      padding: 1.5rem 2rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .logo { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.02em; }
    .logo span { color: var(--accent); }
    .badge {
      font-size: 0.7rem;
      font-weight: 600;
      background: var(--accent);
      color: #fff;
      padding: 2px 8px;
      border-radius: 99px;
      letter-spacing: 0.05em;
    }
    .badge.green { background: var(--accent2); color: #000; }

    main { max-width: 860px; margin: 0 auto; padding: 3rem 2rem; }

    .hero h1 {
      font-size: 2.5rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.2;
      margin-bottom: 1rem;
    }
    .hero h1 em { color: var(--accent); font-style: normal; }
    .hero p { color: var(--muted); font-size: 1.1rem; max-width: 560px; margin-bottom: 1.5rem; }
    .pills { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 2.5rem; }
    .pill {
      font-size: 0.78rem;
      padding: 4px 12px;
      border-radius: 99px;
      border: 1px solid var(--border);
      color: var(--muted);
    }

    h2 { font-size: 1.1rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 1rem; margin-top: 2.5rem; }

    .endpoint-grid { display: flex; flex-direction: column; gap: 0.5rem; }
    .endpoint {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .method {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 5px;
      min-width: 52px;
      text-align: center;
      letter-spacing: 0.04em;
    }
    .method.POST { background: #1a3a2a; color: var(--accent2); }
    .method.GET  { background: #1a2a3a; color: #60a5fa; }
    .method.PATCH { background: #2a2a1a; color: #fbbf24; }
    .method.DELETE { background: #2a1a1a; color: #f87171; }
    .ep-path { font-family: monospace; font-size: 0.9rem; color: var(--text); flex: 1; }
    .ep-desc { color: var(--muted); font-size: 0.85rem; }
    .ep-price { font-size: 0.8rem; font-weight: 600; color: var(--accent); white-space: nowrap; }

    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .info-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem;
    }
    .info-card h3 { font-size: 0.85rem; color: var(--muted); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.06em; }
    .info-card p { font-size: 0.95rem; }

    pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem;
      overflow-x: auto;
      font-size: 0.82rem;
      line-height: 1.7;
      margin-top: 0.5rem;
    }
    code { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
    .comment { color: var(--muted); }
    .str { color: var(--accent2); }
    .kw { color: var(--accent); }

    footer {
      border-top: 1px solid var(--border);
      padding: 1.5rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--muted);
      font-size: 0.85rem;
      margin-top: 4rem;
    }
    footer a { color: var(--muted); }
    footer a:hover { color: var(--text); }

    @media (max-width: 600px) {
      .hero h1 { font-size: 1.8rem; }
      .info-grid { grid-template-columns: 1fr; }
      .ep-desc { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">eng<span>ram</span></div>
    <span class="badge green">LIVE</span>
    <span class="badge">x402</span>
    <span class="badge">Base</span>
  </header>

  <main>
    <section class="hero">
      <h1>Memory API for<br/><em>autonomous agents</em></h1>
      <p>Write, search, and recall memories — pay per operation with a wallet. No API keys. No accounts. Your wallet address is your identity.</p>
      <div class="pills">
        <span class="pill">x402 payments</span>
        <span class="pill">Wallet-as-identity</span>
        <span class="pill">FTS search</span>
        <span class="pill">Base mainnet</span>
        <span class="pill">Private by default</span>
      </div>
    </section>

    <h2>Endpoints</h2>
    <div class="endpoint-grid">
      <div class="endpoint">
        <span class="method POST">POST</span>
        <span class="ep-path">/memories</span>
        <span class="ep-desc">Write a memory</span>
        <span class="ep-price">$0.001</span>
      </div>
      <div class="endpoint">
        <span class="method GET">GET</span>
        <span class="ep-path">/memories/search?q=…</span>
        <span class="ep-desc">Full-text search</span>
        <span class="ep-price">$0.001</span>
      </div>
      <div class="endpoint">
        <span class="method GET">GET</span>
        <span class="ep-path">/memories/:id</span>
        <span class="ep-desc">Read by ID</span>
        <span class="ep-price">$0.0001</span>
      </div>
      <div class="endpoint">
        <span class="method PATCH">PATCH</span>
        <span class="ep-path">/memories/:id</span>
        <span class="ep-desc">Update own memory</span>
        <span class="ep-price">$0.001</span>
      </div>
      <div class="endpoint">
        <span class="method DELETE">DELETE</span>
        <span class="ep-path">/memories/:id</span>
        <span class="ep-desc">Delete own memory</span>
        <span class="ep-price">$0.0001</span>
      </div>
    </div>

    <h2>How it works</h2>
    <div class="info-grid">
      <div class="info-card">
        <h3>Identity</h3>
        <p>Your wallet address from the x402 payment header is your user ID. No signup, no keys.</p>
      </div>
      <div class="info-card">
        <h3>Privacy</h3>
        <p>Memories default to <code>private</code>. Only the address that wrote them can read them. Set <code>visibility: "public"</code> to share.</p>
      </div>
      <div class="info-card">
        <h3>Search</h3>
        <p>Full-text search over your memories with Postgres tsvector. Fast, no embeddings, no round-trips.</p>
      </div>
      <div class="info-card">
        <h3>Payments</h3>
        <p>Every operation is gated by an x402 micropayment on Base. No prepay, no subscription — pay per call.</p>
      </div>
    </div>

    <h2>Quick start</h2>
    <pre><code><span class="comment">// Write a memory</span>
<span class="kw">const</span> res = <span class="kw">await</span> fetch(<span class="str">"https://engram.dkta.dev/memories"</span>, {
  method: <span class="str">"POST"</span>,
  headers: { <span class="str">"Content-Type"</span>: <span class="str">"application/json"</span> },
  body: JSON.stringify({
    content: <span class="str">"The user prefers concise responses."</span>,
    tags: [<span class="str">"preference"</span>],
  }),
})
<span class="comment">// 402 Payment Required — pay with x402, then retry</span></code></pre>

    <h2>Discovery</h2>
    <div class="endpoint-grid">
      <div class="endpoint">
        <span class="method GET">GET</span>
        <span class="ep-path"><a href="/.well-known/x402.json">/.well-known/x402.json</a></span>
        <span class="ep-desc">x402 manifest</span>
        <span class="ep-price">free</span>
      </div>
      <div class="endpoint">
        <span class="method GET">GET</span>
        <span class="ep-path"><a href="/openapi.json">/openapi.json</a></span>
        <span class="ep-desc">OpenAPI spec</span>
        <span class="ep-price">free</span>
      </div>
      <div class="endpoint">
        <span class="method GET">GET</span>
        <span class="ep-path"><a href="/llms.txt">/llms.txt</a></span>
        <span class="ep-desc">Agent instructions</span>
        <span class="ep-price">free</span>
      </div>
    </div>
  </main>

  <footer>
    <span>engram.dkta.dev</span>
    <span><a href="https://dkta.dev">dkta.dev</a> · <a href="/.well-known/x402.json">x402</a> · <a href="/openapi.json">OpenAPI</a></span>
  </footer>
</body>
</html>`

export default async function discoveryRoutes(fastify) {
  fastify.get('/', async (req, reply) => {
    reply.type('text/html').send(LANDING_HTML)
  })

  fastify.get('/health', async () => ({ status: 'ok', version: '2.0.0' }))

  fastify.get('/.well-known/x402.json', async () => ({
    x402Version: 2,
    paymentAddress: PAYMENT_ADDRESS,
    network: NETWORK,
    caip2Network: 'eip155:8453',
    endpoints: Object.entries(PRICES).map(([route, cfg]) => ({
      route,
      price: cfg.price,
      description: cfg.config.description,
    }))
  }))

  fastify.get('/openapi.json', async () => ({
    openapi: '3.1.0',
    info: { title: 'Engram', version: '2.0.0', description: 'x402-gated agent memory API' },
    servers: [{ url: 'https://engram.dkta.dev' }],
    paths: {
      '/memories': { post: { summary: 'Write a memory', tags: ['memories'] } },
      '/memories/search': { get: { summary: 'Search memories (FTS)', tags: ['memories'] } },
      '/memories/{id}': {
        get: { summary: 'Get memory by ID', tags: ['memories'] },
        patch: { summary: 'Update own memory', tags: ['memories'] },
        delete: { summary: 'Delete own memory', tags: ['memories'] },
      },
    }
  }))

  fastify.get('/llms.txt', {
    config: { rawReply: true }
  }, async (req, reply) => {
    reply.type('text/plain')
    return `# Engram — Agent Memory API

Base URL: https://engram.dkta.dev
Protocol: x402 (all routes except /health, /.well-known/x402.json, /openapi.json)
Identity: your wallet address from x402 payment

Endpoints:
  POST   /memories              $0.001  Write a memory
  GET    /memories/search?q=... $0.001  FTS search
  GET    /memories/:id          $0.0001 Read by ID
  PATCH  /memories/:id          $0.001  Update own memory
  DELETE /memories/:id          $0.0001 Delete own memory

Private memories are only returned to the address that wrote them.
Public memories are readable by any paying address.
`
  })
}
