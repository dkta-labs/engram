import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'

import paymentPlugin from './plugins/payment.js'
import memoriesRoutes from './routes/memories.js'
import discoveryRoutes from './routes/discovery.js'
import sql from './db.js'

const fastify = Fastify({ logger: true })

fastify.decorate('sql', sql)

await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
})
await fastify.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX ?? 200),
  timeWindow: Number(process.env.RATE_LIMIT_WINDOW ?? 60000),
  keyGenerator: (req) => req.ip,
})
await fastify.register(discoveryRoutes)
await fastify.register(paymentPlugin)
await fastify.register(memoriesRoutes)

try {
  await fastify.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
