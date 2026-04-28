<template>
  <div>
    <n-h2>待審核部落格</n-h2>
    <n-input v-model:value="filter" placeholder="篩選 domain 或名稱" clearable style="max-width:300px;margin-bottom:16px" />
    <n-data-table :columns="columns" :data="filteredItems" :loading="loading" :scroll-x="860" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { NButton, NDataTable, NH2, NInput } from 'naive-ui'

interface PendingBlog {
  id: number
  name: string | null
  domain: string
  url: string
  rss_url: string | null
  source: string
  submitted_at: string
}

const items = ref<PendingBlog[]>([])
const loading = ref(false)
const filter = ref('')
const discoveringIds = ref(new Set<number>())

const filteredItems = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(b => b.domain.includes(q) || (b.name ?? '').toLowerCase().includes(q))
})

async function load() {
  loading.value = true
  const res = await fetch('/api/admin/pending')
  items.value = await res.json()
  loading.value = false
}

async function discoverOne(row: PendingBlog) {
  discoveringIds.value = new Set([...discoveringIds.value, row.id])
  const { rssUrl, title } = await fetch(`/api/admin/pending/discover-one`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: row.id }),
  }).then(r => r.json())
  discoveringIds.value = new Set([...discoveringIds.value].filter(i => i !== row.id))
  if (rssUrl) { row.rss_url = rssUrl; if (title && !row.name) row.name = title }
}

async function approve(id: number) {
  const res = await fetch(`/api/admin/pending/${id}/approve`, { method: 'POST' })
  if (!res.ok) { const d = await res.json(); alert(d.error); return }
  await load()
}

async function reject(id: number, domain: string) {
  if (!window.confirm(`確定要拒絕 ${domain}？`)) return
  await fetch(`/api/admin/pending/${id}/reject`, { method: 'POST' })
  await load()
}

async function updateRss(id: number, rss_url: string) {
  await fetch(`/api/admin/pending/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rss_url }),
  })
}

const columns = [
  {
    title: 'Domain',
    key: 'domain',
    width: 160,
    ellipsis: { tooltip: true },
    render: (row: PendingBlog) =>
      h('a', { href: row.url, target: '_blank', rel: 'noopener' }, row.domain),
  },
  { title: '名稱', key: 'name', width: 140, ellipsis: { tooltip: true } },
  {
    title: 'RSS URL',
    key: 'rss_url',
    width: 220,
    render: (row: PendingBlog) =>
      h(NInput, {
        value: row.rss_url ?? '',
        size: 'small',
        placeholder: 'https://...',
        onUpdateValue: (v: string) => { row.rss_url = v },
        onBlur: () => updateRss(row.id, row.rss_url ?? ''),
      }),
  },
  { title: '來源', key: 'source', width: 75 },
  { title: '提交時間', key: 'submitted_at', width: 105, render: (row: PendingBlog) => row.submitted_at.slice(0, 10) },
  {
    title: '操作',
    key: 'actions',
    width: 190,
    render: (row: PendingBlog) =>
      h('div', { style: 'display:flex;gap:6px' }, [
        !row.rss_url && h(NButton, {
          size: 'small',
          loading: discoveringIds.value.has(row.id),
          onClick: () => discoverOne(row),
        }, () => '探索 RSS'),
        h(NButton, { size: 'small', type: 'primary', onClick: () => approve(row.id) }, () => '核准'),
        h(NButton, { size: 'small', type: 'error', onClick: () => reject(row.id, row.domain) }, () => '拒絕'),
      ]),
  },
]

onMounted(load)
</script>
