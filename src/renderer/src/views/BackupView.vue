<template>
  <div>
    <div class="page-header">
      <h1>Backup &amp; Import</h1>
      <span class="page-sub">Dois níveis: <strong>banco completo</strong> (.db — não perde nada ao trocar de máquina/reinstalar) ou só os <strong>overrides</strong> (.json — pra compartilhar com amigos).</span>
    </div>

    <section class="backup-card">
      <h2>Banco completo (.db)</h2>
      <p class="backup-explain">Snapshot do banco INTEIRO: jogos, overrides, credenciais Steam, config de IA, snapshots e caches. Use pra migrar tudo entre máquinas ou pra ter um backup antes de reinstalar.</p>
      <div class="backup-db-actions">
        <button type="button" class="btn-preview backup-download" :disabled="dbExporting" @click="doDbExport">
          {{ dbExporting ? 'Exportando…' : '↓ Exportar banco (.db)' }}
        </button>
        <button type="button" class="btn-preview" :disabled="dbImporting || dbRestoring" @click="doDbImport">
          {{ dbImporting ? 'Abrindo…' : '↑ Restaurar de um .db' }}
        </button>
      </div>

      <p v-if="dbError" class="backup-err">{{ dbError }}</p>

      <div v-if="dbPreview" class="backup-db-restore">
        <div class="backup-summary">
          Backup selecionado:
          <strong>{{ dbPreview.stats.games }}</strong> jogos ·
          <span class="backup-ok">{{ dbPreview.stats.overrides }} overrides</span> ·
          {{ dbPreview.stats.snapshots }} snapshots ·
          steam {{ dbPreview.stats.steamConfig ? '✓' : '—' }} ·
          IA {{ dbPreview.stats.aiConfig ? '✓' : '—' }}
        </div>
        <p class="backup-warn">⚠ Restaurar <strong>substitui todo o banco atual</strong> (um <code>.bak</code> do atual é guardado) e <strong>reinicia o app</strong>.</p>
        <button type="button" class="btn-preview backup-danger" :disabled="dbRestoring" @click="doDbRestore">
          {{ dbRestoring ? 'Restaurando e reiniciando…' : 'Substituir banco e reiniciar' }}
        </button>
        <button type="button" class="btn-preview backup-cancel" :disabled="dbRestoring" @click="dbPreview = null">Cancelar</button>
      </div>
    </section>

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

// backup completo do banco (.db)
const dbExporting = ref(false)
const dbImporting = ref(false)
const dbRestoring = ref(false)
const dbError = ref(null)
const dbPreview = ref(null) // { path, stats }

const previewError = ref(null)
const preview = ref(null)   // { summary, plan, payload }
const applied = ref(null)   // { applied, skipped }

function launchSnippet(s) {
  if (!s) return ''
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

async function doDbExport() {
  dbExporting.value = true
  dbError.value = null
  try {
    const r = await call(() => api.db.export(), { quiet: true })
    if (r.canceled) return
    toast(`Banco exportado: ${r.path}`, 'success')
  } catch (err) {
    dbError.value = err?.message || 'Erro ao exportar banco'
  } finally {
    dbExporting.value = false
  }
}

async function doDbImport() {
  dbImporting.value = true
  dbError.value = null
  dbPreview.value = null
  try {
    const r = await call(() => api.db.importPreview(), { quiet: true })
    if (r.phase === 'canceled') return
    if (r.phase === 'error') { dbError.value = r.error; return }
    dbPreview.value = { path: r.path, stats: r.stats }
  } catch (err) {
    dbError.value = err?.message || 'Erro ao ler backup'
  } finally {
    dbImporting.value = false
  }
}

async function doDbRestore() {
  if (!dbPreview.value) return
  dbRestoring.value = true
  dbError.value = null
  try {
    // o app reinicia ao aplicar — esta promise não resolve normalmente
    await call(() => api.db.importApply(dbPreview.value.path), { quiet: true })
  } catch (err) {
    dbError.value = err?.message || 'Erro ao restaurar banco'
    dbRestoring.value = false
  }
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

<style scoped>
.backup-db-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.backup-db-restore {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--border, #2a2f3a);
  border-radius: 10px;
  background: rgba(180, 65, 60, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.backup-danger {
  background: #b4413c;
  border-color: #b4413c;
  color: #fff;
}
.backup-danger:hover:not(:disabled) { background: #c84a44; }
.backup-cancel {
  background: transparent;
}
</style>
