<template>
  <div>
    <div class="page-header">
      <h1>Biblioteca</h1>
      <span class="page-sub">
        {{ stats.total }} jogos · {{ stats.installed }} instalados<template v-if="stats.lastSync"> · sync {{ fmtDate(stats.lastSync) }}</template>
      </span>
    </div>

    <div v-if="!stats.lastSync" class="banner banner-warn">
      Banco vazio. <router-link to="/settings/steam">Configure as credenciais</router-link> e clique em <strong>Sync biblioteca</strong>.
    </div>

    <section class="stats">
      <div v-for="(n, t) in stats.byTier" :key="t" class="stat" :class="'tier-' + t">
        <span class="stat-num">{{ n }}</span><span class="stat-label">{{ t }}</span>
      </div>
    </section>

    <details v-if="system" class="system">
      <summary>Sistema detectado</summary>
      <pre>{{ systemSummary }}</pre>
    </details>

    <form class="filters" @submit.prevent="applyFilters">
      <input v-model="form.search" type="search" placeholder="nome ou appid" />
      <select v-model="form.tier">
        <option value="">tier (todos)</option>
        <option v-for="t in TIERS" :key="t" :value="t">{{ t }}</option>
      </select>
      <select v-model="form.installed">
        <option value="">instalado?</option>
        <option value="1">sim</option>
        <option value="0">não</option>
      </select>
      <button type="submit">filtrar</button>
      <a class="clear" href="#" @click.prevent="clearFilters">limpar</a>
    </form>

    <div v-if="selectedCount" class="bulk-bar">
      <span class="bulk-count"><strong>{{ selectedCount }}</strong> selecionado(s) · {{ selectedWithOverride }} com override ★</span>
      <span class="spacer"></span>
      <a href="#" class="bulk-link" @click.prevent="selectOverridesInView">selecionar só ★</a>
      <a href="#" class="bulk-link" @click.prevent="clearSelection">limpar</a>
      <template v-if="!confirming">
        <button type="button" class="bulk-apply" :disabled="busy" @click="confirming = true">Aplicar no Steam ({{ selectedCount }})</button>
      </template>
      <template v-else>
        <span class="bulk-confirm">Escrever a config de cada jogo no Steam? Jogos sem ★ são pulados.</span>
        <button type="button" class="bulk-apply" :disabled="busy" @click="applyBulk">Confirmar</button>
        <button type="button" class="bulk-cancel" :disabled="busy" @click="confirming = false">Cancelar</button>
      </template>
    </div>

    <div v-if="bulkResult" class="banner" :class="bulkResult.failed ? 'banner-warn' : 'banner-ok'">
      <div>
        <strong>{{ bulkResult.applied }}</strong> aplicado(s),
        <strong>{{ bulkResult.skipped }}</strong> pulado(s) (sem override),
        <strong>{{ bulkResult.failed }}</strong> com erro.
        <span v-if="bulkResult.steamWasRunning"> — ⚠ Steam estava aberto; ele pode sobrescrever no fechamento. Reinicie a Steam pra garantir.</span>
        <a href="#" class="bulk-link" @click.prevent="bulkResult = null">fechar</a>
      </div>
      <ul v-if="bulkResult.failed" class="bulk-failures">
        <li v-for="it in bulkResult.items.filter(i => i.status === 'failed')" :key="it.appid">
          <code>{{ it.appid }}</code> {{ it.name }} — {{ it.reason }}
        </li>
      </ul>
    </div>

    <div class="table-wrap">
      <table class="games">
        <thead>
          <tr>
            <th class="col-sel"><input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected" @change="toggleAll" title="selecionar todos (filtrados)" /></th>
            <th>appid</th><th>nome</th><th>tier</th><th>reports</th><th>horas</th>
            <th>inst.</th><th>engine</th><th>config</th><th>★</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!games.length"><td colspan="10" class="empty">Nenhum jogo. Rode o Sync.</td></tr>
          <tr v-for="g in games" :key="g.appid" :class="['row-tier-' + g.tier, { 'row-selected': isSelected(g.appid) }]">
            <td class="col-sel"><input type="checkbox" :checked="isSelected(g.appid)" @change="toggle(g.appid)" /></td>
            <td><code>{{ g.appid }}</code></td>
            <td><router-link :to="`/game/${g.appid}`">{{ g.name }}</router-link></td>
            <td><span class="badge" :class="'tier-' + g.tier">{{ g.tier }}</span></td>
            <td>{{ g.reports }}</td>
            <td>{{ hours(g.playtime_minutes) }}</td>
            <td>{{ g.installed ? '✓' : '' }}</td>
            <td>{{ g.engine || '—' }}</td>
            <td><span class="badge" :class="'config-' + (g.config_source || 'generic')">{{ g.config_source || 'generic' }}</span></td>
            <td>{{ g.user_launch_options ? '★' : '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, call, toast, ui } from '../api'

const TIERS = ['platinum', 'gold', 'silver', 'bronze', 'pending', 'borked', 'unknown', 'native']
const route = useRoute()
const router = useRouter()

const games = ref([])
const stats = ref({ total: 0, installed: 0, byTier: {}, lastSync: null })
const system = ref(null)
const form = reactive({ search: '', tier: '', installed: '' })

// ── Seleção múltipla + aplicar config no Steam em massa ──
const selected = ref(new Set())
const confirming = ref(false)
const bulkResult = ref(null)
const busy = computed(() => ui.busy > 0)

const selectedCount = computed(() => selected.value.size)
const selectedWithOverride = computed(() =>
  games.value.filter(g => selected.value.has(g.appid) && g.user_launch_options).length)
const allSelected = computed(() => games.value.length > 0 && games.value.every(g => selected.value.has(g.appid)))
const someSelected = computed(() => !allSelected.value && games.value.some(g => selected.value.has(g.appid)))

function isSelected(appid) { return selected.value.has(appid) }
function toggle(appid) {
  const s = new Set(selected.value)
  s.has(appid) ? s.delete(appid) : s.add(appid)
  selected.value = s
  confirming.value = false
}
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(games.value.map(g => g.appid))
  confirming.value = false
}
function selectOverridesInView() {
  selected.value = new Set(games.value.filter(g => g.user_launch_options).map(g => g.appid))
  confirming.value = false
}
function clearSelection() {
  selected.value = new Set()
  confirming.value = false
}

async function applyBulk() {
  confirming.value = false
  const appids = [...selected.value]
  if (!appids.length) return
  try {
    const res = await call(() => api.games.applySteamMany(appids))
    bulkResult.value = res
    if (res.applied) toast(`${res.applied} jogo(s) aplicados no Steam`, 'success')
    else if (!res.failed) toast('Nada aplicado — nenhum dos selecionados tem override ★', 'info')
    await load() // reflete ★ / config após escrita
  } catch { /* toast já mostrado pelo call() */ }
}

const systemSummary = computed(() => {
  if (!system.value) return ''
  const s = system.value
  return JSON.stringify({
    gpu: s.gpu && s.gpu.model,
    session: s.session ? s.session.type + ' / ' + s.session.desktop : null,
    monitor_primary: s.monitors && s.monitors[0],
  }, null, 2)
})

function hours(min) { return Math.round((min || 0) / 6) / 10 }
function fmtDate(s) { return s ? s.slice(0, 16).replace('T', ' ') : '' }

function syncFormFromQuery() {
  form.search = route.query.search ?? ''
  form.tier = route.query.tier ?? ''
  form.installed = route.query.installed ?? ''
}

async function load() {
  const filter = {
    tier: form.tier || undefined,
    search: form.search || undefined,
    installed: form.installed === '1' ? true : form.installed === '0' ? false : undefined,
  }
  const r = await call(() => api.games.list(filter))
  games.value = r.games
  stats.value = r.stats
  system.value = r.system
}

function applyFilters() {
  router.replace({ path: '/games', query: cleanQuery() })
}
function clearFilters() {
  form.search = ''; form.tier = ''; form.installed = ''
  router.replace({ path: '/games', query: {} })
}
function cleanQuery() {
  const q = {}
  if (form.search) q.search = form.search
  if (form.tier) q.tier = form.tier
  if (form.installed) q.installed = form.installed
  return q
}

// Recarrega ao mudar a query (filtros refletem na URL).
watch(() => route.query, () => { syncFormFromQuery(); load() })

onMounted(() => { syncFormFromQuery(); load() })
</script>
