<template>
  <div>
    <n-h2>訂閱清單</n-h2>
    <n-input v-model:value="filter" placeholder="篩選 domain 或 email" clearable style="max-width:300px;margin-bottom:16px" />
    <n-data-table :columns="columns" :data="filteredItems" :loading="loading" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { NButton, NDataTable, NH2, NInput, NTag } from 'naive-ui'

interface Subscription {
  id: number
  domain: string
  email: string
  confirmed: number
  confirmed_at: string | null
  created_at: string
}

const items = ref<Subscription[]>([])
const loading = ref(false)
const filter = ref('')

const filteredItems = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(s => s.domain.includes(q) || s.email.toLowerCase().includes(q))
})

async function load() {
  loading.value = true
  const res = await fetch('/api/admin/subscriptions')
  items.value = await res.json()
  loading.value = false
}

async function remove(id: number, email: string) {
  if (!window.confirm(`確定要刪除 ${email} 的訂閱？`)) return
  await fetch(`/api/admin/subscriptions/${id}`, { method: 'DELETE' })
  await load()
}

const columns = [
  { title: 'Domain', key: 'domain' },
  { title: 'Email', key: 'email' },
  {
    title: '狀態',
    key: 'confirmed',
    render: (r: Subscription) =>
      h(NTag, { type: r.confirmed ? 'success' : 'warning', size: 'small' }, () => r.confirmed ? '已確認' : '待確認'),
  },
  { title: '訂閱時間', key: 'created_at', render: (r: Subscription) => r.created_at.slice(0, 10) },
  {
    title: '操作',
    key: 'actions',
    render: (row: Subscription) =>
      h(NButton, { size: 'small', type: 'error', onClick: () => remove(row.id, row.email) }, () => '刪除'),
  },
]

onMounted(load)
</script>
