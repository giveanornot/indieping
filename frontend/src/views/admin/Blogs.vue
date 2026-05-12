<template>
  <div>
    <n-h2>部落格名單（{{ filteredItems.length }}）</n-h2>
    <n-input v-model:value="filter" placeholder="篩選 domain 或名稱" clearable style="max-width:300px;margin-bottom:16px" />
    <n-data-table
      :columns="columns"
      :data="filteredItems"
      :loading="loading"
      :pagination="pagination"
      :default-sort="{ columnKey: 'domain', order: 'ascend' }"
      :scroll-x="860"
    />

    <n-modal v-model:show="editModal" preset="card" title="編輯部落格" style="max-width: 480px">
      <n-form v-if="editTarget" label-placement="top">
        <n-form-item label="名稱">
          <n-input v-model:value="editTarget.name" />
        </n-form-item>
        <n-form-item label="網址">
          <n-input v-model:value="editTarget.url" />
        </n-form-item>
        <n-form-item label="RSS URL">
          <n-input v-model:value="editTarget.rss_url" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="editModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="saveEdit">儲存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import { NButton, NDataTable, NForm, NFormItem, NH2, NInput, NModal, NSpace, NTag } from 'naive-ui'

interface Blog {
  id: number
  name: string
  domain: string
  url: string
  rss_url: string
  last_scanned_at: string | null
  consecutive_fails: number
}

const items = ref<Blog[]>([])
const loading = ref(false)
const filter = ref('')
const pagination = reactive({ pageSize: 50, showSizePicker: true, pageSizes: [25, 50, 100] })
const editModal = ref(false)
const editTarget = ref<Blog | null>(null)
const saving = ref(false)

const filteredItems = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(b => b.domain.includes(q) || (b.name ?? '').toLowerCase().includes(q))
})

async function load() {
  loading.value = true
  const res = await fetch('/api/admin/blogs')
  items.value = await res.json()
  loading.value = false
}

function openEdit(row: Blog) {
  editTarget.value = { ...row }
  editModal.value = true
}

async function saveEdit() {
  if (!editTarget.value) return
  saving.value = true
  const { id, name, url, rss_url } = editTarget.value
  await fetch(`/api/admin/blogs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, url, rss_url }),
  })
  saving.value = false
  editModal.value = false
  await load()
}

async function remove(id: number, domain: string) {
  if (!window.confirm(`確定要移除 ${domain}？相關文章和連結紀錄也會一併刪除。`)) return
  await fetch(`/api/admin/blogs/${id}`, { method: 'DELETE' })
  await load()
}

const columns = [
  {
    title: 'Domain',
    key: 'domain',
    width: 260,
    sorter: (a: Blog, b: Blog) => a.domain.localeCompare(b.domain),
    defaultSortOrder: 'ascend' as const,
    render: (r: Blog) => h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.domain),
  },
  {
    title: '名稱',
    key: 'name',
    width: 260,
    sorter: (a: Blog, b: Blog) => (a.name ?? '').localeCompare(b.name ?? ''),
  },
  {
    title: '最後掃描',
    key: 'last_scanned_at',
    width: 120,
    sorter: (a: Blog, b: Blog) => (a.last_scanned_at ?? '').localeCompare(b.last_scanned_at ?? ''),
    render: (r: Blog) => r.last_scanned_at?.slice(0, 10) ?? '—',
  },
  {
    title: '連續失敗',
    key: 'consecutive_fails',
    width: 100,
    sorter: (a: Blog, b: Blog) => a.consecutive_fails - b.consecutive_fails,
    render: (r: Blog) => r.consecutive_fails > 0
      ? h(NTag, { type: 'error', size: 'small' }, () => `${r.consecutive_fails} 次`)
      : '—',
  },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    render: (row: Blog) =>
      h('div', { style: 'display:flex;gap:8px' }, [
        h(NButton, { size: 'small', onClick: () => openEdit(row) }, () => '編輯'),
        h(NButton, { size: 'small', type: 'error', onClick: () => remove(row.id, row.domain) }, () => '移除'),
      ]),
  },
]

onMounted(load)
</script>
