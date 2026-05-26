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

// x402 route price map
export const PRICES = {
  'POST /memories':       { price: '$0.001',  network: NETWORK, config: { description: 'Write a memory' } },
  'GET /memories/search': { price: '$0.001',  network: NETWORK, config: { description: 'Search memories (FTS)' } },
  'GET /memories/:id':    { price: '$0.0001', network: NETWORK, config: { description: 'Read a memory by ID' } },
  'PATCH /memories/:id':  { price: '$0.001',  network: NETWORK, config: { description: 'Update a memory' } },
  'DELETE /memories/:id': { price: '$0.0001', network: NETWORK, config: { description: 'Delete a memory' } },
}

// Paths that bypass x402 payment
const FREE_PATHS = new Set(['/health', '/.well-known/x402.json', '/openapi.json', '/llms.txt'])

// CORS headers that must appear on every 402 response so browser agents can read the challenge
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-payment,payment-signature,authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
}

/**
 * Shim Express-style properties onto raw Node.js req/res so x402-express middleware works.
 * x402-express uses: req.path, req.originalUrl, req.protocol, req.header(), req.method
 *                    res.status(), res.json(), res.setHeader()
 */
function shimExpressReq(rawReq, url) {
  const pathname = url.split('?')[0]
  rawReq.path = pathname
  rawReq.originalUrl = url
  rawReq.protocol = 'https'
  rawReq.header = (name) => rawReq.headers[name.toLowerCase()]
  return rawReq
}

function shimExpressRes(rawRes) {
  if (rawRes._x402shimmed) return rawRes

  rawRes._x402shimmed = true
  const headers = {}
  rawRes._statusCode = 200

  rawRes.status = function (code) {
    this._statusCode = code
    return this
  }
  rawRes.setHeader = function (name, value) {
    headers[name] = value
    return this
  }
  rawRes.getHeader = function (name) {
    return headers[name]
  }
  rawRes.json = function (data) {
    const body = JSON.stringify(data)
    // Inject CORS on 402 so browser agents can read the payment challenge
    const corsHeaders = this._statusCode === 402 ? CORS_HEADERS : {}
    const allHeaders = {
      'Content-Type': 'application/json',
      'Cache-Control': this._statusCode === 402 ? 'private, no-store' : 'no-cache',
      ...corsHeaders,
      ...headers,
    }
    this.writeHead(this._statusCode, allHeaders)
    this.end(body)
  }
  rawRes.send = function (data) {
    const body = typeof data === 'string' ? data : JSON.stringify(data)
    const corsHeaders = this._statusCode === 402 ? CORS_HEADERS : {}
    const allHeaders = {
      ...corsHeaders,
      ...headers,
    }
    this.writeHead(this._statusCode, allHeaders)
    this.end(body)
  }
  return rawRes
}

export default fp(async function paymentPlugin(fastify) {
  const middleware = paymentMiddleware(PAYMENT_ADDRESS, PRICES, facilitator)

  fastify.addHook('onRequest', (req, reply, done) => {
    const pathname = req.url.split('?')[0]
    if (FREE_PATHS.has(pathname)) return done()

    shimExpressReq(req.raw, req.url)
    shimExpressRes(reply.raw)

    middleware(req.raw, reply.raw, done)
  })

  // Decorate request with payer address extracted from x402 payment
  fastify.decorateRequest('payerAddress', null)
  fastify.addHook('preHandler', (req, reply, done) => {
    req.payerAddress = req.raw?.payment?.from ?? null
    done()
  })
})
