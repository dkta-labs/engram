import { test } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'

// Build app without DB — inject mock sql
async function buildApp(sqlMock) {
  const fastify = Fastify({ logger: false })

  // sql mock: a tagged template function that also supports property access for sub-calls
  const mockSql = sqlMock ?? (async () => Object.assign([], { count: 0 }))
  // Support fastify.sql`...` and fastify.sql`` (sub-tagged templates)
  const sqlFn = Object.assign(
    async (...args) => mockSql(...args),
    {
      // Allow fastify.sql`...` as tagged template
    }
  )

  fastify.decorate('sql', mockSql)
  fastify.decorateRequest('payerAddress', '0xTEST')

  const { default: discoveryRoutes } = await import('../routes/discovery.js')
  const { default: memoriesRoutes } = await import('../routes/memories.js')
  await fastify.register(discoveryRoutes)
  await fastify.register(memoriesRoutes)
  return fastify
}

test('GET /health → 200 {status:ok, version:2.0.0}', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/health' })
  assert.equal(res.statusCode, 200)
  const body = JSON.parse(res.body)
  assert.equal(body.status, 'ok')
  assert.equal(body.version, '2.0.0')
  await app.close()
})

test('POST /memories with no content → 400', async () => {
  const app = await buildApp()
  const res = await app.inject({
    method: 'POST',
    url: '/memories',
    payload: {},
    headers: { 'content-type': 'application/json' }
  })
  assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.body)
  assert.equal(body.error, 'content is required')
  await app.close()
})

test('POST /memories with invalid visibility → 400', async () => {
  const app = await buildApp()
  const res = await app.inject({
    method: 'POST',
    url: '/memories',
    payload: { content: 'hello', visibility: 'secret' },
    headers: { 'content-type': 'application/json' }
  })
  assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.body)
  assert.equal(body.error, 'visibility must be public or private')
  await app.close()
})

test('PATCH /memories/:id where owner does not match payerAddress → 403', async () => {
  // Mock sql: first call (SELECT) returns a record with a different owner
  let callCount = 0
  const sqlMock = async function(...args) {
    callCount++
    if (callCount === 1) {
      // SELECT returns record owned by different address
      return [{ id: 'some-uuid', owner_address: '0xOTHER' }]
    }
    return []
  }
  sqlMock.sql = sqlMock // support sub-template calls

  const app = await buildApp(sqlMock)
  const res = await app.inject({
    method: 'PATCH',
    url: '/memories/some-uuid',
    payload: { content: 'updated' },
    headers: { 'content-type': 'application/json' }
  })
  assert.equal(res.statusCode, 403)
  const body = JSON.parse(res.body)
  assert.equal(body.error, 'Forbidden')
  await app.close()
})

test('GET /memories/search with no q → 400', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/memories/search' })
  assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.body)
  assert.equal(body.error, 'q is required')
  await app.close()
})

test('GET /memories/search with q → 200 {results:[], count:0, offset:0}', async () => {
  // Mock sql returns empty array with count
  const sqlMock = async function(...args) {
    return Object.assign([], { count: 0 })
  }
  // Support sub-template (fastify.sql`AND project = ...`)
  sqlMock.sql = async () => Object.assign([], { count: 0 })

  const app = await buildApp(sqlMock)
  const res = await app.inject({ method: 'GET', url: '/memories/search?q=hello' })
  assert.equal(res.statusCode, 200)
  const body = JSON.parse(res.body)
  assert.deepEqual(body.results, [])
  assert.equal(body.count, 0)
  assert.equal(body.offset, 0)
  await app.close()
})
