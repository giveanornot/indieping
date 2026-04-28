export interface Blog {
  id: number
  name: string
  url: string
  domain: string
  rss_url: string
  last_scanned_at: string | null
  consecutive_fails: number
  last_fail_notified_at: string | null
}

export interface Post {
  id: number
  blog_id: number
  url: string
  title: string
  published_at: string | null
  scanned_at: string
  content_hash: string
  content_source: 'rss' | 'fetch'
}

export interface Link {
  id: number
  post_id: number
  target_url: string
  target_domain: string
  context: string
}

export interface Subscription {
  id: number
  domain: string
  email: string
  token: string
  unsubscribe_token: string
  confirmed: number
  confirmed_at: string | null
  created_at: string
}

export interface PendingBlog {
  id: number
  domain: string
  url: string
  rss_url: string | null
  source: 'query' | 'manual'
  submitted_at: string
}

export interface LinkWithPost {
  link_id: number
  post_url: string
  post_title: string
  published_at: string | null
  blog_name: string
  blog_url: string
  target_url: string
  link_text: string
  context: string
}
