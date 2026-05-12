# 海巡小精靈 — 設計文件

> 最後更新：2026-05-12

---

## 產品定義

輸入部落格 domain，查詢獨立部落格名單中誰 link 了你。可訂閱 email 通知，每天早上收到 digest。

---

## Tech Stack

| 層級         | 技術                                         |
| ------------ | -------------------------------------------- |
| 後端         | Node.js + TypeScript + Hono                  |
| 前端         | Vue 3 + Vite + Naive UI + Vue Router         |
| 資料庫       | SQLite (better-sqlite3)                      |
| RSS parsing  | rss-parser                                   |
| HTML parsing | cheerio                                      |
| Email        | Mailgun (mailgun.js)                         |
| Admin 驗證   | HTTP Basic Auth（`ADMIN_PASSWORD` 環境變數） |
| 排程         | In-process scheduler（web server 內建）      |
| Process 管理 | systemd（單一 web service）                  |

---

## 目錄結構

```
indieping/
├── src/
│   ├── db/
│   │   ├── schema.ts           # table 定義與 migration
│   │   └── client.ts           # better-sqlite3 singleton
│   ├── scanner/
│   │   ├── index.ts            # scanner entry point（可獨立執行或被 import）
│   │   ├── fetch.ts            # RSS fetch + HTML fetch + RSS discovery
│   │   └── extract.ts          # link 抽取 (cheerio)
│   ├── web/
│   │   ├── index.ts            # Hono entry point + scheduler 啟動
│   │   └── routes/
│   │       ├── query.ts        # GET /api/query?domain=
│   │       ├── subscribe.ts    # POST /api/subscribe, confirm, unsubscribe
│   │       └── admin.ts        # /api/admin/*
│   ├── mailer/
│   │   └── index.ts            # sendDigest / sendConfirmation / sendAdminAlert
│   ├── scheduler.ts            # 定時執行 scanner / digest
│   ├── digest.ts               # digest entry point
│   └── utils.ts                # normalizeDomain, USER_AGENT
├── frontend/
│   ├── src/
│   │   ├── views/
│   │   │   ├── Query.vue
│   │   │   └── admin/
│   │   │       ├── Pending.vue
│   │   │       ├── Blogs.vue
│   │   │       ├── Subscriptions.vue
│   │   │       └── Links.vue
│   │   ├── utils/
│   │   │   └── links.ts        # inlineLink, escapeHtml, cleanLinkText
│   │   ├── App.vue
│   │   └── main.ts
│   ├── index.html
│   └── vite.config.ts
├── scripts/
│   ├── import.ts               # 匯入部落格（JSON [{name, url}]）
│   └── refresh-blog-names.ts  # 重新抓取所有部落格標題
├── data/
│   └── blogroll.json           # 種子部落格清單（gitignored）
├── deploy/
│   └── indieping.service  # systemd web service
├── data/
│   └── blogs.db
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Database Schema

```sql
blogs (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT,
  url                   TEXT,
  domain                TEXT UNIQUE,
  rss_url               TEXT,
  last_scanned_at       DATETIME,
  consecutive_fails     INTEGER DEFAULT 0,
  last_fail_notified_at DATETIME
)

posts (
  id             INTEGER PRIMARY KEY,
  blog_id        INTEGER REFERENCES blogs(id),
  url            TEXT UNIQUE,
  title          TEXT,
  published_at   DATETIME,
  scanned_at     DATETIME,
  content_hash   TEXT,         -- SHA256，內容未變則跳過
  content_source TEXT          -- 'rss' | 'fetch'
)

links (
  id            INTEGER PRIMARY KEY,
  post_id       INTEGER REFERENCES posts(id),
  target_url    TEXT,
  target_domain TEXT,
  link_text     TEXT,
  context       TEXT           -- link 前後各 ~20 字
)

subscriptions (
  id                INTEGER PRIMARY KEY,
  domain            TEXT,
  email             TEXT,
  token             TEXT UNIQUE,
  unsubscribe_token TEXT UNIQUE,
  confirmed         INTEGER DEFAULT 0,
  confirmed_at      DATETIME,
  created_at        DATETIME,
  UNIQUE(domain, email)
)

pending_blogs (
  id           INTEGER PRIMARY KEY,
  domain       TEXT UNIQUE,
  url          TEXT,
  name         TEXT,
  rss_url      TEXT,
  source       TEXT,           -- 'query' | 'manual'
  submitted_at DATETIME
)
```

---

## Scanner 邏輯

**排程：** 每 `SCAN_INTERVAL_HOURS` 小時執行一次（預設 6 小時）

**流程：**
1. 讀取所有 blogs，建立 domain Set（用於過濾）
2. 並行抓 RSS（`SCANNER_CONCURRENCY`，預設 32）
3. 比對 `content_hash`，一致則跳過
4. RSS 有內文 → 直接 parse；沒有 → fetch 原始 HTML
5. 用 cheerio 抽 `<a href>`，只保留指向名單內 domain 的連結
6. 記錄 `link_text`（連結文字）與 context（前後各 ~20 字）

**失敗處理：** `consecutive_fails >= 2` 且當天未通知 → 寄信給 admin

---

## Digest 邏輯

**排程：** 每天 `DIGEST_HOUR` 點（預設 6 點）

**流程：**
1. 查昨天新增的 links
2. 依 domain 分組，比對已確認訂閱
3. 每個有新 link 的 domain 各寄一封（依文章 aggregate）
4. 信尾附 unsubscribe 連結

---

## API Routes

| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/api/query?domain=` | 查詢 backlink；回傳 `reason`（pending/no_rss/not_found/unreachable）；後兩者不寫 pending_blogs |
| POST | `/api/query/rss` | 手動提交 RSS URL；HEAD 驗證確認是 RSS/XML 後存入 pending_blogs |
| POST | `/api/subscribe` | 訂閱（寄確認信） |
| GET | `/api/confirm/:token` | 確認訂閱 |
| GET | `/api/unsubscribe/:token` | 退訂 |
| GET | `/api/admin/pending` | 待審核名單 |
| POST | `/api/admin/pending/discover` | 批次探索所有 pending 的 RSS |
| POST | `/api/admin/pending/discover-one` | 探索單一 pending 的 RSS |
| POST | `/api/admin/pending/:id/approve` | 核准 |
| POST | `/api/admin/pending/:id/reject` | 拒絕 |
| PATCH | `/api/admin/pending/:id` | 更新 rss_url |
| GET | `/api/admin/blogs` | blogs 列表 |
| PATCH | `/api/admin/blogs/:id` | 編輯 blog |
| DELETE | `/api/admin/blogs/:id` | 刪除 blog（cascade） |
| GET | `/api/admin/subscriptions` | 訂閱清單 |
| DELETE | `/api/admin/subscriptions/:id` | 刪除訂閱 |
| GET | `/api/admin/links` | links 總覽（分頁、排序、filter） |

---

## Frontend Routes

| Path | View | 說明 |
| --- | --- | --- |
| `/:domain?` | Query.vue | 查詢 backlink；帶 domain 時自動查詢，URL 可直接分享 |
| `/admin` | → redirect | 跳轉到 `/admin/pending` |
| `/admin/pending` | Pending.vue | 待審核部落格 |
| `/admin/blogs` | Blogs.vue | 部落格名單管理 |
| `/admin/subs` | Subscriptions.vue | 訂閱清單 |
| `/admin/links` | Links.vue | Links 總覽 |

Admin 頁面不在 nav bar 顯示，直接輸入網址進入。

---

## Pending Blog 流程

部落格進入名單的兩條路徑：

### 1. 使用者查詢觸發

- 使用者在查詢頁輸入一個不在名單的 domain
- 系統嘗試自動探索 RSS URL
  - `not_found` / `unreachable`：回傳錯誤，**不**寫入 pending_blogs
  - `no_rss`：寫入 pending_blogs（rss_url 為 null），前端顯示手動輸入 RSS URL 的欄位
  - 找到 RSS：寫入 pending_blogs（含 rss_url），狀態為 `pending`
- Admin 在 Pending 頁面核准後進入 `blogs`

### 2. 手動匯入

- 執行 `scripts/import-blogroll.ts` 或 `import-from-urls.ts`
- 找到 RSS 的直接進 `blogs`；找不到的進 `pending_blogs`
- 在 Pending 頁面點「探索 RSS」再核准

---

## 環境變數

| 變數                  | 預設值                  | 說明                       |
| --------------------- | ----------------------- | -------------------------- |
| `PORT`                | `3000`                  | Web server port            |
| `BASE_URL`            | `http://localhost:3000` | 用於 email 連結            |
| `ADMIN_PASSWORD`      | （空，不驗證）          | Admin Basic Auth 密碼      |
| `MAILGUN_API_KEY`     | —                       | Mailgun API key            |
| `MAILGUN_DOMAIN`      | —                       | Mailgun 寄件 domain        |
| `ADMIN_EMAIL`         | —                       | 接收 RSS 失敗通知的 email  |
| `SCAN_INTERVAL_HOURS` | `6`                     | Scanner 執行間隔（小時）   |
| `DIGEST_HOUR`         | `6`                     | Digest 每天寄出時間（24h） |
| `SCANNER_CONCURRENCY` | `32`                    | Scanner 並行數             |

---

## 部署

### 1. 建置前端

```bash
npm run build --prefix frontend
```

### 2. 設定環境變數

```bash
cp .env.example .env
# 編輯 .env，填入 ADMIN_PASSWORD、MAILGUN_* 等
```

### 3. 安裝 systemd service

```bash
sudo cp deploy/indieping.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now indieping
```

### 4. 確認狀態

```bash
sudo systemctl status indieping
journalctl -u indieping -f
```

### 更新部署

```bash
git pull
npm run build --prefix frontend
sudo systemctl restart indieping
```

---

Web server 啟動時自動排程 scanner 與 digest，不需要額外的 timer。

**靜態檔：** Vite build 輸出 `frontend/dist/`，Hono serve static。

**Admin 保護：** 設定 `ADMIN_PASSWORD` 後，`/api/admin/*` 要求 Basic Auth。

---

## 已知待處理事項

- 某些 RSS feed content 含動態時間戳，`content_hash` 每次不同，觸發不必要重掃
- 資料庫備份策略
- 訂閱功能（UI 暫時隱藏，API 已完成）
