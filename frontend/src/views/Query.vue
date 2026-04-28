<template>
  <div>
    <n-h1>查詢 Backlink</n-h1>
    <p>輸入你的部落格網址，看看有哪些獨立部落格 link 了你。</p>
    <n-input-group>
      <n-input v-model:value="domain" placeholder="blog.giveanornot.com" @keyup.enter="search" />
      <n-button type="primary" :loading="loading" @click="search">查詢</n-button>
    </n-input-group>

    <n-alert v-if="flashConfirmed" type="success" style="margin-top: 16px">訂閱已確認，每日早上會收到 backlink 通知。</n-alert>
    <n-alert v-else-if="flashUnsubscribed" type="info" style="margin-top: 16px">已成功取消訂閱。</n-alert>

    <n-alert v-if="result && !result.inList" type="info" style="margin-top: 16px">
      <template #header>不在監控名單中</template>
      你的部落格已加入待審核清單。審核通過後，下次掃描即會開始監控。
    </n-alert>

    <template v-if="result?.inList">
      <n-divider />

      <template v-if="aggregated.length">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px">
          <n-h3 style="margin:0">找到 {{ result.links.length }} 個 backlink，來自 {{ aggregated.length }} 篇文章</n-h3>
          <!-- 訂閱功能暫時隱藏 -->
        </div>
        <n-list>
          <n-list-item v-for="post in aggregated" :key="post.post_url">
            <n-thing>
              <template #header>
                <a :href="post.post_url" target="_blank">{{ post.post_title || post.post_url }}</a>
              </template>
              <template #description>
                {{ post.blog_name }} &middot; {{ post.published_at?.slice(0, 10) }}
              </template>
              <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
                <n-text
                  v-for="(t, i) in post.targets"
                  :key="i"
                  depth="3"
                  style="font-size:13px"
                  v-html="inlineLink(t.url, t.linkText, t.context)"
                />
              </div>
            </n-thing>
          </n-list-item>
        </n-list>
      </template>
      <n-empty v-else description="目前沒有 backlink" style="margin-top: 32px" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { NAlert, NButton, NDivider, NEmpty, NH1, NH3, NInput, NInputGroup, NList, NListItem, NTag, NThing, NText } from 'naive-ui'
import { inlineLink } from '@/utils/links'

const route = useRoute()
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
}

interface AggregatedPost {
  post_url: string
  post_title: string
  blog_name: string
  published_at: string | null
  targets: { url: string; linkText: string; context: string }[]
}

const domain = ref('')
const loading = ref(false)
const result = ref<QueryResult | null>(null)
const email = ref('')
const subscribing = ref(false)
const subscribeStatus = ref<'idle' | 'sent' | 'already'>('idle')

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

async function search() {
  if (!domain.value.trim()) return
  loading.value = true
  subscribeStatus.value = 'idle'
  try {
    const res = await fetch(`/api/query?domain=${encodeURIComponent(domain.value.trim())}`)
    result.value = await res.json()
  } finally {
    loading.value = false
  }
}

async function subscribe() {
  if (!email.value.trim() || !result.value) return
  subscribing.value = true
  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: result.value.domain, email: email.value.trim() }),
    })
    const data = await res.json()
    subscribeStatus.value = data.status === 'already_confirmed' || data.status === 'pending' ? 'already' : 'sent'
  } finally {
    subscribing.value = false
  }
}
</script>
