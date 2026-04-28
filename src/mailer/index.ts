import Mailgun from 'mailgun.js'
import FormData from 'form-data'
import type { Blog, LinkWithPost } from '../types.js'

const mailgun = new Mailgun(FormData)

function getClient() {
  return mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY ?? '' })
}

const FROM = `IndiePing <noreply@${process.env.MAILGUN_DOMAIN}>`
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

export async function sendDigest(
  domain: string,
  email: string,
  unsubscribeToken: string,
  links: LinkWithPost[]
): Promise<void> {
  const mg = getClient()
  const domain_mg = process.env.MAILGUN_DOMAIN ?? ''

  // aggregate by post
  const postMap = new Map<string, { title: string; blogName: string; targets: typeof links }>()
  for (const l of links) {
    if (!postMap.has(l.post_url)) postMap.set(l.post_url, { title: l.post_title, blogName: l.blog_name, targets: [] })
    postMap.get(l.post_url)!.targets.push(l)
  }

  const rows = [...postMap.entries()].map(([postUrl, post]) => {
    const targets = post.targets.map(t => {
      const display = t.link_text || new URL(t.target_url).hostname.replace(/^www\./, '')
      return `&nbsp;&nbsp;→ <a href="${t.target_url}">${display}</a>${t.context ? ` <small style="color:#888">${t.context}</small>` : ''}`
    }).join('<br>\n')
    return `<p style="margin:12px 0 4px">• <a href="${postUrl}">${post.title || postUrl}</a> <span style="color:#888;font-size:13px">(${post.blogName})</span><br>\n${targets}</p>`
  }).join('\n')

  const html = `
    <p>有 ${postMap.size} 篇獨立部落格文章 link 了 <strong>${domain}</strong>：</p>
    ${rows}
    <hr>
    <p><small><a href="${BASE_URL}/api/unsubscribe/${unsubscribeToken}">取消訂閱</a></small></p>
  `

  await mg.messages.create(domain_mg, {
    from: FROM,
    to: email,
    subject: `[indieping] ${domain} 收到 ${links.length} 個新 backlink`,
    html,
  })
}

export async function sendConfirmation(email: string, token: string): Promise<void> {
  const mg = getClient()
  const domain_mg = process.env.MAILGUN_DOMAIN ?? ''
  const confirmUrl = `${BASE_URL}/api/confirm/${token}`

  await mg.messages.create(domain_mg, {
    from: FROM,
    to: email,
    subject: '[indieping] 確認訂閱',
    html: `<p>請點擊以下連結確認訂閱：</p><p><a href="${confirmUrl}">${confirmUrl}</a></p>`,
  })
}

export async function sendAdminAlert(blog: Blog): Promise<void> {
  const mg = getClient()
  const domain_mg = process.env.MAILGUN_DOMAIN ?? ''
  const adminEmail = process.env.ADMIN_EMAIL ?? ''
  if (!adminEmail) return

  await mg.messages.create(domain_mg, {
    from: FROM,
    to: adminEmail,
    subject: `[indieping] ${blog.domain} RSS 連續失敗 ${blog.consecutive_fails} 次`,
    text: `blog: ${blog.url}\nrss: ${blog.rss_url}`,
  })
}
