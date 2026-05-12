import { Hono } from 'hono'
import { getDb } from '../../db/client.js'
import { discoverBlogInfo } from '../../scanner/fetch.js'
import { normalizeDomain, USER_AGENT } from '../../utils.js'
import type { LinkWithPost } from '../../types.js'

const app = new Hono()

app.get('/', async (c) => {
  const domain = c.req.query('domain')
  if (!domain) return c.json({ error: 'domain is required' }, 400)

  const normalized = normalizeDomain(domain)
  const db = getDb()

  const blog = db.prepare(`SELECT id FROM blogs WHERE domain = ?`).get(normalized)
  if (!blog) {
    const existing = db.prepare(`SELECT id, rss_url FROM pending_blogs WHERE domain = ?`).get(normalized) as { id: number; rss_url: string | null } | undefined
    const siteUrl = `https://${normalized}`
    if (!existing) {
      const { rssUrl, title, reason } = await discoverBlogInfo(siteUrl)
      if (reason === 'not_found' || reason === 'unreachable') {
        return c.json({ domain: normalized, inList: false, links: [], reason })
      }
      db.prepare(
        `INSERT OR IGNORE INTO pending_blogs (domain, url, name, rss_url, source, submitted_at)
         VALUES (?, ?, ?, ?, 'query', ?)`
      ).run(normalized, siteUrl, title, rssUrl, new Date().toISOString())
      return c.json({ domain: normalized, inList: false, links: [], reason: reason ?? 'pending' })
    } else if (!existing.rss_url) {
      const { rssUrl, title } = await discoverBlogInfo(siteUrl)
      db.prepare(`UPDATE pending_blogs SET rss_url = ?, name = COALESCE(name, ?) WHERE id = ?`).run(rssUrl, title, existing.id)
    }
    return c.json({ domain: normalized, inList: false, links: [], reason: 'pending' })
  }

  const links = db.prepare(`
    SELECT
      l.id AS link_id,
      p.url AS post_url,
      p.title AS post_title,
      p.published_at,
      b.name AS blog_name,
      b.url AS blog_url,
      l.target_url,
      l.link_text,
      l.context
    FROM links l
    JOIN posts p ON p.id = l.post_id
    JOIN blogs b ON b.id = p.blog_id
    WHERE l.target_domain = ?
    ORDER BY p.published_at DESC
  `).all(normalized) as LinkWithPost[]

  return c.json({ domain: normalized, inList: true, links })
})

app.post('/rss', async (c) => {
  const { domain, rssUrl } = await c.req.json<{ domain: string; rssUrl: string }>()
  if (!domain || !rssUrl) return c.json({ error: 'domain and rssUrl are required' }, 400)

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rssUrl)
  } catch {
    return c.json({ error: 'invalid_url' }, 400)
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return c.json({ error: 'invalid_url' }, 400)
  }

  try {
    const res = await fetch(rssUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!res.ok) return c.json({ error: 'fetch_failed', status: res.status }, 400)
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('rss') && !ct.includes('atom') && !ct.includes('xml')) {
      return c.json({ error: 'not_rss' }, 400)
    }
  } catch {
    return c.json({ error: 'unreachable' }, 400)
  }

  const normalized = normalizeDomain(domain)
  const db = getDb()

  const existing = db.prepare(`SELECT id FROM pending_blogs WHERE domain = ?`).get(normalized) as { id: number } | undefined
  if (existing) {
    db.prepare(`UPDATE pending_blogs SET rss_url = ? WHERE id = ?`).run(rssUrl, existing.id)
  } else {
    db.prepare(
      `INSERT OR IGNORE INTO pending_blogs (domain, url, name, rss_url, source, submitted_at)
       VALUES (?, ?, ?, ?, 'query', ?)`
    ).run(normalized, `https://${normalized}`, null, rssUrl, new Date().toISOString())
  }

  return c.json({ ok: true })
})

export default app
