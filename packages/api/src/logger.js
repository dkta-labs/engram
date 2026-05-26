import fs from 'fs'

const LOG_PATH = '/app/logs/requests.jsonl'
const UMAMI_URL = process.env.UMAMI_URL || 'http://172.19.0.1:3725/api/send'
const UMAMI_SITE_ID = process.env.UMAMI_SITE_ID || '420e1163-e0c4-4c48-afae-0011cf7f4b6d'

// Log rotation: if log file exceeds 10MB, rotate it
try {
  const stat = fs.statSync(LOG_PATH)
  if (stat.size > 10 * 1024 * 1024) {
    fs.renameSync(LOG_PATH, LOG_PATH + '.1')
  }
} catch (_) { /* file may not exist yet */ }

export function logRequest(entry) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n')
  } catch (_) { /* never block on logging */ }
}

export async function umamiEvent(name, data = {}) {
  try {
    await fetch(UMAMI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          website: UMAMI_SITE_ID,
          hostname: 'engram.dkta.dev',
          language: 'en',
          url: '/memories',
          name,
          data,
        },
        type: 'event',
      }),
    })
  } catch (_) { /* never block on analytics */ }
}
