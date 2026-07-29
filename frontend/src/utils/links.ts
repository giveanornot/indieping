export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function cleanLinkText(text: string): string {
  if (!text.startsWith('http://') && !text.startsWith('https://')) return text
  try {
    const u = new URL(text)
    const path = u.pathname.replace(/\/$/, '')
    return u.hostname.replace(/^www\./, '') + (path || '')
  } catch { return text }
}

export function inlineLink(url: string, linkText: string, context: string): string {
  const safeUrl = escapeHtml(url)
  let fallback = url
  try { fallback = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep url */ }
  const display = escapeHtml(cleanLinkText(linkText || fallback))
  const trimmedContext = context.trim()
  const prefix = trimmedContext && !trimmedContext.startsWith('…') ? '…' : ''
  const suffix = trimmedContext && !trimmedContext.endsWith('…') ? '…' : ''
  if (linkText && trimmedContext.includes(linkText)) {
    const idx = trimmedContext.indexOf(linkText)
    const before = escapeHtml(trimmedContext.slice(0, idx))
    const after = escapeHtml(trimmedContext.slice(idx + linkText.length))
    return `${prefix}${before}<a href="${safeUrl}" target="_blank" rel="noopener">${display}</a>${after}${suffix}`
  }
  const ctx = trimmedContext ? ` ${prefix}${escapeHtml(trimmedContext)}${suffix}` : ''
  return `<a href="${safeUrl}" target="_blank" rel="noopener">${display}</a>${ctx}`
}
