<template>
  <div>
    <n-h2>Links 總覽</n-h2>
    <n-space style="margin-bottom: 16px">
      <n-input v-model:value="filterDomain" placeholder="target domain" clearable @update:value="debouncedLoad" />
      <n-input v-model:value="filterBlog" placeholder="source blog domain" clearable @update:value="debouncedLoad" />
      <n-input v-model:value="filterDate" type="date" @update:value="resetAndLoad" />
    </n-space>
    <n-text v-if="total !== null" depth="3" style="display: block; margin-bottom: 8px; font-size: 13px">
      共 {{ total }} 篇文章
    </n-text>
    <n-data-table
      remote
      :columns="columns"
      :data="items"
      :loading="loading"
      :pagination="pagination"
      :row-key="(r: AggregatedRow) => r.post_url"
      @update:page="onPage"
      @update:sorter="onSorter"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import { NDataTable, NH2, NInput, NSpace, NText } from 'naive-ui'
import type { DataTableSortState } from 'naive-ui'
import { inlineLink } from '@/utils/links'

let debounceTimer: ReturnType<typeof setTimeout>
function debouncedLoad() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(resetAndLoad, 300)
}

interface Target { url: string; domain: string; blogName: string | null; linkText: string; context: string }

interface AggregatedRow {
  post_url: string
  post_title: string
  published_at: string | null
  scanned_at: string
  blog_name: string
  blog_domain: string
  targets: Target[]
  target_count: number
}

const items = ref<AggregatedRow[]>([])
const total = ref<number | null>(null)
const loading = ref(false)
const filterDomain = ref('')
const filterBlog = ref('')
const filterDate = ref('')
const sortField = ref('scanned_at')
const sortOrder = ref<'asc' | 'desc'>('desc')

const pagination = reactive({ page: 1, pageSize: 50, pageCount: 1, showSizePicker: true, pageSizes: [25, 50, 100] })

function resetAndLoad() {
  pagination.page = 1
  load()
}

async function load() {
  loading.value = true
  const params = new URLSearchParams({
    page: String(pagination.page),
    pageSize: String(pagination.pageSize),
    sort: sortField.value,
    order: sortOrder.value,
  })
  if (filterDomain.value) params.set('domain', filterDomain.value)
  if (filterBlog.value) params.set('blog', filterBlog.value)
  if (filterDate.value) params.set('date', filterDate.value)
  const res = await fetch(`/api/admin/links?${params}`)
  const data = await res.json()
  items.value = data.items
  total.value = data.total
  pagination.pageCount = Math.ceil(data.total / pagination.pageSize)
  loading.value = false
}

function onPage(page: number) {
  pagination.page = page
  load()
}

function onSorter(sorter: DataTableSortState | null) {
  if (!sorter || !sorter.order) {
    // cleared — revert to default
    sortField.value = 'scanned_at'
    sortOrder.value = 'desc'
  } else {
    sortField.value = sorter.columnKey as string
    sortOrder.value = sorter.order === 'ascend' ? 'asc' : 'desc'
  }
  pagination.page = 1
  load()
}


const columns = computed(() => [
  {
    title: '來源文章',
    key: 'published_at',
    sortOrder: sortField.value === 'published_at' ? (sortOrder.value === 'asc' ? 'ascend' : 'descend') : false,
    sorter: true,
    render: (r: AggregatedRow) =>
      h('div', [
        h('a', { href: r.post_url, target: '_blank', style: 'color: inherit; display: block' }, r.post_title || r.post_url),
        h('span', { style: 'color: #999; font-size: 12px' }, r.published_at?.slice(0, 10) ?? ''),
      ]),
  },
  {
    title: 'Blog',
    key: 'blog',
    sortOrder: sortField.value === 'blog' ? (sortOrder.value === 'asc' ? 'ascend' : 'descend') : false,
    sorter: true,
    width: 160,
    render: (r: AggregatedRow) => r.blog_name,
  },
  {
    title: 'Targets',
    key: 'targets',
    render: (r: AggregatedRow) =>
      h('div', { style: 'display:flex;flex-direction:column;gap:4px;padding:4px 0' },
        r.targets.map(t =>
          h('div', { style: 'margin-bottom:6px' }, [
            h('span', { style: 'font-size:11px;font-weight:600;display:block;margin-bottom:1px' }, t.blogName || t.domain),
            h('span', { style: 'color:#555;font-size:13px', innerHTML: inlineLink(t.url, t.linkText, t.context) }),
          ])
        )
      ),
  },
  {
    title: '掃描日',
    key: 'scanned_at',
    width: 100,
    sortOrder: sortField.value === 'scanned_at' ? (sortOrder.value === 'asc' ? 'ascend' : 'descend') : false,
    sorter: true,
    render: (r: AggregatedRow) => r.scanned_at.slice(0, 10),
  },
])

onMounted(load)
</script>
