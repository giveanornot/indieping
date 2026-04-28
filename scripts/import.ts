/**
 * Usage: tsx scripts/import.ts <file.json> [concurrency=8]
 *
 * File format: [{ "name": "...", "url": "..." }, ...]
 */
import { readFileSync } from 'fs'
import { getDb } from '../src/db/client.js'
import { initSchema } from '../src/db/schema.js'
import { discoverBlogInfo } from '../src/scanner/fetch.js'
import { normalizeDomain } from '../src/utils.js'

const filePath = process.argv[2]
const CONCURRENCY = Number(process.argv[3] ?? 8)
if (!filePath) {
  console.error('Usage: tsx scripts/import.ts <file.json> [concurrency]')
  process.exit(1)
}

initSchema()
const db = getDb()

interface Entry { name: string; url: string }

const entries = JSON.parse(readFileSync(filePath, 'utf-8')) as Entry[]

const insertBlog = db.prepare(`INSERT OR IGNORE INTO blogs (name, url, domain, rss_url) VALUES (?, ?, ?, ?)`)
const insertPending = db.prepare(
  `INSERT OR IGNORE INTO pending_blogs (name, url, domain, rss_url, source, submitted_at) VALUES (?, ?, ?, ?, 'manual', ?)`
)

const unique = [...new Map(
  entries.map(e => {
    try { return [new URL(e.url).hostname.replace(/^www\./, ''), e] as const } catch { return null }
  }).filter(Boolean) as [string, Entry][]
).values()]

let added = 0, pending = 0, skipped = 0, failed = 0

async function processEntry(entry: Entry) {
  const domain = normalizeDomain(entry.url)
  const existsBlog = db.prepare(`SELECT id FROM blogs WHERE domain = ?`).get(domain)
  const existsPending = db.prepare(`SELECT id FROM pending_blogs WHERE domain = ?`).get(domain)
  if (existsBlog || existsPending) { console.log(`  skip  ${domain}`); skipped++; return }

  try {
    const { rssUrl, title } = await discoverBlogInfo(entry.url)
    const name = entry.name || title || domain
    if (rssUrl) {
      insertBlog.run(name, entry.url, domain, rssUrl)
      console.log(`  added ${domain}  →  ${rssUrl}`)
      added++
    } else {
      insertPending.run(name, entry.url, domain, null, new Date().toISOString())
      console.log(`  pend  ${domain}  (no RSS)`)
      pending++
    }
  } catch (e) {
    console.log(`  fail  ${domain}  ${(e as Error).message}`)
    failed++
  }
}

console.log(`discovering RSS for ${unique.length} entries (concurrency=${CONCURRENCY})`)
const queue = [...unique]
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) await processEntry(queue.shift()!)
}))
console.log(`\ndone: ${added} added, ${pending} pending, ${skipped} skipped, ${failed} failed`)
