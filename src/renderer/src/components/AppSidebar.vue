<template>
  <aside class="sidebar">
    <router-link class="sidebar-brand" to="/">
      ProtonDeck
      <span class="sidebar-brand-mini">Proton launch options</span>
    </router-link>

    <div class="sidebar-section-label">Início</div>
    <router-link to="/" class="sidebar-link" :class="{ active: active === 'home' }">
      <span class="icon">◉</span> Dashboard
    </router-link>

    <div class="sidebar-section-label">Biblioteca</div>
    <router-link to="/games" class="sidebar-link" :class="{ active: active === 'library' }">
      <span class="icon">▣</span> Jogos
    </router-link>
    <router-link to="/check" class="sidebar-link" :class="{ active: active === 'check' }">
      <span class="icon">⌕</span> Vai rodar?
    </router-link>

    <div class="sidebar-section-label">Configurações</div>
    <router-link to="/settings/steam" class="sidebar-link" :class="{ active: active === 'steam' }">
      <span class="icon">⊙</span> Steam Credentials
    </router-link>
    <router-link to="/settings/ai" class="sidebar-link" :class="{ active: active === 'ai' }">
      <span class="icon">✦</span> AI Provider
    </router-link>

    <div class="sidebar-section-label">Sistema</div>
    <router-link to="/system" class="sidebar-link" :class="{ active: active === 'system' }">
      <span class="icon">⎈</span> Wizard de pacotes
    </router-link>
    <router-link to="/backup" class="sidebar-link" :class="{ active: active === 'backup' }">
      <span class="icon">⇅</span> Backup &amp; Import
    </router-link>

    <div class="sidebar-footer">
      <button
        type="button"
        class="sidebar-sync"
        :disabled="syncing"
        title="Puxa biblioteca da Steam e atualiza o snapshot"
        @click="doSync"
      >
        <span v-if="syncing" class="pd-spinner" aria-hidden="true"></span>
        {{ syncing ? 'Sincronizando...' : '↻ Sync biblioteca' }}
      </button>
      <div class="sidebar-version">v{{ version }}</div>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, call, toast } from '../api'

const route = useRoute()
const router = useRouter()
const active = computed(() => route.meta.active)
const syncing = ref(false)
const version = ref('0.2.3')

onMounted(async () => {
  try { version.value = await api.app.version() } catch { /* noop */ }
})

async function doSync() {
  syncing.value = true
  try {
    const r = await call(() => api.sync.run())
    toast(`Sync ok: ${r.upserts} jogos`, 'success')
    if (route.name === 'home') router.go(0)
    else router.push('/')
  } catch { /* toast já mostrado */ }
  finally { syncing.value = false }
}
</script>
