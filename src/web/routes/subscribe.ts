import { Hono } from 'hono'
import { getDb } from '../../db/client.js'
import { sendConfirmation } from '../../mailer/index.js'
import { normalizeDomain } from '../../utils.js'

const app = new Hono()

app.post('/', async (c) => {
  const { domain, email } = await c.req.json<{ domain: string; email: string }>()
  if (!domain || !email) return c.json({ error: 'domain and email are required' }, 400)

  const normalized = normalizeDomain(domain)
  const db = getDb()

  const existing = db.prepare(`SELECT id, confirmed FROM subscriptions WHERE domain = ? AND email = ?`)
    .get(normalized, email) as { id: number; confirmed: number } | undefined

  if (existing) {
    if (existing.confirmed) return c.json({ status: 'already_confirmed' })
    return c.json({ status: 'pending' })
  }

  const token = crypto.randomUUID()
  const unsubscribeToken = crypto.randomUUID()

  db.prepare(
    `INSERT INTO subscriptions (domain, email, token, unsubscribe_token, confirmed, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`
  ).run(normalized, email, token, unsubscribeToken, new Date().toISOString())

  await sendConfirmation(email, token)
  return c.json({ status: 'confirmation_sent' })
})

app.get('/confirm/:token', (c) => {
  const token = c.req.param('token')
  const db = getDb()

  const sub = db.prepare(`SELECT id FROM subscriptions WHERE token = ? AND confirmed = 0`).get(token)
  if (!sub) return c.json({ error: 'invalid or already confirmed token' }, 400)

  db.prepare(`UPDATE subscriptions SET confirmed = 1, confirmed_at = ? WHERE token = ?`)
    .run(new Date().toISOString(), token)

  return c.redirect('/?confirmed=1')
})

app.get('/unsubscribe/:token', (c) => {
  const token = c.req.param('token')
  const db = getDb()

  const result = db.prepare(`DELETE FROM subscriptions WHERE unsubscribe_token = ?`).run(token)
  if (result.changes === 0) return c.json({ error: 'invalid token' }, 400)

  return c.redirect('/?unsubscribed=1')
})

export default app
