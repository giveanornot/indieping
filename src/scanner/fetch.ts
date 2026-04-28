import RSSParser from 'rss-parser'
import { USER_AGENT } from '../utils.js'

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

const parser = new RSSParser({
  timeout: 60000,
  customFields: { item: ['content:encoded', 'content'] },
})

export interface RSSItem {
  url: string
  title: string
  publishedAt: string | null
  content: string | null
}

export interface FetchResult {
  items: RSSItem[]
  error?: string
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  let lastError: Error | null = null
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(60000),
        headers: { 'User-Agent': USER_AGENT },
      })
      return res
    } catch (e) {
      lastError = e as Error
      if (i < retries - 1) await sleep(1000 * (i + 1))
    }
  }
  throw lastError
}

export async function fetchRSS(rssUrl: string): Promise<FetchResult> {
  try {
    const feed = await parser.parseURL(rssUrl)
    const items: RSSItem[] = feed.items.map((item) => ({
      url: item.link ?? '',
      title: item.title ?? '',
      publishedAt: item.isoDate ?? item.pubDate ?? null,
      content: (item as unknown as Record<string, unknown>)['content:encoded'] as string | null
        ?? item.content as string | null
        ?? item.contentSnippet as string | null
        ?? null,
    }))
    return { items: items.filter((i) => i.url) }
  } catch (e) {
    return { items: [], error: String(e) }
  }
}

export async function fetchHTML(url: string): Promise<string | null> {
  try {
    const res = await fetchWithRetry(url)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const CANDIDATE_PATHS = [
  '/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feed/index.xml',
  '/feeds/posts/default',          // Blogger
  '/?feed=rss2', '/?feed=atom',    // WordPress
  '/blog/feed', '/blog/rss.xml',   // subdirectory blogs
  '/zh-tw/index.xml', '/zh/index.xml', '/en/index.xml',  // Hugo multilingual
  '/zh-tw/feed', '/zh/feed', '/en/feed',
]

function platformRssGuess(base: string): string | null {
  const url = new URL(base)
  // Substack: xxx.substack.com
  if (url.hostname.endsWith('.substack.com')) return `${base}/feed`
  // Ghost: ghost.io hosted
  if (url.hostname.endsWith('.ghost.io')) return `${base}/rss`
  // Medium user page: medium.com/@username
  const mediumUser = url.pathname.match(/^\/@([\w-]+)\/?$/)
  if (url.hostname === 'medium.com' && mediumUser) return `https://medium.com/feed/@${mediumUser[1]}`
  // Blogger
  if (url.hostname.endsWith('.blogspot.com')) return `${base}/feeds/posts/default`
  return null
}

export interface BlogInfo {
  rssUrl: string | null
  title: string | null
  reason?: 'not_found' | 'unreachable' | 'no_rss'
}

async function probeRssUrl(base: string): Promise<string | null> {
  const guessed = platformRssGuess(base)
  const urls = guessed
    ? [guessed, ...CANDIDATE_PATHS.map(p => base + p)]
    : CANDIDATE_PATHS.map(p => base + p)
  for (const url of urls) {
    try {
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': USER_AGENT } })
      const ct = r.headers.get('content-type') ?? ''
      if (r.ok && (ct.includes('rss') || ct.includes('atom') || ct.includes('xml'))) return url
    } catch { /* ignore */ }
  }
  return null
}

export async function discoverBlogInfo(siteUrl: string): Promise<BlogInfo> {
  const base = siteUrl.replace(/\/$/, '')
  const Q = `["']?`
  const VAL = `([^"'\\s>]+)`
  const TYPE_PAT = `(?:application/rss\\+xml|application/atom\\+xml)`

  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': USER_AGENT } })
    if (res.status === 404) return { rssUrl: null, title: null, reason: 'not_found' }
    if (res.ok) {
      const finalBase = res.url.replace(/\/$/, '')
      const html = await res.text()

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : null

      const typeFirst = html.match(new RegExp(`<link[^>]+type=${Q}${TYPE_PAT}${Q}[^>]*href=${Q}${VAL}${Q}`, 'i'))
      const hrefFirst = html.match(new RegExp(`<link[^>]+href=${Q}${VAL}${Q}[^>]*type=${Q}${TYPE_PAT}${Q}`, 'i'))
      const href = typeFirst?.[1] ?? hrefFirst?.[1]
      if (href) {
        const rssUrl = href.startsWith('http') ? href : new URL(href, finalBase).href
        return { rssUrl, title }
      }

      const rssUrl = await probeRssUrl(finalBase)
      return rssUrl ? { rssUrl, title } : { rssUrl: null, title, reason: 'no_rss' }
    }
  } catch { /* ignore */ }

  const rssUrl = await probeRssUrl(base)
  return rssUrl ? { rssUrl, title: null } : { rssUrl: null, title: null, reason: 'unreachable' }
}
