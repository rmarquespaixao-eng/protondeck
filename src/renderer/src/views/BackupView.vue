<template>
  <div>
    <div class="page-header">
      <h1>Backup &amp; Import</h1>
      <span class="page-sub">Exporta seus overrides (<code>user_launch_options</code> + <code>user_notes</code>) num JSON — pra mover pra outra máquina ou compartilhar com amigos.</span>
    </div>

    <section class="backup-card">
      <h2>Export</h2>
      <p class="backup-explain">Baixa um JSON com todos os jogos que têm override ou notas pessoais. Não inclui dados da Steam — só o que você editou.</p>
      <button type="button" class="btn-preview backup-download" :disabled="exporting" @click="doExport">
        {{ exporting ? 'Exportando…' : '↓ Exportar overrides' }}
      </button>
    </section>

    <section class="backup-card">
      <h2>Import</h2>
      <p class="backup-explain">Aceita arquivos no formato <code>protondeck-config-export</code>. Faz preview antes — só aplica depois que você confirmar.</p>
      <button type="button" class="btn-preview" :disabled="importing" @click="doImport">
        {{ importing ? 'Abrindo…' : '↑ Selecionar arquivo JSON' }}
      </button>

      <div id="backup-preview">
        <!-- erro de parse / validação -->
        <p v-if="previewError" class="backup-err">{{ previewError }}</p>

        <!-- preview -->
        <template v-if="preview">
          <div class="backup-summary">
            <strong>{{ preview.summary.total }}</strong> entradas ·
            <span class="backup-ok">{{ preview.summary.inLibrary }} na biblioteca</span> ·
            <span class="backup-warn">{{ preview.summary.notInLibrary }} ignoradas</span>
          </div>

          <table class="backup-table">
            <thead>
              <tr>
                <th>appid</th>
                <th>nome</th>
                <th>status</th>
                <th>launch (preview)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in preview.plan"
                :key="p.appid"
                :class="p.inLibrary ? '' : 'backup-row-skip'"
              >
                <td><code>{{ p.appid }}</code></td>
                <td>
                  <span v-if="p.name">{{ p.name }}</span>
                  <span v-else class="backup-muted">(não importado)</span>
                </td>
                <td>
                  <span v-if="p.inLibrary" class="backup-ok">✓ vai aplicar</span>
                  <span v-else class="backup-warn">· não está na biblioteca, ignorado</span>
                </td>
                <td>
                  <code class="backup-snippet">{{ launchSnippet(p.user_launch_options) }}</code>
                </td>
              </tr>
            </tbody>
          </table>

          <template v-if="preview.summary.inLibrary > 0">
            <button
              type="button"
              id="backup-apply"
              class="btn-preview"
              :disabled="applying"
              @click="doApply"
            >
              {{ applying ? 'Aplicando import…' : `Aplicar import (sobrescreve ${preview.summary.inLibrary} overrides existentes)` }}
            </button>
          </template>
          <p v-else class="backup-muted">
            Nenhum jogo do JSON está na sua biblioteca local. Rode o sync primeiro.
          </p>
        </template>

        <!-- resultado após aplicar -->
        <template v-if="applied">
          <p class="backup-ok">✓ Aplicado: {{ applied.applied }} overrides atualizados, {{ applied.skipped }} ignorados.</p>
          <p class="backup-muted">Os jogos atualizados agora mostram o novo override na lista da biblioteca.</p>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { api, call, toast } from '../api'

const exporting = ref(false)
const importing = ref(false)
const applying = ref(false)

const previewError = ref(null)
const preview = ref(null)   // { summary, plan, payload }
const applied = ref(null)   // { applied, skipped }

function launchSnippet(s) {
  if (!s) return ''
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

async function doExport() {
  exporting.value = true
  try {
    const r = await call(() => api.backup.export(), { quiet: true })
    if (r.canceled) return
    toast(`Exportado: ${r.path}`, 'success')
  } catch (err) {
    toast(err?.message || 'Erro ao exportar')
  } finally {
    exporting.value = false
  }
}

async function doImport() {
  importing.value = true
  previewError.value = null
  preview.value = null
  applied.value = null
  try {
    const r = await call(() => api.backup.import(), { quiet: true })
    if (r.phase === 'canceled') return
    if (r.phase === 'error') {
      previewError.value = r.error || 'Erro ao ler arquivo'
      return
    }
    // phase === 'preview'
    preview.value = { summary: r.summary, plan: r.plan, payload: r.payload }
  } catch (err) {
    previewError.value = err?.message || 'Erro ao importar'
  } finally {
    importing.value = false
  }
}

async function doApply() {
  if (!preview.value) return
  applying.value = true
  try {
    const r = await call(() => api.backup.applyImport(preview.value.payload), { quiet: true })
    applied.value = { applied: r.applied, skipped: r.skipped }
    preview.value = null
  } catch (err) {
    previewError.value = err?.message || 'Erro ao aplicar import'
  } finally {
    applying.value = false
  }
}
</script>
