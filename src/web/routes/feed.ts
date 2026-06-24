import { Hono } from 'hono'
import { createHash } from 'crypto'
import { getDb } from '../../db/client.js'
import { normalizeDomain } from '../../utils.js'

interface FeedLink {
  link_id: number
  post_url: string
  post_title: string
  published_at: string | null
  scanned_at: string
  blog_name: string
  blog_url: string
  target_url: string
  link_text: string
  first_seen_at: string
  last_seen_at: string
  context: string
}

const app = new Hono()

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatRssDate(value: string | null): string {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return new Date().toUTCString()
  return date.toUTCString()
}

function absoluteUrl(origin: string, path: string): string {
  return new URL(path, origin).toString()
}

function stableGuid(link: FeedLink): string {
  const hash = createHash('sha256')
    .update(link.post_url)
    .update('\0')
    .update(link.target_url)
    .digest('hex')
    .slice(0, 32)
  return `indieping:backlink:${hash}`
}

function feedItemDate(link: FeedLink): string {
  return link.published_at ?? link.first_seen_at
}

function buildLinkedSnippet(link: FeedLink): string {
  const targetText = link.link_text || link.target_url
  const safeTargetUrl = escapeXml(link.target_url)
  const safeTargetText = escapeXml(targetText)

  if (link.context && link.link_text && link.context.includes(link.link_text)) {
    const idx = link.context.indexOf(link.link_text)
    const before = escapeXml(link.context.slice(0, idx))
    const after = escapeXml(link.context.slice(idx + link.link_text.length))
    return `${before}<a href="${safeTargetUrl}">${safeTargetText}</a>${after}`
  }

  if (link.context) {
    return `${escapeXml(link.context)}<br><a href="${safeTargetUrl}">${safeTargetText}</a>`
  }

  return `<a href="${safeTargetUrl}">${safeTargetText}</a>`
}

function buildItemDescription(link: FeedLink): string {
  return `<blockquote>${buildLinkedSnippet(link)}</blockquote>`
}

function buildFeed(domain: string, links: FeedLink[], origin: string): string {
  const feedUrl = absoluteUrl(origin, `/feed/${domain}.xml`)
  const queryUrl = absoluteUrl(origin, `/${domain}`)
  const lastBuildDate = links[0] ? feedItemDate(links[0]) : new Date().toISOString()

  const items = links.map((link) => {
    const title = `${link.blog_name} → ${domain}: ${link.post_title || link.post_url}`
    const guid = stableGuid(link)
    const description = buildItemDescription(link)

    return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link.post_url)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${formatRssDate(feedItemDate(link))}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`IndiePing: ${domain} 的 backlinks`)}</title>
    <link>${escapeXml(queryUrl)}</link>
    <description>${escapeXml(`IndiePing 找到的獨立部落格 backlinks，目標 domain: ${domain}`)}</description>
    <language>zh-TW</language>
    <lastBuildDate>${formatRssDate(lastBuildDate)}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`
}

app.get('/*', (c) => {
  const path = new URL(c.req.url).pathname
  const match = path.match(/^\/feed\/(.+)\.xml$/)
  if (!match) return c.text('not found', 404)

  const domain = normalizeDomain(match[1])
  if (!domain || domain.includes(' ') || !/^[^\s.]+(\.[^\s.]+)+$/.test(domain)) {
    return c.text('invalid domain', 400)
  }

  const db = getDb()
  const blog = db.prepare(`SELECT id FROM blogs WHERE domain = ?`).get(domain)
  if (!blog) return c.text('domain is not monitored by IndiePing', 404)

  const links = db.prepare(`
    SELECT
      l.id AS link_id,
      p.url AS post_url,
      p.title AS post_title,
      p.published_at,
      p.scanned_at,
      b.name AS blog_name,
      b.url AS blog_url,
      l.target_url,
      l.link_text,
      l.first_seen_at,
      l.last_seen_at,
      l.context
    FROM links l
    JOIN posts p ON p.id = l.post_id
    JOIN blogs b ON b.id = p.blog_id
    WHERE l.target_domain = ?
    ORDER BY COALESCE(p.published_at, l.first_seen_at) DESC, l.id DESC
    LIMIT 300
  `).all(domain) as FeedLink[]

  const uniqueLinks: FeedLink[] = []
  const seen = new Set<string>()
  for (const link of links) {
    const key = `${link.post_url}\0${link.target_url}`
    if (seen.has(key)) continue
    seen.add(key)
    uniqueLinks.push(link)
    if (uniqueLinks.length >= 100) break
  }

  const origin = new URL(c.req.url).origin
  return c.body(buildFeed(domain, uniqueLinks, origin), 200, {
    'Content-Type': 'application/rss+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  })
})

export default app
