<template>
  <div>
    <n-h1>訂閱通知</n-h1>
    <p>每天早上收到 email，告訴你昨天有哪些部落格 link 了你。</p>

    <n-form style="max-width: 480px">
      <n-form-item label="你的部落格 domain">
        <n-input v-model:value="domain" placeholder="blog.giveanornot.com" @blur="checkDomain" />
      </n-form-item>
      <n-alert v-if="domainStatus === 'not_in_list'" type="warning" style="margin-bottom: 12px">
        此 domain 尚未在監控名單中，訂閱後需等待審核通過才會開始收到通知。
      </n-alert>
      <n-form-item label="Email">
        <n-input v-model:value="email" type="email" placeholder="you@example.com" />
      </n-form-item>
      <n-button type="primary" :loading="loading" @click="subscribe">訂閱</n-button>
    </n-form>

    <n-alert v-if="status === 'confirmation_sent'" type="success" style="margin-top: 16px">
      確認信已寄出，請至信箱點擊連結完成訂閱。
    </n-alert>
    <n-alert v-else-if="status === 'pending'" type="warning" style="margin-top: 16px">
      你已訂閱但尚未確認，請至信箱點擊確認連結。
    </n-alert>
    <n-alert v-else-if="status === 'already_confirmed'" type="info" style="margin-top: 16px">
      你已完成訂閱。
    </n-alert>
    <n-alert v-else-if="status === 'error'" type="error" style="margin-top: 16px">
      發生錯誤，請稍後再試。
    </n-alert>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NAlert, NButton, NForm, NFormItem, NH1, NInput } from 'naive-ui'

const domain = ref('')
const email = ref('')
const loading = ref(false)
const status = ref<string | null>(null)
const domainStatus = ref<'in_list' | 'not_in_list' | null>(null)

async function checkDomain() {
  const d = domain.value.trim()
  if (!d) { domainStatus.value = null; return }
  try {
    const res = await fetch(`/api/check?domain=${encodeURIComponent(d)}`)
    const data = await res.json()
    domainStatus.value = data.inList ? 'in_list' : 'not_in_list'
  } catch {
    domainStatus.value = null
  }
}

async function subscribe() {
  if (!domain.value || !email.value) return
  loading.value = true
  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: domain.value.trim(), email: email.value.trim() }),
    })
    const data = await res.json()
    status.value = data.status ?? (res.ok ? 'confirmation_sent' : 'error')
  } catch {
    status.value = 'error'
  } finally {
    loading.value = false
  }
}
</script>
