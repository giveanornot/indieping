import { Hono } from 'hono'
import { getDb } from '../../db/client.js'
import { discoverBlogInfo } from '../../scanner/fetch.js'
import { normalizeDomain } from '../../utils.js'
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
      const { rssUrl, title } = await discoverBlogInfo(siteUrl)
      db.prepare(
        `INSERT OR IGNORE INTO pending_blogs (domain, url, name, rss_url, source, submitted_at)
         VALUES (?, ?, ?, ?, 'query', ?)`
      ).run(normalized, siteUrl, title, rssUrl, new Date().toISOString())
    } else if (!existing.rss_url) {
      const { rssUrl, title } = await discoverBlogInfo(siteUrl)
      db.prepare(`UPDATE pending_blogs SET rss_url = ?, name = COALESCE(name, ?) WHERE id = ?`).run(rssUrl, title, existing.id)
    }
    return c.json({ domain: normalized, inList: false, links: [] })
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

export default app
