<template>
  <div>
    <div class="page-header">
      <h1>Vai rodar no Linux?</h1>
      <span class="page-sub">Busca um jogo na Steam (mesmo que não esteja na sua biblioteca) e te diz se vale comprar — combina ProtonDB, PCGamingWiki e Steam Store API.</span>
    </div>

    <div class="check-search-box">
      <input
        ref="inputEl"
        v-model="q"
        type="search"
        placeholder="ex: Resident Evil 4, Cyberpunk, Helldivers..."
        autofocus
        autocomplete="off"
        @input="onInput"
        @keydown.enter.prevent="doSearch"
      />
      <button type="button" :disabled="searching" @click="doSearch">
        {{ searching ? 'Buscando...' : 'Buscar' }}
      </button>
    </div>

    <!-- Resultados da busca -->
    <div id="check-results">
      <p v-if="searching" class="check-loading">buscando…</p>
      <p v-else-if="searchError" class="check-err">erro: {{ searchError }}</p>
      <p v-else-if="searchDone && !results.length" class="check-empty">nenhum resultado pra "{{ lastQ }}"</p>
      <div v-else-if="results.length" class="check-hits">
        <button
          v-for="h in results"
          :key="h.appid"
          type="button"
          class="check-hit"
          @click="loadDetail(h.appid, h.name)"
        >
          <img v-if="h.logo" :src="h.logo" alt="" />
          <div v-else class="check-hit-noimg"></div>
          <div class="check-hit-meta">
            <div class="check-hit-name">{{ h.name }}</div>
            <div class="check-hit-appid">appid {{ h.appid }}</div>
          </div>
        </button>
      </div>
    </div>

    <!-- Detalhe do jogo -->
    <div id="check-detail">
      <div v-if="loadingDetail" class="check-detail-card">
        <p class="check-loading">consultando ProtonDB + PCGamingWiki + Steam Store…</p>
      </div>
      <div v-else-if="detailError" class="check-detail-card">
        <p class="check-err">erro: {{ detailError }}</p>
      </div>
      <div v-else-if="detail" class="check-detail-card">
        <!-- Recomendação principal -->
        <div class="check-recommendation" :class="recMeta.cls">
          <span class="check-rec-icon">{{ recMeta.icon }}</span>
          <span class="check-rec-label">{{ recMeta.label }}</span>
        </div>

        <img v-if="store.headerImage" class="check-header-img" :src="store.headerImage" alt="" />

        <div class="check-detail-body">
          <h2 class="check-game-name">{{ store.name || detail.appid }}</h2>

          <p v-if="subLine" class="check-sub">{{ subLine }}</p>
          <p v-if="store.shortDescription" class="check-desc">{{ store.shortDescription }}</p>

          <!-- Plataformas -->
          <div class="check-section">
            <div class="check-section-title">Plataformas (declarado pela Steam)</div>
            <div class="check-platforms">
              <span class="check-platform" :class="platforms.windows ? 'check-platform-on' : 'check-platform-off'">Windows</span>
              <span class="check-platform" :class="platforms.linux   ? 'check-platform-on' : 'check-platform-off'">Linux nativo</span>
              <span class="check-platform" :class="platforms.mac     ? 'check-platform-on' : 'check-platform-off'">macOS</span>
            </div>
          </div>

          <!-- ProtonDB -->
          <div class="check-section">
            <div class="check-section-title">ProtonDB</div>
            <template v-if="protondb.found">
              <div class="check-protondb">
                <span class="check-tier" :style="{ background: tierColor(protondb.tier), color: '#0a0d12' }">{{ protondb.tier }}</span>
                <template v-if="protondb.trendingTier && protondb.trendingTier !== protondb.tier">
                  <span class="check-muted"> trend: {{ protondb.trendingTier }}</span>
                </template>
                <span class="check-muted"> · {{ protondb.total }} relatos</span>
                <span v-if="protondb.confidence" class="check-muted"> · confiança: {{ protondb.confidence }}</span>
              </div>
              <p class="check-muted">
                <a href="#" @click.prevent="openExternal('https://www.protondb.com/app/' + detail.appid)">Ver relatos completos no ProtonDB ↗</a>
              </p>
            </template>
            <p v-else class="check-muted">Sem dados (jogo pode ser muito novo ou ter poucos relatos).</p>
          </div>

          <!-- PCGamingWiki -->
          <div class="check-section">
            <div class="check-section-title">PCGamingWiki · suporte a resolução</div>
            <ul class="check-pcgw-list">
              <li v-html="pcgwLine('Ultra-widescreen 21:9', pcgw.features && pcgw.features.ultrawidescreen)"></li>
              <li v-html="pcgwLine('Widescreen 16:9',       pcgw.features && pcgw.features.widescreen)"></li>
              <li v-html="pcgwLine('Multi-monitor',         pcgw.features && pcgw.features.multimonitor)"></li>
              <li v-html="pcgwLine('4K Ultra HD',           pcgw.features && pcgw.features['4k'])"></li>
              <li v-html="pcgwLine('FOV ajustável',         pcgw.features && pcgw.features.fov)"></li>
            </ul>
            <p v-if="pcgw.pageUrl" class="check-muted">
              <a href="#" @click.prevent="openExternal(pcgw.pageUrl)">Página do jogo no PCGamingWiki ↗</a>
            </p>
          </div>

          <!-- Razões -->
          <div v-if="detail.reasons && detail.reasons.length" class="check-section">
            <div class="check-section-title">Por quê</div>
            <ul class="check-reasons">
              <li v-for="(r, i) in detail.reasons" :key="i">{{ r }}</li>
            </ul>
          </div>

          <p class="check-muted check-footer">
            <a href="#" @click.prevent="openExternal('https://store.steampowered.com/app/' + detail.appid)">Abrir na Steam ↗</a>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { api, call, toast, openExternal } from '../api'

const REC_META = {
  'go':         { label: 'Vai rodar',             cls: 'rec-go',         icon: '✓' },
  'caution':    { label: 'Roda mas exige tweaks', cls: 'rec-caution',    icon: '⚠' },
  'risky':      { label: 'Risco alto',            cls: 'rec-risky',      icon: '✕' },
  'unreleased': { label: 'Não lançado',           cls: 'rec-unreleased', icon: '⏳' },
  'no-data':    { label: 'Sem dados',             cls: 'rec-nodata',     icon: '?' },
}

const TIER_COLOR = {
  platinum: '#d6d6d6', gold: '#f5b942', silver: '#c0c0c0',
  bronze: '#cd7f32', borked: '#ff5a5a', native: '#8be39a', pending: '#888',
}

// Estado de busca
const q = ref('')
const lastQ = ref('')
const results = ref([])
const searching = ref(false)
const searchDone = ref(false)
const searchError = ref('')
let debounceTimer = null

// Estado de detalhe
const detail = ref(null)
const loadingDetail = ref(false)
const detailError = ref('')

// Computed do detalhe
const store = computed(() => detail.value?.store || {})
const protondb = computed(() => detail.value?.protondb || {})
const pcgw = computed(() => detail.value?.pcgw || { features: {} })
const platforms = computed(() => store.value.platforms || { windows: false, mac: false, linux: false })
const recMeta = computed(() => REC_META[detail.value?.recommendation] || REC_META['no-data'])

const subLine = computed(() => {
  const s = store.value
  const parts = []
  if (s.releaseDate) parts.push((s.comingSoon ? 'lança ' : 'lançado ') + s.releaseDate)
  if (s.developers && s.developers.length) parts.push('dev: ' + s.developers.join(', '))
  if (s.priceFormatted) parts.push(s.priceFormatted)
  else if (s.isFree) parts.push('grátis')
  return parts.join(' · ')
})

function tierColor(tier) {
  return TIER_COLOR[tier] || '#888'
}

function pcgwLine(label, f) {
  if (!f) return `${label}: <span class="check-muted">sem info</span>`
  const state = String(f.state ?? '')
  const notes = f.notes ? ` — <span class="check-muted">${esc(f.notes)}</span>` : ''
  return `${label}: <span class="check-pcgw-${esc(state)}">${esc(state)}</span>${notes}`
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

function onInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(doSearch, 600)
}

async function doSearch() {
  clearTimeout(debounceTimer)
  const val = q.value.trim()
  if (val.length < 2) {
    results.value = []
    searchDone.value = false
    searchError.value = ''
    return
  }
  lastQ.value = val
  searching.value = true
  searchError.value = ''
  searchDone.value = false
  try {
    const data = await call(() => api.check.search(val), { quiet: true })
    results.value = data.results || []
    searchDone.value = true
  } catch (err) {
    searchError.value = err?.message || String(err)
    results.value = []
  } finally {
    searching.value = false
  }
}

async function loadDetail(appid) {
  detail.value = null
  detailError.value = ''
  loadingDetail.value = true
  await nextTick()
  document.getElementById('check-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  try {
    detail.value = await call(() => api.check.detail(appid), { quiet: true })
  } catch (err) {
    detailError.value = err?.message || String(err)
  } finally {
    loadingDetail.value = false
  }
}
</script>
