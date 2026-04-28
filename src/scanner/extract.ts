import { load } from 'cheerio'
import { createHash } from 'crypto'

export interface ExtractedLink {
  targetUrl: string
  targetDomain: string
  linkText: string
  context: string
}

export function extractLinks(html: string, sourceUrl: string): ExtractedLink[] {
  const $ = load(html)
  const sourceHost = safeHost(sourceUrl)
  const links: ExtractedLink[] = []

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return

    let resolved: string
    try {
      resolved = new URL(href, sourceUrl).href
    } catch {
      return
    }

    const targetHost = safeHost(resolved)
    if (!targetHost || targetHost === sourceHost) return

    const linkText = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 200)
    const context = getContext($, el)
    links.push({ targetUrl: resolved, targetDomain: targetHost, linkText, context })
  })

  return links
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function getContext($: ReturnType<typeof load>, el: ReturnType<typeof $>[0]): string {
  const parent = $(el).parent().text()
  const linkText = $(el).text()
  const idx = parent.indexOf(linkText)
  if (idx === -1) return linkText.slice(0, 80)
  const start = Math.max(0, idx - 20)
  const end = Math.min(parent.length, idx + linkText.length + 20)
  return parent.slice(start, end).replace(/\s+/g, ' ').trim()
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}
