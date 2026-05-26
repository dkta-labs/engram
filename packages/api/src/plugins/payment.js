import fp from 'fastify-plugin'
import { paymentMiddleware } from 'x402-express'
import { createCdpAuthHeaders } from '@coinbase/x402'

const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS
const NETWORK = process.env.NETWORK || 'base'

const facilitator = {
  url: 'https://api.cdp.coinbase.com/platform/v2/x402',
  createAuthHeaders: createCdpAuthHeaders(
    process.env.CDP_API_KEY_ID,
    process.env.CDP_API_KEY_SECRET
  )
}

export const PRICES = {
  'POST /memories':       { price: '$0.001',  network: NETWORK, config: { description: 'Write a memory' } },
  'GET /memories/search': { price: '$0.001',  network: NETWORK, config: { description: 'Search memories (FTS)' } },
  'GET /memories/:id':    { price: '$0.0001', network: NETWORK, config: { description: 'Read a memory by ID' } },
  'PATCH /memories/:id':  { price: '$0.001',  network: NETWORK, config: { description: 'Update a memory' } },
  'DELETE /memories/:id': { price: '$0.0001', network: NETWORK, config: { description: 'Delete a memory' } },
}

export default fp(async function paymentPlugin(fastify) {
  const middleware = paymentMiddleware(PAYMENT_ADDRESS, PRICES, facilitator)

  const FREE_PATHS = new Set(['/health', '/.well-known/x402.json', '/openapi.json', '/llms.txt'])

  fastify.addHook('onRequest', (req, reply, done) => {
    if (FREE_PATHS.has(req.url) || FREE_PATHS.has(req.url.split('?')[0])) return done()
    middleware(req.raw, reply.raw, done)
  })

  fastify.decorateRequest('payerAddress', null)
  fastify.addHook('preHandler', (req, reply, done) => {
    req.payerAddress = req.raw?.payment?.from ?? null
    done()
  })
})
