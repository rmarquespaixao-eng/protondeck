<template>
  <div v-if="dash">
    <div class="page-header">
      <h1>Dashboard</h1>
      <span class="page-sub">Resumo da biblioteca, do sistema e atalhos pros fluxos principais.</span>
    </div>

    <div v-if="!dash.lastSync" class="banner banner-warn">
      Banco ainda vazio.
      <template v-if="!steamConfigured"><router-link to="/settings/steam">Configure as credenciais Steam</router-link> e</template>
      rode o primeiro sync no botão da sidebar.
    </div>

    <!-- Stats row -->
    <section class="dash-stats">
      <div class="dash-stat-card">
        <div class="dash-stat-num">{{ dash.total }}</div>
        <div class="dash-stat-label">jogos na biblioteca</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-num">{{ dash.installed }}</div>
        <div class="dash-stat-label">instalados</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-num">{{ dash.overridesCount }}</div>
        <div class="dash-stat-label">com override custom</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-num">{{ dash.totalPlaytimeHours }}<span class="dash-stat-unit">h</span></div>
        <div class="dash-stat-label">tempo total jogado</div>
      </div>
    </section>

    <!-- Tier breakdown -->
    <section v-if="dash.total > 0" class="dash-card">
      <div class="dash-card-head">
        <h2 class="dash-card-title">Distribuição por tier</h2>
        <router-link to="/games" class="dash-card-link">ver biblioteca →</router-link>
      </div>
      <div class="dash-tier-bars">
        <template v-for="t in TIERS" :key="t">
          <router-link
            v-if="(dash.byTier[t] || 0) > 0"
            class="dash-tier-bar"
            :to="{ path: '/games', query: { tier: t } }"
            :title="`${t}: ${dash.byTier[t]} jogos`"
          >
            <span class="dash-tier-label" :class="'tier-' + t">{{ t }}</span>
            <span class="dash-tier-fill-wrap">
              <span class="dash-tier-fill" :class="'tier-' + t + '-bg'" :style="{ width: tierPct(t) + '%' }"></span>
            </span>
            <span class="dash-tier-num">{{ dash.byTier[t] }}</span>
          </router-link>
        </template>
      </div>
    </section>

    <!-- Quick actions -->
    <section class="dash-card">
      <div class="dash-card-head"><h2 class="dash-card-title">Atalhos</h2></div>
      <div class="dash-actions">
        <router-link class="dash-action" to="/check">
          <span class="dash-action-icon">⌕</span>
          <div>
            <div class="dash-action-title">Vai rodar no Linux?</div>
            <div class="dash-action-desc">Antes de comprar, consulta ProtonDB + PCGW + Store</div>
          </div>
        </router-link>
        <router-link class="dash-action" to="/system">
          <span class="dash-action-icon">⎈</span>
          <div>
            <div class="dash-action-title">Wizard de pacotes</div>
            <div class="dash-action-desc">Instala gamescope, mangohud, Vulkan, Steam pra sua distro</div>
          </div>
        </router-link>
        <router-link class="dash-action" to="/backup">
          <span class="dash-action-icon">⇅</span>
          <div>
            <div class="dash-action-title">Backup & Import</div>
            <div class="dash-action-desc">Exporta seus overrides ou importa de outra máquina</div>
          </div>
        </router-link>
        <button type="button" class="dash-action dash-action-btn" :disabled="syncing" @click="doSync">
          <span class="dash-action-icon">↻</span>
          <div>
            <div class="dash-action-title">{{ syncing ? 'Sincronizando...' : 'Sync biblioteca' }}</div>
            <div class="dash-action-desc">Puxa a biblioteca da Steam, cruza com ProtonDB e atualiza o snapshot</div>
          </div>
        </button>
      </div>
    </section>

    <!-- Sistema + recentes -->
    <div class="dash-grid-2col">
      <section v-if="system" class="dash-card">
        <div class="dash-card-head">
          <h2 class="dash-card-title">Sistema</h2>
          <router-link to="/system" class="dash-card-link">wizard →</router-link>
        </div>
        <dl class="dash-kv">
          <template v-if="system.gpu && system.gpu.model"><dt>GPU</dt><dd>{{ system.gpu.model }}</dd></template>
          <template v-if="system.session"><dt>Sessão</dt><dd>{{ system.session.type }} / {{ system.session.desktop }}</dd></template>
          <template v-if="system.monitors && system.monitors.length">
            <dt>Monitor</dt><dd>{{ system.monitors[0].name }} · {{ system.monitors[0].width }}×{{ system.monitors[0].height }}@{{ system.monitors[0].refresh }}Hz</dd>
          </template>
          <template v-if="dash.lastSync"><dt>Último sync</dt><dd>{{ fmtDate(dash.lastSync) }}</dd></template>
        </dl>
      </section>

      <section v-if="dash.recentlyPlayed.length" class="dash-card">
        <div class="dash-card-head"><h2 class="dash-card-title">Últimos jogados</h2></div>
        <ul class="dash-list">
          <li v-for="g in dash.recentlyPlayed" :key="g.appid">
            <router-link :to="`/game/${g.appid}`" class="dash-list-name">{{ g.name }}</router-link>
            <span class="badge" :class="'tier-' + g.tier">{{ g.tier }}</span>
            <span class="dash-list-meta">{{ hours(g.playtime_minutes) }}h</span>
          </li>
        </ul>
      </section>
    </div>

    <!-- Overrides recentes -->
    <section v-if="dash.recentlyOverridden.length" class="dash-card">
      <div class="dash-card-head">
        <h2 class="dash-card-title">Overrides recentes</h2>
        <router-link to="/backup" class="dash-card-link">exportar tudo →</router-link>
      </div>
      <ul class="dash-overrides">
        <li v-for="g in dash.recentlyOverridden" :key="g.appid">
          <div class="dash-override-head">
            <router-link :to="`/game/${g.appid}`" class="dash-list-name">{{ g.name }}</router-link>
            <span class="dash-list-meta">{{ fmtDate(g.updated_at) }}</span>
          </div>
          <code v-if="g.user_launch_options" class="dash-override-snippet">{{ snippet(g.user_launch_options) }}</code>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api, call, toast } from '../api'

const TIERS = ['platinum', 'gold', 'silver', 'bronze', 'pending', 'borked', 'native', 'unknown']
const router = useRouter()
const dash = ref(null)
const system = ref(null)
const steamConfigured = ref(false)
const syncing = ref(false)

function tierPct(t) {
  return Math.max(2, Math.round(((dash.value.byTier[t] || 0) / dash.value.total) * 100))
}
function hours(min) { return Math.round((min || 0) / 6) / 10 }
function fmtDate(s) { return s ? s.slice(0, 16).replace('T', ' ') : '' }
function snippet(s) { return s.length > 140 ? s.slice(0, 140) + '…' : s }

async function load() {
  const r = await call(() => api.dashboard.get())
  dash.value = r.dash
  system.value = r.system
  steamConfigured.value = r.steamConfigured
}

async function doSync() {
  syncing.value = true
  try {
    const r = await call(() => api.sync.run())
    toast(`Sync ok: ${r.upserts} jogos`, 'success')
    await load()
  } catch { /* toast já mostrado */ }
  finally { syncing.value = false }
}

onMounted(load)
</script>
