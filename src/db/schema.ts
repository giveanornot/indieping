import { getDb } from './client.js'

export function initSchema(): void {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS blogs (
      id                    INTEGER PRIMARY KEY,
      name                  TEXT NOT NULL,
      url                   TEXT NOT NULL,
      domain                TEXT NOT NULL UNIQUE,
      rss_url               TEXT NOT NULL,
      last_scanned_at       DATETIME,
      consecutive_fails      INTEGER NOT NULL DEFAULT 0,
      last_fail_notified_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS posts (
      id             INTEGER PRIMARY KEY,
      blog_id        INTEGER NOT NULL REFERENCES blogs(id),
      url            TEXT NOT NULL UNIQUE,
      title          TEXT NOT NULL,
      published_at   DATETIME,
      scanned_at     DATETIME NOT NULL,
      content_hash   TEXT NOT NULL,
      content_source TEXT NOT NULL CHECK(content_source IN ('rss', 'fetch'))
    );

    CREATE TABLE IF NOT EXISTS links (
      id            INTEGER PRIMARY KEY,
      post_id       INTEGER NOT NULL REFERENCES posts(id),
      target_url    TEXT NOT NULL,
      target_domain TEXT NOT NULL,
      context       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id                INTEGER PRIMARY KEY,
      domain            TEXT NOT NULL,
      email             TEXT NOT NULL,
      token             TEXT NOT NULL UNIQUE,
      unsubscribe_token TEXT NOT NULL UNIQUE,
      confirmed         INTEGER NOT NULL DEFAULT 0,
      confirmed_at      DATETIME,
      created_at        DATETIME NOT NULL,
      UNIQUE(domain, email)
    );

    CREATE TABLE IF NOT EXISTS pending_blogs (
      id           INTEGER PRIMARY KEY,
      domain       TEXT NOT NULL UNIQUE,
      url          TEXT NOT NULL,
      name         TEXT,
      rss_url      TEXT,
      source       TEXT NOT NULL CHECK(source IN ('query', 'manual')),
      submitted_at DATETIME NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_blogs_domain ON blogs(domain);
    CREATE INDEX IF NOT EXISTS idx_links_target_domain ON links(target_domain);
    CREATE INDEX IF NOT EXISTS idx_posts_blog_id ON posts(blog_id);
  `)

  try { db.exec(`ALTER TABLE pending_blogs ADD COLUMN name TEXT`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE links ADD COLUMN link_text TEXT NOT NULL DEFAULT ''`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE blogs RENAME COLUMN consecutive_fail_days TO consecutive_fails`) } catch { /* already exists */ }
}
