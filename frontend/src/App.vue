<template>
  <n-config-provider :theme="naiveTheme">
    <n-global-style />
    <n-layout class="app-shell">
      <n-layout-header bordered class="app-header">
        <router-link to="/" class="app-brand">
          IndiePing
        </router-link>
        <!-- 訂閱功能暫時隱藏 -->
        <template v-if="isAdmin">
          <n-divider vertical />
          <router-link to="/admin/pending" class="app-nav-link">待審核</router-link>
          <router-link to="/admin/blogs" class="app-nav-link">部落格</router-link>
          <router-link to="/admin/subs" class="app-nav-link">訂閱清單</router-link>
          <router-link to="/admin/links" class="app-nav-link">Links</router-link>
        </template>
        <span class="app-header-spacer" />
        <n-switch v-model:value="darkMode" size="small" aria-label="切換深色模式">
          <template #checked>
            <n-icon class="theme-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M21 14.8A8.5 8.5 0 0 1 9.2 3a7 7 0 1 0 11.8 11.8Z" />
              </svg>
            </n-icon>
          </template>
          <template #unchecked>
            <n-icon class="theme-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
              </svg>
            </n-icon>
          </template>
        </n-switch>
        <!-- 管理入口隱藏，直接輸入 /admin 進入 -->
      </n-layout-header>
      <n-layout-content class="app-content">
        <router-view />
      </n-layout-content>
      <footer class="app-footer">
        Made with ♥ by <a href="https://blog.giveanornot.com" target="_blank" style="color: inherit">JN</a>
      </footer>
    </n-layout>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { darkTheme, NConfigProvider, NDivider, NGlobalStyle, NIcon, NLayout, NLayoutContent, NLayoutHeader, NSwitch } from 'naive-ui'

const route = useRoute()
const isAdmin = computed(() => route.path.startsWith('/admin'))
const themeKey = 'indieping-theme'
const savedTheme = window.localStorage.getItem(themeKey)
const darkMode = ref(savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches))
const naiveTheme = computed(() => darkMode.value ? darkTheme : null)

watch(darkMode, (enabled) => {
  window.localStorage.setItem(themeKey, enabled ? 'dark' : 'light')
})

watchEffect(() => {
  document.documentElement.classList.toggle('dark', darkMode.value)
  document.documentElement.style.colorScheme = darkMode.value ? 'dark' : 'light'
})
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-header {
  padding: 12px 24px;
  display: flex;
  gap: 16px;
  align-items: center;
}

.app-brand {
  color: inherit;
  font-weight: bold;
  text-decoration: none;
}

.app-nav-link {
  color: var(--n-text-color-2);
  text-decoration: none;
}

.app-nav-link:hover,
.app-nav-link.router-link-active {
  color: var(--n-text-color);
}

.app-header-spacer {
  flex: 1;
}

.theme-icon {
  display: block;
}

.theme-icon svg {
  width: 1em;
  height: 1em;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.app-content {
  padding: 24px 24px 60px;
  max-width: 1200px;
  margin: 0 auto;
}

.app-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 10px;
  border-top: 1px solid var(--n-border-color);
  color: var(--n-text-color-3);
  font-size: 13px;
  text-align: center;
  background: var(--n-color);
}
</style>
