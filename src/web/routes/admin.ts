import { Hono } from 'hono'
import { getDb } from '../../db/client.js'
import { discoverBlogInfo } from '../../scanner/fetch.js'
import type { Blog, PendingBlog, Subscription } from '../../types.js'

const app = new Hono()

app.get('/pending', (c) => {
  const db = getDb()
  const items = db.prepare(`SELECT * FROM pending_blogs ORDER BY submitted_at DESC`).all() as PendingBlog[]
  return c.json(items)
})

app.post('/pending/discover', async (c) => {
  const db = getDb()
  const nullItems = db.prepare(`SELECT id, url FROM pending_blogs WHERE rss_url IS NULL`).all() as { id: number; url: string }[]
  let updated = 0
  for (const item of nullItems) {
    const { rssUrl, title } = await discoverBlogInfo(item.url)
    if (rssUrl) {
      db.prepare(`UPDATE pending_blogs SET rss_url = ?, name = COALESCE(name, ?) WHERE id = ?`).run(rssUrl, title, item.id)
      updated++
    }
  }
  return c.json({ total: nullItems.length, updated })
})

app.post('/pending/discover-one', async (c) => {
  const { id } = await c.req.json<{ id: number }>()
  const db = getDb()
  const item = db.prepare(`SELECT id, url FROM pending_blogs WHERE id = ?`).get(id) as { id: number; url: string } | undefined
  if (!item) return c.json({ error: 'not found' }, 404)
  const { rssUrl, title } = await discoverBlogInfo(item.url)
  if (rssUrl) {
    db.prepare(`UPDATE pending_blogs SET rss_url = ?, name = COALESCE(name, ?) WHERE id = ?`).run(rssUrl, title, item.id)
  }
  return c.json({ rssUrl, title })
})

app.post('/pending/:id/approve', (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb()

  const pending = db.prepare(`SELECT * FROM pending_blogs WHERE id = ?`).get(id) as PendingBlog | undefined
  if (!pending) return c.json({ error: 'not found' }, 404)
  if (!pending.rss_url) return c.json({ error: 'rss_url is required before approving' }, 400)

  const name = (pending as PendingBlog & { name?: string }).name || pending.domain
  const result = db.prepare(
    `INSERT OR IGNORE INTO blogs (name, url, domain, rss_url) VALUES (?, ?, ?, ?)`
  ).run(name, pending.url, pending.domain, pending.rss_url)

  if (result.changes === 0) return c.json({ error: 'blog with this domain already exists' }, 409)

  db.prepare(`DELETE FROM pending_blogs WHERE id = ?`).run(id)
  return c.json({ ok: true })
})

app.post('/pending/:id/reject', (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb()
  const result = db.prepare(`DELETE FROM pending_blogs WHERE id = ?`).run(id)
  if (result.changes === 0) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

app.patch('/pending/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<Partial<PendingBlog>>()
  const db = getDb()
  if (body.rss_url) {
    db.prepare(`UPDATE pending_blogs SET rss_url = ? WHERE id = ?`).run(body.rss_url, id)
  }
  return c.json({ ok: true })
})

app.get('/blogs', (c) => {
  const db = getDb()
  const blogs = db.prepare(`SELECT * FROM blogs ORDER BY domain`).all() as Blog[]
  return c.json(blogs)
})

app.patch('/blogs/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<Partial<{ name: string; url: string; rss_url: string }>>()
  const db = getDb()
  const fields: string[] = []
  const vals: unknown[] = []
  if (body.name !== undefined) { fields.push('name = ?'); vals.push(body.name) }
  if (body.url !== undefined) { fields.push('url = ?'); vals.push(body.url) }
  if (body.rss_url !== undefined) { fields.push('rss_url = ?'); vals.push(body.rss_url) }
  if (!fields.length) return c.json({ error: 'nothing to update' }, 400)
  vals.push(id)
  db.prepare(`UPDATE blogs SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
  return c.json({ ok: true })
})

app.delete('/blogs/:id', (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb()
  db.transaction(() => {
    const postIds = (db.prepare(`SELECT id FROM posts WHERE blog_id = ?`).all(id) as { id: number }[]).map(r => r.id)
    for (const pid of postIds) db.prepare(`DELETE FROM links WHERE post_id = ?`).run(pid)
    db.prepare(`DELETE FROM posts WHERE blog_id = ?`).run(id)
    db.prepare(`DELETE FROM blogs WHERE id = ?`).run(id)
  })()
  return c.json({ ok: true })
})

app.get('/subscriptions', (c) => {
  const db = getDb()
  const subs = db.prepare(`SELECT * FROM subscriptions ORDER BY created_at DESC`).all() as Subscription[]
  return c.json(subs)
})

app.delete('/subscriptions/:id', (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb()
  db.prepare(`DELETE FROM subscriptions WHERE id = ?`).run(id)
  return c.json({ ok: true })
})

app.get('/links', (c) => {
  const db = getDb()
  const { domain, blog, date, sort = 'scanned_at', order = 'desc' } = c.req.query()
  const page = Math.max(1, Number(c.req.query('page') ?? 1))
  const pageSize = Math.min(100, Math.max(10, Number(c.req.query('pageSize') ?? 50)))

  const where: string[] = []
  const params: unknown[] = []

  if (domain) { where.push(`l.target_domain = ?`); params.push(domain) }
  if (blog) { where.push(`b.domain = ?`); params.push(blog) }
  if (date) { where.push(`DATE(p.scanned_at) = ?`); params.push(date) }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const sortCol = sort === 'blog' ? 'b.name' : sort === 'target_count' ? 'target_count' : sort === 'published_at' ? 'p.published_at' : 'p.scanned_at'
  const sortDir = order === 'asc' ? 'ASC' : 'DESC'

  const { total } = db.prepare(`
    SELECT COUNT(DISTINCT p.id) AS total
    FROM links l
    JOIN posts p ON p.id = l.post_id
    JOIN blogs b ON b.id = p.blog_id
    ${whereClause}
  `).get(params) as { total: number }

  const rows = db.prepare(`
    SELECT
      p.url AS post_url,
      p.title AS post_title,
      p.published_at,
      p.scanned_at,
      b.name AS blog_name,
      b.domain AS blog_domain,
      json_group_array(json_object(
        'url', l.target_url,
        'domain', l.target_domain,
        'blogName', (SELECT name FROM blogs WHERE domain = l.target_domain),
        'linkText', l.link_text,
        'context', l.context
      )) AS targets,
      COUNT(l.id) AS target_count
    FROM links l
    JOIN posts p ON p.id = l.post_id
    JOIN blogs b ON b.id = p.blog_id
    ${whereClause}
    GROUP BY p.id
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `).all([...params, pageSize, (page - 1) * pageSize]) as {
    post_url: string; post_title: string; published_at: string | null
    scanned_at: string; blog_name: string; blog_domain: string
    targets: string; target_count: number
  }[]

  const items = rows.map(r => ({ ...r, targets: JSON.parse(r.targets) }))
  return c.json({ total, page, pageSize, items })
})

export default app
