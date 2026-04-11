# Implementation Plan: Frontend Architecture

**Spec:** `docs/specs/2026-04-11-frontend-architecture.md`
**Date:** 2026-04-11

---

## Task Sequence

Each task is a single commit. Tasks are ordered by dependency — later tasks build on earlier ones.

---

### Task 1: Scaffold Astro package

**Goal:** Empty Astro project that builds to static HTML.

**Files to create:**
- `packages/web/package.json`
- `packages/web/astro.config.mjs`
- `packages/web/tsconfig.json`
- `packages/web/src/pages/index.astro` (minimal placeholder — just `<h1>Engram</h1>`)

**package.json:**
```json
{
  "name": "engram-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "check": "astro check"
  },
  "dependencies": {
    "astro": "^5.x"
  }
}
```

**astro.config.mjs:**
```js
import { defineConfig } from 'astro/config';
export default defineConfig({
  output: 'static',
});
```

**Update:** root `package.json` workspaces array — add `"packages/web"`.

**Add:** root `package.json` scripts:
```json
"build:web": "npm run build --workspace=packages/web",
"dev:web": "npm run dev --workspace=packages/web"
```

**Verify:** `npm install && npm run build:web` produces `packages/web/dist/index.html`.

**Commit:** `feat(web): scaffold Astro static site package`

---

### Task 2: Design tokens and global CSS

**Goal:** Implement the Neural Vault design system as CSS custom properties + base styles.

**Files to create:**
- `packages/web/src/styles/global.css`
- `packages/web/public/fonts/SpaceGrotesk-Regular.woff2`
- `packages/web/public/fonts/SpaceGrotesk-Medium.woff2`
- `packages/web/public/fonts/SpaceGrotesk-Bold.woff2`
- `packages/web/public/fonts/JetBrainsMono-Regular.woff2`

**global.css must include:**
- `@font-face` declarations for self-hosted fonts
- `:root` variables matching spec exactly (palette, typography, spacing, layout, motion)
- CSS reset (box-sizing, margin, padding)
- Base `html`/`body` styles (bg-primary, font-body, text color, line-height)
- Grid background pattern (subtle purple lines, per current landing page)
- Utility classes: `.container` (max-width + centered), `.mono` (JetBrains Mono)

**Font sourcing:** Download WOFF2 from Google Fonts CDN or fontsource. Space Grotesk weights: 400, 500, 700. JetBrains Mono: 400.

**Verify:** Import global.css in placeholder index.astro, build, check font rendering and token values in browser.

**Commit:** `feat(web): add Neural Vault design tokens and global CSS`

---

### Task 3: Base layout and shared components

**Goal:** Reusable layout shell with header and footer.

**Files to create:**
- `packages/web/src/layouts/Base.astro`
- `packages/web/src/components/Header.astro`
- `packages/web/src/components/Footer.astro`

**Base.astro:**
- Accepts `title` prop (string)
- `<html lang="en">` with `<head>`: charset, viewport, title, global.css import, font preloads
- `<body>`: grid background pseudo-element, `<Header />`, `<slot />`, `<Footer />`
- Flex column layout, min-height 100vh, footer pushed to bottom

**Header.astro:**
- Sticky, `backdrop-blur-xl` background per DESIGN.md
- Logo: hexagon mark (inline SVG) + "engram" text in Space Grotesk 600
- Nav links: "Docs" → `/docs`, "API Status" → `/v1/health`
- Alpha badge: monospace, purple border pill
- Border-bottom: 1px solid var(--border)

**Footer.astro:**
- Copyright line: `© 2026 Engram · Built on Base · x402`
- Links: "API Status" → `/v1/health`
- Muted text, border-top

**Verify:** Update index.astro to use `<Base>` layout. Build. Check header/footer render, sticky nav works, blur effect visible.

**Commit:** `feat(web): add Base layout with Header and Footer`

---

### Task 4: Landing page components

**Goal:** Reusable components for the landing page sections.

**Files to create:**
- `packages/web/src/components/FeatureCard.astro`
- `packages/web/src/components/EndpointRow.astro`

**FeatureCard.astro:**
- Props: `icon` (string — HTML entity or SVG), `title` (string), `description` (string)
- Card styling per DESIGN.md: bg-surface, 4px radius, border, no shadow
- Padding from spacing scale

**EndpointRow.astro:**
- Props: `method` (string), `route` (string), `price` (string), `description` (string)
- Method badge with color coding: GET=green, POST=purple, PUT=amber
- Monospace route and price
- Used inside a `<table>` on the landing page

**Verify:** Import both in index.astro with test data. Build. Check rendering.

**Commit:** `feat(web): add FeatureCard and EndpointRow components`

---

### Task 5: Landing page

**Goal:** Full landing page implementing the Neural Vault design.

**File to update:** `packages/web/src/pages/index.astro`

**Sections (in order):**

1. **Hero**
   - Eyebrow: `engram.dkta.dev` with purple accent lines
   - H1: "Encrypted memory for AI agents" — gradient text (white to white/70%)
   - Subtitle: "Persistent encrypted storage..." in muted text
   - Status indicators: green dots with "API live on Base Sepolia", "SDK available"

2. **Code card**
   - Terminal-style card (bg-surface, border, dots in header)
   - SDK quick-start: register → store → retrieve
   - Syntax highlighted using `<Code>` from `astro:components` (Shiki built-in)
   - Use the `css-variables` theme and override with Neural Vault palette

3. **Features grid**
   - 6x `<FeatureCard>` in a 3-column grid (responsive: 1 col mobile, 2 col tablet, 3 col desktop)
   - Cards: Wallet-as-identity, Content-addressed storage, x402 micropayments, On-chain registry, Agent-native, Any agent anywhere

4. **API table**
   - Section label: "API Reference" in monospace caps
   - `<table>` with `<EndpointRow>` for each of 7 endpoints
   - Wrapped in border-radius container with border

**Verify:** Build. Visual review against DESIGN.md. Check responsive behavior at 375px, 768px, 1280px.

**Commit:** `feat(web): implement landing page with Neural Vault design`

---

### Task 6: Docs page

**Goal:** Hand-written API documentation with syntax-highlighted code examples.

**File to create:** `packages/web/src/pages/docs/index.astro`

**Sections (anchored):**

1. **Overview** (`#overview`)
   - What Engram is. One paragraph.
   - "How It Works" — the 5-step explanation from README

2. **Quick Start** (`#quickstart`)
   - `npm install engram-sdk`
   - Full register → store → retrieve example
   - Note about USDC on Base Sepolia + Circle faucet link

3. **Authentication** (`#auth`)
   - `X-Agent-Sig` header format (JSON with sig, agentId, timestamp)
   - Signature message: `keccak256("engram:auth:v1:" + agentId + ":" + timestamp)`
   - 5-minute validity window
   - `X-Derive-Sig` header for encryption key derivation

4. **API Reference** (`#api`) — for each of 7 endpoints:
   - Method badge + route + price
   - Description
   - Request: headers, body shape (TypeScript interface)
   - Response: shape (TypeScript interface)
   - Example: curl command + SDK equivalent

   Endpoints to document:
   - `POST /v1/agent/register` — body: `{ address, signature }`, response: `{ agentId, address, txHash }`
   - `GET /v1/agent/:agentId` — response: `{ agentId, owner, indexHash }`
   - `GET /v1/agent/:agentId/index` — headers: X-Agent-Sig, X-Derive-Sig. Response: `{ agentId, hash, index }`
   - `PUT /v1/agent/:agentId/index` — headers: X-Agent-Sig, X-Derive-Sig. Body: `{ indexDoc }`. Response: `{ hash, txHash }`
   - `POST /v1/memory` — headers: X-Agent-Sig, X-Derive-Sig. Body: `{ agentId, type, data, metadata? }`. Response: `{ hash, type }`
   - `GET /v1/memory/:hash` — headers: X-Agent-Sig, X-Derive-Sig. Response: `{ hash, data, metadata, type }`
   - `GET /v1/health` — response: `{ status, version, network, contractAddress }`

5. **SDK Reference** (`#sdk`)
   - `EngramClient` constructor: `{ privateKey, network, apiUrl }`
   - Methods: `register()`, `getAgent(id)`, `setAgentId(id)`, `store(req)`, `retrieve(hash)`, `getIndex()`, `updateIndex(doc)`
   - `PaymentRequiredError` — what it is, when it's thrown

6. **Self-Hosting** (`#selfhost`)
   - Clone, .env, deploy contract, docker-compose up

**Page navigation:** Sticky on-page TOC at the top (anchor links). No sidebar.

**Styling:** Docs-specific styles scoped in the page. Section headers with monospace labels. Code blocks with consistent padding and border.

**Verify:** Build. Check all anchor links work. Check code blocks are syntax highlighted. Check mobile readability.

**Commit:** `feat(web): add docs page with full API and SDK reference`

---

### Task 7: 404 page

**Goal:** Custom 404 page matching the design system.

**File to create:** `packages/web/src/pages/404.astro`

- Uses `<Base>` layout
- Centered content: "404 — Page not found"
- Links back to `/` and `/docs`
- Minimal, on-brand

**Verify:** Build. Navigate to a non-existent path. Check 404 renders.

**Commit:** `feat(web): add custom 404 page`

---

### Task 8: CI — add web build and deploy job

**Goal:** CI builds the web package and deploys static files to VPS independently from the API.

**File to update:** `.github/workflows/ci.yml`

**Changes to `test` job:**
- Remove the `postgres` service (leftover from pgvector removal — it's not used anymore)
- Add step: "Build Web" — `npm run build --workspace=packages/web`

**New job: `deploy-web`:**
```yaml
deploy-web:
  name: Deploy Web
  runs-on: ubuntu-latest
  needs: test
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
    - run: npm ci
    - run: npm run build --workspace=packages/web
    - name: Deploy static files
      uses: appleboy/scp-action@v0.1.7
      with:
        host: ${{ secrets.VPS_HOST }}
        username: ${{ secrets.VPS_USER }}
        key: ${{ secrets.VPS_SSH_KEY }}
        source: "packages/web/dist/*"
        target: "/opt/engram-web/"
        strip_components: 3
        overwrite: true
```

**Verify:** Push a change to `packages/web/`. CI builds web, deploys to `/opt/engram-web/`. Caddy serves updated content.

**Commit:** `ci: add web build step and independent web deploy job`

---

### Task 9: Update Caddy and clean up API

**Goal:** Caddy serves static site from disk. Express stops serving HTML.

**Changes:**

1. **Caddyfile** (on VPS via SSH):
```
engram.dkta.dev {
  tls /etc/caddy/origin.crt /etc/caddy/origin.key

  request_body {
    max_size 10MB
  }

  handle /v1/* {
    reverse_proxy localhost:3000 {
      health_uri /v1/health
      health_interval 30s
      transport http {
        dial_timeout 5s
        response_header_timeout 30s
      }
    }
  }

  handle {
    root * /opt/engram-web
    file_server
    encode gzip
    try_files {path} {path}/index.html =404
  }

  import security_headers
}
```

Note: `try_files` needed so `/docs` resolves to `/docs/index.html`.

2. **Create `/opt/engram-web/` on VPS:**
```bash
ssh hermes@204.168.156.91 "sudo mkdir -p /opt/engram-web && sudo chown hermes:hermes /opt/engram-web"
```

3. **Remove from `packages/api/src/index.ts`:**
   - Delete the `fileURLToPath`/`dirname`/`join` imports
   - Delete the `__dirname` constant
   - Delete the `app.get("/", ...)` landing page route

4. **Remove from `packages/api/Dockerfile`:**
   - Delete `COPY public ./public` line

5. **Delete:** `packages/api/public/` directory entirely

6. **Update `deploy.sh`:**
   - Update `switch_caddy()` and `active_port()` — Caddy API path will change again since the route structure now has separate `handle` blocks. The reverse_proxy will be inside `handle /v1/*`, so the path becomes:
     `routes/0/handle/0/routes/0/handle/0/routes/0/handle/0/upstreams` (or similar — must verify against live Caddy config JSON after reload)
   - Best approach: after reloading Caddyfile, curl the Caddy admin API to discover the exact path to the reverse_proxy upstreams, then update deploy.sh accordingly.

**Verify:**
- `curl https://engram.dkta.dev/` returns Astro landing page
- `curl https://engram.dkta.dev/docs` returns docs page
- `curl https://engram.dkta.dev/v1/health` returns API health JSON
- `curl https://engram.dkta.dev/nonexistent` returns 404 page

**Commit:** `feat: serve static site from Caddy, remove HTML from API`

---

### Task 10: Final verification

**Goal:** End-to-end check that everything works.

**Checklist:**
- [ ] Landing page renders with correct Neural Vault design
- [ ] Fonts load (Space Grotesk, JetBrains Mono) — check network tab
- [ ] Code blocks have syntax highlighting
- [ ] Docs page: all anchor links work
- [ ] Docs page: all 7 endpoints documented with examples
- [ ] 404 page renders for unknown paths
- [ ] API still works: `/v1/health` returns OK
- [ ] CI: web-only change triggers `deploy-web` but NOT `deploy` (API untouched)
- [ ] CI: API-only change triggers `deploy` but NOT `deploy-web`
- [ ] Mobile responsive: landing page and docs readable at 375px
- [ ] No JS shipped to browser (check view-source)
- [ ] Build time under 5 seconds

**No commit — this is validation only.**

---

## Summary

| Task | Description | Files | Depends On |
|------|-------------|-------|------------|
| 1 | Scaffold Astro package | 4 new + 1 update | — |
| 2 | Design tokens + CSS | 5 new | 1 |
| 3 | Base layout + header/footer | 3 new | 2 |
| 4 | Landing page components | 2 new | 3 |
| 5 | Landing page | 1 update | 4 |
| 6 | Docs page | 1 new | 3 |
| 7 | 404 page | 1 new | 3 |
| 8 | CI web build + deploy job | 1 update | 1 |
| 9 | Caddy + API cleanup | 5 updates + 1 delete | 5, 6, 7, 8 |
| 10 | Final verification | — | 9 |

Tasks 5, 6, 7 can be parallelized (all depend on 3, independent of each other).

---

When ready, run `/implement` to begin execution.
