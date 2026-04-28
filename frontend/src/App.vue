<template>
  <n-config-provider>
    <n-layout style="min-height: 100vh">
      <n-layout-header bordered style="padding: 12px 24px; display: flex; gap: 16px; align-items: center">
        <router-link to="/" style="font-weight: bold; text-decoration: none; color: inherit">
          IndiePing
        </router-link>
        <!-- 訂閱功能暫時隱藏 -->
<template v-if="isAdmin">
          <n-divider vertical />
          <router-link to="/admin/pending">待審核</router-link>
          <router-link to="/admin/blogs">部落格</router-link>
          <router-link to="/admin/subs">訂閱清單</router-link>
          <router-link to="/admin/links">Links</router-link>
        </template>
        <span style="flex: 1" />
        <!-- 管理入口隱藏，直接輸入 /admin 進入 -->
      </n-layout-header>
      <n-layout-content style="padding: 24px; max-width: 900px; margin: 0 auto">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { NConfigProvider, NLayout, NLayoutHeader, NLayoutContent, NDivider } from 'naive-ui'

const route = useRoute()
const isAdmin = computed(() => route.path.startsWith('/admin'))
</script>
