import { setDefaultResultOrder, setServers } from 'dns'
setDefaultResultOrder('ipv4first')
setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4'])

import { getDb } from '../db/client.js'
import { initSchema } from '../db/schema.js'
import { fetchRSS, fetchHTML, sleep } from './fetch.js'
import { extractLinks, contentHash } from './extract.js'
import type { Blog } from '../types.js'

async function scanBlog(blog: Blog, blogDomains: Set<string>): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()
  const insertLink = db.prepare(
    `INSERT INTO links (post_id, target_url, target_domain, link_text, context, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )

  const { items, error } = await fetchRSS(blog.rss_url)

  if (error || items.length === 0) {
    const reason = error ?? 'empty feed'
    const newFails = blog.consecutive_fails + 1
    console.warn(`[scanner] ${blog.domain} fail (${newFails}x): ${reason}`)
    db.prepare(`UPDATE blogs SET consecutive_fails = ?, last_scanned_at = ? WHERE id = ?`)
      .run(newFails, now, blog.id)

    if (newFails >= 2 && blog.last_fail_notified_at?.slice(0, 10) !== now.slice(0, 10)) {
      db.prepare(`UPDATE blogs SET last_fail_notified_at = ? WHERE id = ?`).run(now, blog.id)
    }
    return
  }

  db.prepare(`UPDATE blogs SET consecutive_fails = 0, last_scanned_at = ? WHERE id = ?`)
    .run(now, blog.id)

  for (const item of items) {
    const existingPost = db.prepare(`SELECT id, content_hash FROM posts WHERE url = ?`).get(item.url) as
      | { id: number; content_hash: string }
      | undefined

    let html = item.content
    let source: 'rss' | 'fetch' = 'rss'

    if (!html) {
      await sleep(1000 + Math.random() * 1000)
      html = await fetchHTML(item.url)
      source = 'fetch'
    }

    if (!html) continue

    const hash = contentHash(html)
    if (existingPost?.content_hash === hash) continue

    const links = extractLinks(html, item.url).filter(l => blogDomains.has(l.targetDomain))

    if (existingPost) {
      const previousLinks = db.prepare(`
        SELECT target_url, MIN(first_seen_at) AS first_seen_at
        FROM links
        WHERE post_id = ?
        GROUP BY target_url
      `).all(existingPost.id) as { target_url: string; first_seen_at: string | null }[]
      const firstSeenByTarget = new Map(previousLinks.map(l => [l.target_url, l.first_seen_at ?? now]))

      db.prepare(`UPDATE posts SET content_hash = ?, scanned_at = ?, content_source = ? WHERE id = ?`)
        .run(hash, now, source, existingPost.id)
      db.transaction(() => {
        db.prepare(`DELETE FROM links WHERE post_id = ?`).run(existingPost.id)
        for (const l of links) {
          insertLink.run(existingPost.id, l.targetUrl, l.targetDomain, l.linkText, l.context, firstSeenByTarget.get(l.targetUrl) ?? now, now)
        }
      })()
    } else {
      const result = db.prepare(
        `INSERT INTO posts (blog_id, url, title, published_at, scanned_at, content_hash, content_source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(blog.id, item.url, item.title, item.publishedAt, now, hash, source)

      const postId = result.lastInsertRowid as number
      db.transaction(() => {
        for (const l of links) insertLink.run(postId, l.targetUrl, l.targetDomain, l.linkText, l.context, now, now)
      })()
    }
  }
}

export async function runScanner(): Promise<void> {
  initSchema()
  const db = getDb()
  const blogs = db.prepare(`SELECT * FROM blogs`).all() as Blog[]
  const blogDomains = new Set(blogs.map(b => b.domain))
  const concurrency = Number(process.env.SCANNER_CONCURRENCY ?? 32)
  console.log(`[scanner] scanning ${blogs.length} blogs (concurrency=${concurrency})`)

  const queue = [...blogs]
  let done = 0
  async function worker() {
    while (queue.length) {
      const blog = queue.shift()!
      console.log(`[scanner] ${blog.domain}`)
      await scanBlog(blog, blogDomains)
      done++
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  console.log(`[scanner] done (${done} blogs)`)
}

const isMain = process.argv[1]?.endsWith('scanner/index.ts') || process.argv[1]?.endsWith('scanner/index.js')
if (isMain) runScanner().catch((e: unknown) => { console.error(e); process.exit(1) })
