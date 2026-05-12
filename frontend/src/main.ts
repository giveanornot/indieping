import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Query from './views/Query.vue'
import Subscribe from './views/Subscribe.vue'
import AdminPending from './views/admin/Pending.vue'
import AdminBlogs from './views/admin/Blogs.vue'
import AdminSubscriptions from './views/admin/Subscriptions.vue'
import AdminLinks from './views/admin/Links.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/:domain?', component: Query },
    { path: '/subscribe', component: Subscribe },
    { path: '/admin', redirect: '/admin/pending' },
    { path: '/admin/pending', component: AdminPending },
    { path: '/admin/blogs', component: AdminBlogs },
    { path: '/admin/subs', component: AdminSubscriptions },
    { path: '/admin/links', component: AdminLinks },
  ],
})

createApp(App).use(router).mount('#app')
