# Spec: Frontend Architecture

**Date:** 2026-04-11
**Status:** Draft
**Author:** Claude (architect persona)
**Approver:** Dakota

---

## Goal

Replace the single inline-CSS `index.html` with a proper static site that implements the Neural Vault design system, supports hand-written docs, and deploys independently from the API.

## Success Criteria

1. Landing page matches DESIGN.md (Neural Vault palette, Space Grotesk + JetBrains Mono, sharp corners, atmospheric depth)
2. Docs section covers all 7 API endpoints, auth flow, and SDK quick-start with syntax-highlighted code blocks
3. Shared layout (header, footer, design tokens) — no copy-paste between pages
4. Static output — zero JS shipped to browser
5. Deploys independently from the API (no Docker rebuild for content changes)
6. Build time under 5 seconds

## Non-Goals

- No interactive dashboard or app-like features
- No OpenAPI / auto-generated docs
- No blog or changelog (deferred until there are users)
- No client-side JavaScript framework (React, Vue, etc.)
- No SSR runtime — static HTML output only

---

## Architecture

### Package Location

```
packages/
  api/          # Express API (unchanged)
  contracts/    # Solidity (unchanged)
  sdk/          # TypeScript SDK (unchanged)
  web/          # NEW — Astro static site
```

Added to root `package.json` workspaces:

```json
"workspaces": ["packages/contracts", "packages/api", "packages/sdk", "packages/web"]
```

### Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Astro | Static output, shared layouts, markdown support, zero JS by default |
| Styling | Plain CSS with design tokens | DESIGN.md specifies exact values; no utility framework needed |
| Fonts | Space Grotesk + JetBrains Mono (self-hosted WOFF2) | Design system requirement; self-host to avoid Google Fonts latency/privacy |
| Syntax highlighting | Shiki (built into Astro) | Server-rendered, no client JS, supports custom themes |
| Markdown | Astro's built-in MD/MDX support | Docs pages as `.md` files with frontmatter |
| Icons | Inline SVG | Minimal, no icon library dependency |

### Site Structure

```
packages/web/
├── src/
│   ├── layouts/
│   │   └── Base.astro          # Shell: <html>, <head>, fonts, CSS tokens, header, footer
│   ├── pages/
│   │   ├── index.astro         # Landing page
│   │   └── docs/
│   │       └── index.astro     # Docs page (API reference + auth + SDK)
│   ├── components/
│   │   ├── Header.astro        # Logo, nav, alpha badge
│   │   ├── Footer.astro        # Copyright, links
│   │   ├── CodeBlock.astro     # Styled code examples (wraps Shiki)
│   │   ├── EndpointCard.astro  # Method + route + price + description
│   │   └── FeatureCard.astro   # Icon + title + description grid item
│   └── styles/
│       └── global.css          # Design tokens, reset, base typography
├── public/
│   └── fonts/                  # Self-hosted WOFF2 files
├── astro.config.mjs
├── tsconfig.json
└── package.json
```

### Pages

#### Landing Page (`/`)

Sections in order:
1. **Hero** — Headline, subtitle, status indicators
2. **Code example** — SDK quick-start in a styled code card
3. **Features grid** — 6 cards (wallet-as-identity, content-addressed storage, x402 micropayments, on-chain registry, agent-native, any agent anywhere)
4. **API table** — 7 endpoints with method badges, routes, pricing
5. **Footer** — Copyright, API status link

#### Docs Page (`/docs`)

Single long-form page with anchor sections:
1. **Overview** — What Engram is, one paragraph
2. **Quick Start** — npm install, 10 lines of code, working example
3. **Authentication** — X-Agent-Sig header format, signature scheme, replay protection
4. **API Reference** — Each of the 7 endpoints with:
   - Method + route + price
   - Request headers/body
   - Response shape
   - Code example (curl + SDK)
5. **SDK Reference** — EngramClient constructor, methods, types
6. **Self-Hosting** — docker-compose instructions

Sidebar navigation is NOT needed — it's one page, use anchor links in a sticky header or top-of-page TOC.

---

## Design Token Implementation

From DESIGN.md, mapped to CSS custom properties in `global.css`:

```css
:root {
  /* Palette */
  --bg-primary: #0E0E13;
  --bg-surface: #131318;
  --accent: #7C6AF7;
  --accent-soft: #C7BFFF;
  --success: #00FF94;
  --border: rgba(71, 69, 84, 0.1);
  --text: #E2E2F0;
  --text-muted: #6B6B8A;

  /* Typography */
  --font-heading: 'Space Grotesk', sans-serif;
  --font-body: 'Space Grotesk', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Motion */
  --transition: 200ms ease;

  /* Spacing (8px grid) */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 1rem;      /* 16px */
  --space-4: 1.5rem;    /* 24px */
  --space-5: 2rem;      /* 32px */
  --space-6: 3rem;      /* 48px */
  --space-7: 4rem;      /* 64px */
  --space-8: 6rem;      /* 96px */

  /* Layout */
  --max-width: 80rem;   /* 1280px — max-w-7xl equivalent */
  --radius: 4px;        /* Minimal, per DESIGN.md */
}
```

### Key Design Rules (from DESIGN.md)

- No rounded corners beyond 4px
- No box shadows — use borders or background shifts for elevation
- `backdrop-blur-xl` for nav overlay only
- Primary buttons: solid Neural Purple bg, Lavender text
- Ghost buttons: transparent, subtle border, monospace text
- Code blocks: syntax highlighted with brand secondary palette

---

## Serving & Deployment

### How It's Served

Caddy serves the static site directly from disk. The API is proxied separately.

```
engram.dkta.dev {
  # API routes
  handle /v1/* {
    reverse_proxy localhost:3000
  }

  # Static site (built Astro output)
  handle {
    root * /opt/engram-web
    file_server
    encode gzip
  }
}
```

This means:
- `/` → Astro landing page (static HTML from disk)
- `/docs` → Astro docs page (static HTML from disk)
- `/v1/*` → Express API (Docker container)

### Deploy Pipeline

**Content changes (web only):**
1. CI detects changes in `packages/web/`
2. Build: `npm run build --workspace=packages/web`
3. SCP `packages/web/dist/` → VPS at `/opt/engram-web/`
4. Done. Caddy serves new files immediately. No Docker rebuild, no blue/green.

**API changes:**
Same blue/green deploy as now. Unaffected by web changes.

**CI workflow changes:**
Add a `deploy-web` job that triggers only when `packages/web/**` files change on main:

```yaml
deploy-web:
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  steps:
    - checkout
    - setup node 22
    - npm ci
    - npm run build --workspace=packages/web
    - scp dist/ to VPS:/opt/engram-web/
```

### Cleanup After Migration

- Remove `packages/api/public/` directory
- Remove `sendFile` route from `packages/api/src/index.ts`
- Remove `COPY public ./public` from API Dockerfile
- Update Caddyfile to serve static files for non-API routes

---

## Error Handling

- 404: Astro custom 404 page (`src/pages/404.astro`) — styled with Neural Vault design
- All pages are static — no runtime errors possible beyond Caddy misconfiguration
- Build errors caught in CI before deploy

## Testing Approach

- **Visual:** Manual review of landing page and docs against DESIGN.md
- **Build:** CI runs `astro build` — catches broken links, missing assets, template errors
- **Lighthouse:** Run once after initial build to verify performance (target: 95+ on all metrics — trivial for a static site with no JS)
- **Links:** `astro check` validates internal links and frontmatter

---

## Migration Steps (High Level)

1. Create `packages/web/` with Astro scaffold
2. Implement `global.css` with design tokens from DESIGN.md
3. Build `Base.astro` layout (header, footer, tokens)
4. Build landing page (`index.astro`) — port current content to new design
5. Build docs page (`docs/index.astro`) — port README content + expand
6. Add `packages/web` to root workspaces
7. Update Caddyfile to serve static files for non-API routes
8. Add `deploy-web` CI job
9. Remove `public/` from API package, remove `sendFile` route from Express
10. Deploy and verify

---

## Open Questions

None — scope is minimal and well-defined. Proceed to `/plan`.
