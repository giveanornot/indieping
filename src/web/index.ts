import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { getDb } from '../db/client.js'
import { initSchema } from '../db/schema.js'
import { normalizeDomain } from '../utils.js'
import { startScheduler } from '../scheduler.js'
import queryRoute from './routes/query.js'
import subscribeRoute from './routes/subscribe.js'
import adminRoute from './routes/admin.js'
import feedRoute from './routes/feed.js'

initSchema()
startScheduler()

const app = new Hono()

app.route('/api/query', queryRoute)
app.route('/api', subscribeRoute)
app.route('/feed', feedRoute)

app.use('/api/admin/*', async (c, next) => {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return next()
  const auth = c.req.header('Authorization') ?? ''
  const [scheme, encoded] = auth.split(' ')
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    const [, pass] = decoded.split(':')
    if (pass === password) return next()
  }
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Admin"' },
  })
})
app.route('/api/admin', adminRoute)

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/check', (c) => {
  const domain = c.req.query('domain')
  if (!domain) return c.json({ error: 'domain required' }, 400)
  const normalized = normalizeDomain(domain)
  const db = getDb()
  const found = db.prepare(`SELECT id FROM blogs WHERE domain = ?`).get(normalized)
  return c.json({ inList: !!found })
})

app.use('/*', serveStatic({ root: './frontend/dist' }))
app.get('/*', serveStatic({ path: './frontend/dist/index.html' }))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => {
  console.log(`[web] listening on http://localhost:${port}`)
})
