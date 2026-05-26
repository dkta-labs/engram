import { PRICES } from '../plugins/payment.js'

const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS
const NETWORK = process.env.NETWORK || 'base'

export default async function discoveryRoutes(fastify) {
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
