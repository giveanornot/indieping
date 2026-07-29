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

interface FeedItem {
  postUrl: string
  postTitle: string
  publishedAt: string | null
  blogName: string
  firstSeenAt: string
  links: FeedLink[]
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

function stableGuid(item: FeedItem): string {
  const hash = createHash('sha256')
    .update(item.postUrl)
    .update('\0')
    .update(item.firstSeenAt)

  for (const link of [...item.links].sort((a, b) => a.target_url.localeCompare(b.target_url))) {
    hash.update('\0').update(link.target_url)
  }

  const digest = hash.digest('hex').slice(0, 32)
  return `indieping:backlink:${digest}`
}

function formatDisplayDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(date)
}

function abbreviatedUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = decodeURIComponent(parsed.pathname).replace(/\/$/, '')
    return `${parsed.hostname.replace(/^www\./, '')}${path || ''}`
  } catch {
    return url
  }
}

function sourceTitle(item: FeedItem): string {
  return item.postTitle || abbreviatedUrl(item.postUrl)
}

function buildLinkedSnippet(link: FeedLink): string {
  const targetText = link.link_text || link.target_url
  const safeTargetUrl = escapeXml(link.target_url)
  const safeTargetText = escapeXml(targetText)

  const context = link.context.trim()
  const prefix = context.startsWith('…') ? '' : '…'
  const suffix = context.endsWith('…') ? '' : '…'

  if (context && link.link_text && context.includes(link.link_text)) {
    const idx = context.indexOf(link.link_text)
    const before = escapeXml(context.slice(0, idx))
    const after = escapeXml(context.slice(idx + link.link_text.length))
    return `${prefix}${before}<a href="${safeTargetUrl}">${safeTargetText}</a>${after}${suffix}`
  }

  if (context) {
    return `${prefix}${escapeXml(context)}${suffix}<br><a href="${safeTargetUrl}">${safeTargetText}</a>`
  }

  return `<a href="${safeTargetUrl}">${safeTargetText}</a>`
}

function buildItemDescription(item: FeedItem): string {
  const mentions = item.links
    .map((link) => `<li>${buildLinkedSnippet(link)}</li>`)
    .join('')
  const published = item.publishedAt
    ? `；文章發布於 ${formatDisplayDate(item.publishedAt)}`
    : ''

  return `<p>這篇文章提到你的網站：</p><ul>${mentions}</ul><p><small>IndiePing 發現於 ${formatDisplayDate(item.firstSeenAt)}${published}</small></p>`
}

function groupFeedItems(links: FeedLink[]): FeedItem[] {
  const items = new Map<string, FeedItem>()

  for (const link of links) {
    const key = `${link.post_url}\0${link.first_seen_at}`
    const item = items.get(key)
    if (item) {
      if (!item.links.some((existing) => existing.target_url === link.target_url)) item.links.push(link)
      continue
    }

    items.set(key, {
      postUrl: link.post_url,
      postTitle: link.post_title,
      publishedAt: link.published_at,
      blogName: link.blog_name,
      firstSeenAt: link.first_seen_at,
      links: [link],
    })
  }

  return [...items.values()].slice(0, 100)
}

function publicOrigin(requestUrl: string): string {
  const configured = process.env.BASE_URL?.trim()
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      console.warn('[feed] ignoring invalid BASE_URL')
    }
  }
  return new URL(requestUrl).origin
}

function buildFeed(domain: string, items: FeedItem[], origin: string): string {
  const feedUrl = absoluteUrl(origin, `/feed/${domain}`)
  const queryUrl = absoluteUrl(origin, `/${domain}`)
  const lastBuildDate = items[0] ? items[0].firstSeenAt : new Date().toISOString()

  const xmlItems = items.map((item) => {
    const title = `${item.blogName} 在〈${sourceTitle(item)}〉提到你`
    const guid = stableGuid(item)
    const description = buildItemDescription(item)

    return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(item.postUrl)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${formatRssDate(item.firstSeenAt)}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`誰提到 ${domain}｜IndiePing`)}</title>
    <link>${escapeXml(queryUrl)}</link>
    <description>${escapeXml(`IndiePing 新發現的 backlinks，目標 domain: ${domain}`)}</description>
    <language>zh-TW</language>
    <lastBuildDate>${formatRssDate(lastBuildDate)}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${xmlItems}
  </channel>
</rss>`
}

app.get('/*', (c) => {
  const path = new URL(c.req.url).pathname
  const legacyMatch = path.match(/^\/feed\/(.+)\.xml$/)
  const match = path.match(/^\/feed\/(.+)$/)
  const rawDomain = legacyMatch?.[1] ?? match?.[1]
  if (!rawDomain) return c.text('not found', 404)

  const domain = normalizeDomain(rawDomain)
  if (!domain || domain.includes(' ') || !/^[^\s.]+(\.[^\s.]+)+$/.test(domain)) {
    return c.text('invalid domain', 400)
  }

  if (legacyMatch) return c.redirect(`/feed/${domain}`, 308)

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
    ORDER BY l.first_seen_at DESC, l.id DESC
    LIMIT 500
  `).all(domain) as FeedLink[]

  const items = groupFeedItems(links)

  const origin = publicOrigin(c.req.url)
  return c.body(buildFeed(domain, items, origin), 200, {
    'Content-Type': 'application/rss+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  })
})

export default app
