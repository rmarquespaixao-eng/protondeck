import { createRouter, createWebHashHistory } from 'vue-router'

// Hash history porque o app carrega via file:// no build empacotado.
const routes = [
  { path: '/', name: 'home', meta: { active: 'home' }, component: () => import('./views/DashboardView.vue') },
  { path: '/games', name: 'library', meta: { active: 'library' }, component: () => import('./views/GamesView.vue') },
  { path: '/game/:appid', name: 'game', meta: { active: 'library' }, component: () => import('./views/GameView.vue') },
  { path: '/check', name: 'check', meta: { active: 'check' }, component: () => import('./views/CheckView.vue') },
  { path: '/settings/steam', name: 'steam', meta: { active: 'steam' }, component: () => import('./views/SteamSettingsView.vue') },
  { path: '/settings/ai', name: 'ai', meta: { active: 'ai' }, component: () => import('./views/AiSettingsView.vue') },
  { path: '/system', name: 'system', meta: { active: 'system' }, component: () => import('./views/SystemView.vue') },
  { path: '/backup', name: 'backup', meta: { active: 'backup' }, component: () => import('./views/BackupView.vue') },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
