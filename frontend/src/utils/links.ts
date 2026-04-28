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
  if (linkText && context.includes(linkText)) {
    const idx = context.indexOf(linkText)
    const before = escapeHtml(context.slice(0, idx))
    const after = escapeHtml(context.slice(idx + linkText.length))
    return `${before}<a href="${safeUrl}" target="_blank" rel="noopener">${display}</a>${after}`
  }
  const ctx = context ? ' ' + escapeHtml(context) : ''
  return `<a href="${safeUrl}" target="_blank" rel="noopener">${display}</a>${ctx}`
}
