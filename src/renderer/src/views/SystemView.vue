<template>
  <div>
    <div class="page-header">
      <h1>Wizard de pacotes</h1>
      <span class="page-sub">Detecta a distro + GPU e instala em tempo real o stack de gaming Proton (gamescope, mangohud, vulkan, steam, protontricks).</span>
    </div>

    <!-- Summary -->
    <div id="sys-summary" class="sys-summary">
      <p v-if="loadingScan" class="sys-loading">consultando o sistema…</p>
      <p v-else-if="scanError" class="sys-err">erro no scan: {{ scanError }}</p>
      <div v-else-if="scan" class="sys-card">
        <div class="sys-card-row">
          <span class="sys-card-label">Distro</span>
          <span class="sys-card-value">
            {{ scan.distro.prettyName || scan.distro.id }}
            <span class="sys-pill">{{ scan.distro.family }} · {{ scan.distro.packageManager }}</span>
          </span>
        </div>
        <div class="sys-card-row">
          <span class="sys-card-label">GPU</span>
          <span class="sys-card-value">
            {{ scan.gpu.model || '(não detectada)' }}
            <span class="sys-pill" :class="'sys-pill-' + scan.gpu.vendor">{{ scan.gpu.vendor }}</span>
          </span>
        </div>
        <div class="sys-card-row">
          <span class="sys-card-label">User</span>
          <span class="sys-card-value"><code>{{ scan.user }}</code></span>
        </div>
        <div class="sys-card-row">
          <span class="sys-card-label">Multilib / i386</span>
          <span class="sys-card-value">
            <span v-if="scan.multilibEnabled" class="sys-ok">habilitado</span>
            <span v-else class="sys-err">desabilitado</span>
          </span>
        </div>
        <div class="sys-card-row">
          <span class="sys-card-label">Sudoers</span>
          <span class="sys-card-value">
            <span v-if="scan.sudoersInstalled" class="sys-ok">configurado</span>
            <span v-else class="sys-warn">faltando — veja Setup inicial</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Sudoers setup -->
    <section
      v-if="sudoers && sudoers.content && sudoers.setupCommand"
      class="sys-sudoers"
      :class="{ 'sys-sudoers-ok': sudoers.sudoersInstalled }"
    >
      <h2>Setup inicial — autorização sudo</h2>
      <p class="sys-sudoers-explain">
        Pra evitar prompt de senha a cada install, o ProtonDeck precisa de um
        <code>/etc/sudoers.d/protondeck</code> com whitelist dos subcomandos do gerenciador
        de pacotes. Rode <strong>uma vez</strong> no terminal:
      </p>
      <pre class="sys-sudoers-cmd">{{ sudoers.setupCommand }}</pre>
      <button type="button" class="btn-preview" @click="copySudoersCmd">{{ copyLabel }}</button>
      <details class="sys-sudoers-detail">
        <summary>Ver o conteúdo do sudoers que isso instala</summary>
        <pre class="sys-sudoers-content">{{ sudoers.content }}</pre>
      </details>
    </section>

    <!-- Groups -->
    <section class="sys-groups">
      <p v-if="!loadingScan && groups.length === 0 && scan" class="sys-empty">
        Distro não suportada pelo wizard. Suportadas hoje: Arch/CachyOS, Ubuntu/Debian, Fedora.
      </p>
      <div
        v-for="g in groups"
        :key="g.id"
        class="sys-group"
        :class="{ 'sys-group-ok': g.satisfied }"
      >
        <div class="sys-group-head">
          <div>
            <div class="sys-group-label">
              {{ g.label }}
              <span v-if="g.satisfied" class="sys-ok">✓ ok</span>
              <span v-else class="sys-warn">pendente</span>
            </div>
            <div class="sys-group-desc">{{ g.description }}</div>
          </div>
          <button
            type="button"
            class="btn-preview sys-install-btn"
            :disabled="installing"
            @click="openInstall(g.id, g.label)"
          >
            {{ g.satisfied ? 'Reinstalar' : 'Instalar' }}
          </button>
        </div>
        <div v-if="g.packages && g.packages.length" class="sys-pkgs">
          <span
            v-for="p in g.packages"
            :key="p.name"
            class="sys-pkg"
            :class="p.installed ? 'sys-pkg-ok' : 'sys-pkg-missing'"
          >
            {{ p.installed ? '✓' : '·' }} {{ p.name }}
          </span>
        </div>
        <div v-if="g.warning" class="sys-warning">⚠ {{ g.warning }}</div>
      </div>
    </section>

    <!-- Terminal modal -->
    <div
      v-if="termVisible"
      class="sys-term-backdrop"
      @click.self="closeTerm"
    >
      <div class="sys-term">
        <div class="sys-term-head">
          <span>{{ termTitle }}</span>
          <button type="button" class="sys-term-close" @click="closeTerm">&times;</button>
        </div>
        <pre ref="termLogEl" class="sys-term-log">
          <div
            v-for="(line, i) in termLines"
            :key="i"
            class="sys-term-line"
            :class="line.cls"
          >{{ line.text }}</div>
        </pre>
        <div class="sys-term-status" :class="termStatusCls">{{ termStatus }}</div>
        <div v-if="installing" style="margin-top:8px">
          <button type="button" class="btn-preview" @click="cancelInstall">Cancelar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { api, call, toast } from '../api'

// ─── State ────────────────────────────────────────────────
const loadingScan = ref(true)
const scanError   = ref(null)
const scan        = ref(null)
const groups      = ref([])
const sudoers     = ref(null)

const copyLabel   = ref('Copiar comando')

// Terminal modal
const termVisible  = ref(false)
const termTitle    = ref('Instalando…')
const termLines    = ref([])
const termStatus   = ref('conectando…')
const termStatusCls = ref('sys-term-status')
const termLogEl    = ref(null)
const installing   = ref(false)

// ─── Load ─────────────────────────────────────────────────
async function loadScan() {
  loadingScan.value = true
  scanError.value = null
  try {
    const data = await call(() => api.system.scan(), { quiet: true })
    // data = { scan, groups } (groupStatuses)
    scan.value = data.scan
    groups.value = data.groups || []
  } catch (err) {
    scanError.value = err?.message || String(err)
  } finally {
    loadingScan.value = false
  }
  await loadSudoers()
}

async function loadSudoers() {
  try {
    const data = await call(() => api.system.sudoers(), { quiet: true })
    sudoers.value = data
  } catch {
    // silencioso — sudoers é opcional
  }
}

// ─── Sudoers copy ─────────────────────────────────────────
async function copySudoersCmd() {
  if (!sudoers.value?.setupCommand) return
  try {
    await navigator.clipboard.writeText(sudoers.value.setupCommand)
    copyLabel.value = 'Copiado!'
    setTimeout(() => { copyLabel.value = 'Copiar comando' }, 1500)
  } catch {
    toast('Falha ao copiar')
  }
}

// ─── Terminal helpers ──────────────────────────────────────
function appendLine(prefix, text, cls) {
  termLines.value.push({ text: (prefix ? prefix + ' ' : '') + text, cls: 'sys-term-line ' + (cls || '') })
  nextTick(() => {
    if (termLogEl.value) termLogEl.value.scrollTop = termLogEl.value.scrollHeight
  })
}

function closeTerm() {
  if (installing.value) {
    api.system.cancelInstall()
  }
  termVisible.value = false
}

function cancelInstall() {
  api.system.cancelInstall()
}

// ─── Install ──────────────────────────────────────────────
async function openInstall(groupId, label) {
  termTitle.value = label
  termLines.value = []
  termStatus.value = 'conectando…'
  termStatusCls.value = 'sys-term-status'
  termVisible.value = true
  installing.value = true

  try {
    const result = await api.system.install(groupId, (ev) => {
      if (ev.type === 'start') {
        appendLine('▸', `iniciando ${ev.label} (${ev.commands} comando(s))`, 'sys-term-info')
        termStatus.value = 'executando…'
      } else if (ev.type === 'cmd') {
        appendLine('$', ev.cmd, 'sys-term-cmd')
      } else if (ev.type === 'stdout') {
        appendLine('', ev.line, 'sys-term-stdout')
      } else if (ev.type === 'stderr') {
        appendLine('!', ev.line, 'sys-term-stderr')
      } else if (ev.type === 'exit') {
        appendLine('▸', `exit code ${ev.code}`, ev.code === 0 ? 'sys-term-info' : 'sys-term-stderr')
      } else if (ev.type === 'error') {
        appendLine('✕', ev.message, 'sys-term-stderr')
      } else if (ev.type === 'done') {
        termStatus.value = ev.ok
          ? '✓ concluído com sucesso'
          : '✕ falhou' + (ev.failedAt != null ? ` no comando ${ev.failedAt + 1}` : '')
        termStatusCls.value = 'sys-term-status ' + (ev.ok ? 'sys-term-ok' : 'sys-term-err')
        if (ev.ok) setTimeout(loadScan, 600)
      }
    })
    // Garantia: se o evento 'done' não veio via onEvent, usa o resultado da promise
    if (result && termStatus.value === 'executando…') {
      termStatus.value = result.ok
        ? '✓ concluído com sucesso'
        : '✕ falhou' + (result.failedAt != null ? ` no comando ${result.failedAt + 1}` : '')
      termStatusCls.value = 'sys-term-status ' + (result.ok ? 'sys-term-ok' : 'sys-term-err')
      if (result.ok) setTimeout(loadScan, 600)
    }
  } catch (err) {
    appendLine('✕', err?.message || String(err), 'sys-term-stderr')
    termStatus.value = '✕ erro'
    termStatusCls.value = 'sys-term-status sys-term-err'
  } finally {
    installing.value = false
  }
}

onMounted(loadScan)
</script>
