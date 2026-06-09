<template>
  <div>
    <div class="page-header">
      <h1>Atualizações</h1>
      <span class="page-sub">Versão instalada: <strong>v{{ st.currentVersion }}</strong></span>
    </div>

    <div v-if="!st.supported" class="banner banner-warn">
      Atualização automática só funciona na versão instalada (AppImage ou .deb). Em modo de desenvolvimento não há feed de update.
    </div>

    <div class="update-card">
      <!-- idle / not-available -->
      <template v-if="st.status === 'idle' || st.status === 'not-available'">
        <p class="meta">
          {{ st.status === 'not-available' ? 'Você está na versão mais recente. ✓' : 'Clique para checar se há uma versão nova no GitHub.' }}
        </p>
      </template>

      <!-- checking -->
      <template v-else-if="st.status === 'checking'">
        <p class="meta"><span class="pd-spinner" aria-hidden="true"></span> Verificando atualizações…</p>
      </template>

      <!-- available (deb/outro: só notifica) ou downloading/downloaded (AppImage) -->
      <template v-else-if="st.status === 'available'">
        <p><strong>v{{ st.newVersion }}</strong> disponível.</p>
        <p v-if="st.canAutoInstall" class="meta">Baixando automaticamente…</p>
        <p v-else class="meta">Sua instalação (.deb) não se autoatualiza — baixe o novo pacote do release.</p>
      </template>

      <template v-else-if="st.status === 'downloading'">
        <p><strong>v{{ st.newVersion }}</strong> — baixando {{ st.progressPercent ?? 0 }}%</p>
        <div class="progress"><div class="progress-bar" :style="{ width: (st.progressPercent ?? 0) + '%' }"></div></div>
      </template>

      <template v-else-if="st.status === 'downloaded'">
        <p><strong>v{{ st.newVersion }}</strong> baixada e pronta. Reinicie o app pra aplicar.</p>
      </template>

      <template v-else-if="st.status === 'error'">
        <p class="banner banner-warn" style="margin:0">Erro ao verificar/baixar: {{ st.error }}</p>
      </template>

      <div class="actions" style="margin-top:16px">
        <button type="button" :disabled="busy || st.status === 'checking' || st.status === 'downloading'" @click="check">
          Verificar atualizações
        </button>
        <button
          v-if="st.status === 'downloaded' && st.canAutoInstall"
          type="button"
          class="primary"
          @click="install"
        >
          Reiniciar e atualizar
        </button>
        <a
          v-if="(st.status === 'available' && !st.canAutoInstall) || st.status === 'error'"
          href="#"
          class="btn-link"
          @click.prevent="openRelease"
        >
          Abrir release no GitHub ↗
        </a>
      </div>
    </div>

    <details class="system" style="margin-top:24px">
      <summary>Como funciona</summary>
      <ul style="color:var(--muted);font-size:13px">
        <li><strong>AppImage:</strong> baixa a nova versão em background e troca o binário ao reiniciar (1 clique).</li>
        <li><strong>.deb:</strong> o gerenciador de pacotes é quem instala — o app só te avisa e abre o release pra você baixar o novo <code>.deb</code>.</li>
        <li>O feed de update vem dos <a href="#" @click.prevent="openRelease">GitHub Releases</a> do projeto. Seus dados (<code>panel.db</code>) ficam no userData e não são afetados pela atualização.</li>
      </ul>
    </details>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api, call, toast, openExternal, ui } from '../api'

const st = ref({
  status: 'idle', currentVersion: '', newVersion: null, progressPercent: null,
  error: null, canAutoInstall: false, releaseUrl: '', supported: false,
})
const busy = computed(() => ui.busy > 0)
let unsub = null

async function check() {
  try { st.value = await call(() => api.updater.check()) } catch { /* toast já mostrado */ }
}

async function install() {
  try {
    const r = await call(() => api.updater.install())
    if (!r?.ok) toast(r?.error || 'não foi possível instalar')
  } catch { /* toast já mostrado */ }
}

function openRelease() {
  openExternal(st.value.releaseUrl || 'https://github.com/rmarquespaixao-eng/protondeck/releases/latest')
}

onMounted(async () => {
  try { st.value = await api.updater.state() } catch { /* noop */ }
  unsub = api.updater.onEvent((next) => { st.value = next })
})
onUnmounted(() => { if (unsub) unsub() })
</script>
