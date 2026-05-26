import { logRequest, umamiEvent } from '../logger.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validateUuid(id, reply) {
  if (!UUID_RE.test(id)) {
    reply.code(400).send({ error: 'Invalid id format' })
    return false
  }
  return true
}

export default async function memoriesRoutes(fastify) {
  // POST /memories
  fastify.post('/memories', async (req, reply) => {
    const { content, tags = [], project, agent_id, visibility = 'private' } = req.body ?? {}
    if (!content?.trim()) return reply.code(400).send({ error: 'content is required' })
    if (!['public', 'private'].includes(visibility)) {
      return reply.code(400).send({ error: 'visibility must be public or private' })
    }
    const [memory] = await fastify.sql`
      INSERT INTO memories (content, tags, project, agent_id, visibility, owner_address)
      VALUES (${content}, ${tags}, ${project ?? null}, ${agent_id ?? null}, ${visibility}, ${req.payerAddress})
      RETURNING id, content, tags, project, agent_id, visibility, owner_address, created_at
    `
    logRequest({ event: 'write', wallet: req.payerAddress, project: project ?? null, visibility, paid: true })
    umamiEvent('memory-write', { status: 201, paid: true, visibility })
    return reply.code(201).send(memory)
  })

  // PATCH /memories/:id
  fastify.patch('/memories/:id', async (req, reply) => {
    if (!validateUuid(req.params.id, reply)) return
    const { content, tags, project, agent_id, visibility } = req.body ?? {}
    const [existing] = await fastify.sql`SELECT id, owner_address FROM memories WHERE id = ${req.params.id}`
    if (!existing) return reply.code(404).send({ error: 'Not found' })
    if (existing.owner_address !== req.payerAddress) return reply.code(403).send({ error: 'Forbidden' })
    const [updated] = await fastify.sql`
      UPDATE memories SET
        content    = COALESCE(${content ?? null}, content),
        tags       = COALESCE(${tags ?? null}, tags),
        project    = COALESCE(${project ?? null}, project),
        agent_id   = COALESCE(${agent_id ?? null}, agent_id),
        visibility = COALESCE(${visibility ?? null}, visibility),
        updated_at = now()
      WHERE id = ${req.params.id}
      RETURNING id, content, tags, project, agent_id, visibility, owner_address, created_at, updated_at
    `
    logRequest({ event: 'update', wallet: req.payerAddress, id: req.params.id, paid: true })
    umamiEvent('memory-update', { status: 200, paid: true })
    return updated
  })

  // GET /memories/search — MUST come before /:id
  fastify.get('/memories/search', async (req, reply) => {
    const { q, project, agent_id, limit = 20, offset = 0 } = req.query
    if (!q?.trim()) return reply.code(400).send({ error: 'q is required' })
    const lim = Math.min(Number(limit), 100)
    const off = Number(offset)
    const results = await fastify.sql`
      SELECT id, content, tags, project, agent_id, visibility, owner_address, created_at,
             ts_rank(tsv, query) AS rank
      FROM memories, plainto_tsquery('english', ${q}) query
      WHERE tsv @@ query
        AND (
          visibility = 'public'
          OR (visibility = 'private' AND owner_address = ${req.payerAddress})
        )
        ${project  ? fastify.sql`AND project  = ${project}`  : fastify.sql``}
        ${agent_id ? fastify.sql`AND agent_id = ${agent_id}` : fastify.sql``}
      ORDER BY rank DESC, created_at DESC
      LIMIT ${lim} OFFSET ${off}
    `
    logRequest({ event: 'search', wallet: req.payerAddress, q, results: results.length, paid: true })
    umamiEvent('memory-search', { status: 200, paid: true, results: results.length })
    return { results, count: results.length, offset: off }
  })

  // GET /memories/:id
  fastify.get('/memories/:id', async (req, reply) => {
    if (!validateUuid(req.params.id, reply)) return
    const [memory] = await fastify.sql`
      SELECT id, content, tags, project, agent_id, visibility, owner_address, created_at, updated_at
      FROM memories WHERE id = ${req.params.id}
    `
    if (!memory) return reply.code(404).send({ error: 'Not found' })
    if (memory.visibility === 'private' && memory.owner_address !== req.payerAddress) {
      return reply.code(404).send({ error: 'Not found' })
    }
    logRequest({ event: 'read', wallet: req.payerAddress, id: req.params.id, paid: true })
    umamiEvent('memory-read', { status: 200, paid: true })
    return memory
  })

  // DELETE /memories/:id
  fastify.delete('/memories/:id', async (req, reply) => {
    if (!validateUuid(req.params.id, reply)) return
    const result = await fastify.sql`
      DELETE FROM memories WHERE id = ${req.params.id} AND owner_address = ${req.payerAddress}
    `
    if (result.count === 0) return reply.code(404).send({ error: 'Not found or not yours' })
    logRequest({ event: 'delete', wallet: req.payerAddress, id: req.params.id, paid: true })
    umamiEvent('memory-delete', { status: 204, paid: true })
    return reply.code(204).send()
  })
}
