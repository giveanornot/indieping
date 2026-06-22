<template>
  <div>
    <n-h1>查詢 Backlink</n-h1>
    <p>輸入你的部落格網址，看看有哪些獨立部落格 link 了你。</p>
    <n-input-group>
      <n-input v-model:value="domain" placeholder="blog.giveanornot.com" :status="validationError ? 'error' : undefined" @keyup.enter="search" />
      <n-button type="primary" :loading="loading" @click="search">查詢</n-button>
    </n-input-group>
    <n-text v-if="validationError" type="error" style="font-size: 13px; margin-top: 4px; display: block">{{ validationError }}</n-text>

    <n-alert v-if="flashConfirmed" type="success" style="margin-top: 16px">訂閱已確認，每日早上會收到 backlink 通知。</n-alert>
    <n-alert v-else-if="flashUnsubscribed" type="info" style="margin-top: 16px">已成功取消訂閱。</n-alert>

    <Transition name="fade">
      <n-alert v-if="result && !result.inList && (result.reason === 'not_found' || result.reason === 'unreachable')" type="error" style="margin-top: 16px">
        <template #header>找不到這個網站</template>
        連線失敗，請確認網址是否正確，或網站是否正常運作。
      </n-alert>
      <div v-else-if="result && !result.inList && result.reason === 'no_rss'">
        <n-alert type="warning" style="margin-top: 16px">
          <template #header>沒有 RSS Feed</template>
          自動找不到 RSS，如果你知道 RSS 網址的話可以在這裡提供：
        </n-alert>
        <n-input-group style="margin-top: 8px">
          <n-input v-model:value="rssInput" placeholder="https://example.com/feed.xml" :disabled="rssSubmitted" @keyup.enter="submitRss" />
          <n-button :loading="rssSubmitting" :disabled="rssSubmitted" @click="submitRss">提交</n-button>
        </n-input-group>
        <n-text v-if="rssSubmitted" type="success" style="font-size: 13px; margin-top: 4px; display: block">已收到，等 JN 確認之後就會出現了~~</n-text>
        <n-text v-else-if="rssError" type="error" style="font-size: 13px; margin-top: 4px; display: block">{{ rssError }}</n-text>
      </div>
      <n-alert v-else-if="result && !result.inList" type="info" style="margin-top: 16px">
        <template #header>你的部落格還不在清單中 >&lt;</template>
        你的部落格已加入待審核清單。等 JN 確認之後就會出現了~~
      </n-alert>
    </Transition>

    <Transition name="fade">
      <div v-if="result?.inList">
        <n-divider />
        <n-h3 style="margin-bottom: 12px">找到 {{ result.links.length }} 個 backlink，來自 {{ aggregated.length }} 篇文章</n-h3>
        <n-data-table
          :columns="columns"
          :data="aggregated"
          :scroll-x="980"
          :row-key="(r: AggregatedPost) => r.post_url"
        />
      </div>
    </Transition>

    <n-collapse style="margin-top: 16px" :default-expanded-names="['notes']">
      <n-collapse-item title="注意事項" name="notes">
        <ul style="margin: 0; padding-left: 20px; line-height: 2">
          <li>系統會把不同的 subdomain 認成不同的 domain，所以有 subdomain 的要完整輸入哦！<br>（例如 <code>blog.giveanornot.com</code> 而非 <code>giveanornot.com</code>）</li>
          <li>如果使用的是手機的話，可以左右拖動表格~</li>
          <li>部落格必須提供 RSS Feed 才能加入清單</li>
          <li>RSS 只有摘要（無全文）的部落格，文章中的 link 無法被偵測</li>
          <li>申請後通常一天內通過~ 如果一直沒有通過的話，通常是 RSS 有問題！</li>
          <li>如果有任何問題或建議，歡迎寄信到 blog@giveanornot.com</li>
        </ul>
      </n-collapse-item>
    </n-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NCollapse, NCollapseItem, NDataTable, NDivider, NH1, NH3, NInput, NInputGroup, NText } from 'naive-ui'
import { inlineLink } from '@/utils/links'

const route = useRoute()
const router = useRouter()
const flashConfirmed = computed(() => route.query.confirmed === '1')
const flashUnsubscribed = computed(() => route.query.unsubscribed === '1')

interface LinkResult {
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

interface QueryResult {
  domain: string
  inList: boolean
  links: LinkResult[]
  reason?: 'pending' | 'no_rss' | 'not_found' | 'unreachable'
}

interface AggregatedPost {
  post_url: string
  post_title: string
  blog_name: string
  published_at: string | null
  targets: { url: string; linkText: string; context: string }[]
}

const domain = ref((route.params.domain as string) || 'blog.giveanornot.com')
const loading = ref(false)
const result = ref<QueryResult | null>(null)
const rssInput = ref('')
const rssSubmitting = ref(false)
const rssSubmitted = ref(false)
const rssError = ref<string | null>(null)

function normalizeDomain(input: string): string {
  return input
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase()
    .trim()
}

const validationError = ref<string | null>(null)

function validate(): boolean {
  const v = normalizeDomain(domain.value)
  if (!v || (v.includes(' ') || !/^[^\s.]+(\.[^\s.]+)+$/.test(v))) {
    validationError.value = '看起來不像是有效的 domain，例如 blog.example.com'
    return false
  }
  validationError.value = null
  return true
}

const aggregated = computed<AggregatedPost[]>(() => {
  if (!result.value?.links) return []
  const map = new Map<string, AggregatedPost>()
  for (const r of result.value.links) {
    if (!map.has(r.post_url)) {
      map.set(r.post_url, {
        post_url: r.post_url,
        post_title: r.post_title,
        blog_name: r.blog_name,
        published_at: r.published_at,
        targets: [],
      })
    }
    map.get(r.post_url)!.targets.push({ url: r.target_url, linkText: r.link_text, context: r.context })
  }
  return [...map.values()]
})

const columns = [
  {
    title: '來源文章',
    key: 'post_title',
    width: 320,
    render: (r: AggregatedPost) =>
      h('div', [
        h('a', { href: r.post_url, target: '_blank', style: 'color: inherit; display: block' }, r.post_title || r.post_url),
        h('span', { style: 'color: var(--n-text-color-3); font-size: 12px' }, r.published_at?.slice(0, 10) ?? ''),
      ]),
  },
  {
    title: 'Blog',
    key: 'blog_name',
    width: 160,
    render: (r: AggregatedPost) => r.blog_name,
  },
  {
    title: 'Context',
    key: 'targets',
    width: 400,
    render: (r: AggregatedPost) =>
      h('div', { style: 'display:flex;flex-direction:column;gap:6px;padding:4px 0' },
        r.targets.map(t =>
          h('span', { style: 'color:var(--n-text-color-2);font-size:13px', innerHTML: inlineLink(t.url, t.linkText, t.context) })
        )
      ),
  },
  {
    title: '日期',
    key: 'published_at',
    width: 100,
    render: (r: AggregatedPost) => r.published_at?.slice(0, 10) ?? '—',
  },
]

async function search() {
  const normalized = normalizeDomain(domain.value)
  if (!normalized || !validate()) return
  domain.value = normalized
  router.replace(`/${normalized}`)
  rssInput.value = ''
  rssSubmitted.value = false
  rssError.value = null
  loading.value = true
  try {
    const res = await fetch(`/api/query?domain=${encodeURIComponent(normalized)}`)
    result.value = await res.json()
  } finally {
    loading.value = false
  }
}

const RSS_ERRORS: Record<string, string> = {
  invalid_url: '請輸入有效的網址（http 或 https 開頭）',
  not_rss: '這個網址看起來不是 RSS Feed',
  fetch_failed: '無法連線到這個網址，請確認是否正確',
  unreachable: '無法連線到這個網址，請確認是否正確',
}

async function submitRss() {
  if (!rssInput.value.trim() || !result.value) return
  rssSubmitting.value = true
  rssError.value = null
  try {
    const res = await fetch('/api/query/rss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: result.value.domain, rssUrl: rssInput.value.trim() }),
    })
    if (!res.ok) {
      const data = await res.json()
      rssError.value = RSS_ERRORS[data.error] ?? '發生錯誤，請稍後再試'
    } else {
      rssSubmitted.value = true
    }
  } finally {
    rssSubmitting.value = false
  }
}

onMounted(() => {
  if (route.params.domain) search()
})

watch(() => route.params.domain, (d) => {
  if (!d) {
    domain.value = 'blog.giveanornot.com'
    result.value = null
  }
})

watch(domain, () => {
  validationError.value = null
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
