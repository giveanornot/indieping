import { getDb } from './db/client.js'
import { initSchema } from './db/schema.js'
import { sendDigest } from './mailer/index.js'
import type { LinkWithPost, Subscription } from './types.js'

export async function runDigest(): Promise<void> {
  initSchema()
  const db = getDb()

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const since = yesterday.toISOString().slice(0, 10)

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
      l.target_domain,
      l.context
    FROM links l
    JOIN posts p ON p.id = l.post_id
    JOIN blogs b ON b.id = p.blog_id
    WHERE DATE(p.scanned_at) >= ?
  `).all(since) as (LinkWithPost & { target_domain: string })[]

  const byDomain = new Map<string, typeof links>()
  for (const link of links) {
    const arr = byDomain.get(link.target_domain) ?? []
    arr.push(link)
    byDomain.set(link.target_domain, arr)
  }

  const subs = db.prepare(`SELECT * FROM subscriptions WHERE confirmed = 1`).all() as Subscription[]

  let sent = 0
  for (const sub of subs) {
    const domainLinks = byDomain.get(sub.domain)
    if (!domainLinks || domainLinks.length === 0) continue
    await sendDigest(sub.domain, sub.email, sub.unsubscribe_token, domainLinks)
    sent++
    console.log(`[digest] sent to ${sub.email} for ${sub.domain} (${domainLinks.length} links)`)
  }

  console.log(`[digest] done, sent ${sent} emails`)
}

const isMain = process.argv[1]?.endsWith('digest.ts') || process.argv[1]?.endsWith('digest.js')
if (isMain) runDigest().catch((e: unknown) => { console.error(e); process.exit(1) })
