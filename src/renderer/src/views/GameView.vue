<template>
  <div v-if="!game && loaded">
    <p style="color:var(--tier-borked);margin-top:32px">Jogo não encontrado.</p>
  </div>

  <div v-else-if="game">
    <router-link class="back" to="/">&larr; voltar</router-link>
    <div class="page-header">
      <h1>{{ game.name }}</h1>
      <span class="page-sub">
        <code>appid {{ game.appid }}</code> ·
        <span class="badge" :class="'tier-' + game.tier">{{ game.tier }}</span>
        <template v-if="game.trending_tier && game.trending_tier !== game.tier">
          &nbsp;<span class="badge trend">trend: {{ game.trending_tier }}</span>
        </template>
        · {{ game.reports }} reports
        · {{ Math.round((game.playtime_minutes || 0) / 6) / 10 }}h jogadas
        · {{ game.installed ? 'instalado' : 'na nuvem' }}
      </span>
    </div>

    <p class="meta">
      <span class="badge" :class="'config-' + (game.config_source || 'generic')">{{ game.config_source || 'generic' }}</span>
      · engine: <code>{{ game.engine || 'unknown' }}</code>
      · Proton: <code>{{ game.proton || 'proton-experimental' }}</code>
    </p>

    <!-- Monitor picker -->
    <div v-if="monitors.length > 0" class="monitor-picker">
      <label>Monitor pra fullscreen:
        <select v-model="selectedMonitor">
          <option v-for="m in monitors" :key="m.name" :value="m.name">
            {{ m.name }} · {{ m.width }}x{{ m.height }}@{{ m.refresh }}Hz{{ m.priority === 1 ? ' (primário)' : '' }}{{ m.hdr ? ' HDR' : '' }}
          </option>
          <option value="">(sem SDL_VIDEO_FULLSCREEN_DISPLAYS)</option>
        </select>
      </label>
      <span class="hint">altera <code>SDL_VIDEO_FULLSCREEN_DISPLAYS</code> no preview da launch curada sem salvar override</span>
    </div>

    <!-- PCGamingWiki widescreen section -->
    <section class="pcgw-section" :data-appid="game.appid">
      <div class="pcgw-header">
        <h2 class="pcgw-title">Suporte a resolução · PCGamingWiki</h2>
        <div class="pcgw-actions">
          <a
            v-if="pcgwPageUrl"
            class="pcgw-link"
            href="#"
            @click.prevent="openExternal(pcgwPageUrl)"
          >abrir wiki ↗</a>
          <button type="button" class="pcgw-refresh" title="Re-busca ignorando cache" @click="loadPCGW(true)">↻</button>
        </div>
      </div>
      <div class="pcgw-body">
        <p v-if="pcgwLoading" class="pcgw-loading">consultando wiki…</p>
        <template v-else-if="pcgwData">
          <p v-if="!pcgwData.found" class="pcgw-empty">{{ pcgwData.reason || 'sem info na wiki' }}</p>
          <template v-else>
            <div
              v-if="pcgwData.features && pcgwData.features.ultrawidescreen && pcgwData.features.ultrawidescreen.state === 'hackable'"
              class="pcgw-hint pcgw-hint-warn"
            >Ultra-widescreen 21:9 via mod/hack — veja as notas e o link da wiki pra instruções.</div>
            <div
              v-if="pcgwData.features && pcgwData.features.ultrawidescreen && pcgwData.features.ultrawidescreen.state === 'unsupported'"
              class="pcgw-hint pcgw-hint-err"
            >Ultra-widescreen 21:9 não suportado nativamente. Considere <code>gamescope -W/-H</code> para forçar resolução.</div>
            <div v-if="pcgwRows.length" class="pcgw-table">
              <div
                v-for="row in pcgwRows"
                :key="row.key"
                class="pcgw-row"
                :class="'pcgw-state-' + row.state"
              >
                <div class="pcgw-row-label">{{ row.featureLabel }}</div>
                <div class="pcgw-row-state">
                  <span class="pcgw-badge" :class="'pcgw-badge-' + row.state">{{ row.stateLabel }}</span>
                </div>
                <div class="pcgw-row-notes">
                  <span v-if="row.notes">{{ row.notes }}</span>
                  <span v-else class="pcgw-muted">—</span>
                </div>
              </div>
            </div>
            <p v-else class="pcgw-empty">A página existe na wiki mas a tabela de Video não foi reconhecida.</p>
            <p v-if="pcgwData.fetched_at" class="pcgw-fetched">atualizado em {{ new Date(pcgwData.fetched_at).toLocaleString() }}</p>
          </template>
        </template>
        <p v-else-if="pcgwError" class="pcgw-empty pcgw-err">erro: {{ pcgwError }}</p>
      </div>
    </section>

    <!-- Engine bar -->
    <div class="engine-bar">
      <span class="engine-label">
        Engine: <strong>{{ game.engine || 'unknown' }}</strong>
        <span class="badge" :class="'config-' + (game.engine_source || 'generic')" style="margin-left:4px">{{ game.engine_source || 'generic' }}</span>
      </span>
      <button
        v-if="enginePreset"
        type="button"
        class="btn-preset"
        :title="enginePreset.note"
        @click="applyEnginePreset(game.engine)"
      >Aplicar preset {{ enginePreset.label }}</button>
      <select
        v-model="manualPresetKey"
        style="background:var(--panel-2);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:12px"
      >
        <option value="">— outro engine —</option>
        <option v-for="(p, eid) in ENGINE_PRESETS" :key="eid" :value="eid">{{ p.label }}</option>
      </select>
      <button type="button" class="btn-preset btn-preset-secondary" @click="applyEnginePreset(manualPresetKey)">Aplicar</button>
    </div>
    <p v-if="enginePreset" class="engine-note">{{ enginePreset.note }}</p>
    <p v-if="presetAppliedNote" id="preset-applied-note" class="engine-note engine-note-applied">{{ presetAppliedNote }}</p>

    <!-- Main builder -->
    <div class="builder-layout">

      <!-- ========== LEFT: Options ========== -->
      <div class="options-col">

        <!-- Wrappers section -->
        <section class="opt-cat">
          <div class="opt-cat-title">Wrappers — comandos que envolvem o jogo</div>

          <div v-for="w in WRAPPER_OPTIONS" :key="w.key" class="opt-row">
            <input
              type="checkbox"
              :id="'wrap_' + w.key"
              class="wrap-cb"
              :data-prefix="w.prefix"
              :checked="currentWrappers.includes(w.key)"
              @change="toggleWrapper(w.key, $event.target.checked)"
            />
            <div class="opt-meta">
              <label :for="'wrap_' + w.key"><strong>{{ w.label }}</strong> <code class="flag-code">{{ w.prefix }}</code></label>
              <span class="desc">{{ w.description }}</span>
            </div>
          </div>

          <!-- Gamescope (special wrapper) -->
          <div class="opt-row">
            <input
              type="checkbox"
              id="wrap_gamescope"
              class="wrap-cb"
              data-is-gamescope="1"
              :checked="gamescopeEnabled"
              @change="toggleGamescope($event.target.checked)"
            />
            <div class="opt-meta">
              <label for="wrap_gamescope"><strong>Gamescope</strong> <code class="flag-code">gamescope [opts] --</code></label>
              <span class="desc">Compositor Valve — força resolução, confina cursor, upscale FSR/NIS. Solução ideal quando o jogo não detecta o monitor.</span>
              <details class="opt-tip">
                <summary>quando usar?</summary>
                <p>USE quando: jogo abre no monitor errado; jogo não aceita resolução ultrawide; cursor escapa pro segundo monitor. O gamescope cria um ambiente de display isolado. Com ele ativo, SDL_VIDEODRIVER e SDL_VIDEO_FULLSCREEN_DISPLAYS ficam desnecessários — use --prefer-output e -W/-H dentro do painel abaixo.</p>
              </details>
            </div>
          </div>
          <div v-show="gamescopeEnabled" class="gamescope-panel">
            <div class="gs-hint">Opções inseridas entre <code>gamescope</code> e <code>--</code></div>
            <div class="gs-presets">
              <span style="color:var(--muted);font-size:11px;margin-right:6px">Preset:</span>
              <button type="button" @click="gsPreset(3440, 1440, 100)">3440×1440@100Hz</button>
              <button type="button" @click="gsPreset(2560, 1600, 60)">2560×1600@60Hz</button>
              <button type="button" @click="gsPreset(1920, 1080, 144)">1920×1080@144Hz</button>
            </div>
            <div v-for="opt in GAMESCOPE_OPTIONS" :key="opt.key" class="gs-row">
              <input
                type="checkbox"
                :id="'gs_cb_' + opt.key"
                class="gs-opt-cb"
                :data-key="opt.key"
                :data-flag="opt.flag"
                :data-type="opt.type"
                :checked="gamescopeValues[opt.flag] !== undefined"
                @change="toggleGsOpt(opt, $event.target.checked)"
              />
              <label :for="'gs_cb_' + opt.key" class="gs-label">
                <code>{{ opt.flag }}</code>
                <span style="color:var(--muted);font-size:12px;margin-left:4px">{{ opt.label.replace(/^-\S+\s+/, '') }}</span>
              </label>
              <template v-if="opt.type !== 'toggle'">
                <select
                  v-if="opt.type === 'select' && opt.options"
                  :id="'gs_val_' + opt.key"
                  class="gs-val-input"
                  :value="gamescopeValues[opt.flag] !== undefined ? gamescopeValues[opt.flag] : (opt.defaultValue || '')"
                  @change="setGsVal(opt, $event.target.value)"
                >
                  <option v-for="o in opt.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
                <input
                  v-else
                  type="text"
                  :id="'gs_val_' + opt.key"
                  class="gs-val-input"
                  :value="gamescopeValues[opt.flag] !== undefined ? gamescopeValues[opt.flag] : (opt.defaultValue || '')"
                  :placeholder="opt.defaultValue || ''"
                  @input="setGsVal(opt, $event.target.value)"
                />
              </template>
              <span class="desc gs-desc">{{ opt.description }}</span>
            </div>
          </div>
        </section>

        <!-- Env vars grouped by category -->
        <template v-for="cat in envCategories" :key="cat">
          <section class="opt-cat">
            <div class="opt-cat-title">{{ cat }}</div>
            <div v-for="opt in envOptionsByCategory(cat)" :key="opt.key" class="opt-row">
              <input
                type="checkbox"
                :id="'env_' + opt.key"
                class="env-cb"
                :data-key="opt.key"
                :checked="currentEnv[opt.key] !== undefined"
                @change="toggleEnv(opt.key, $event.target.checked)"
              />
              <div class="opt-meta">
                <label :for="'env_' + opt.key"><strong>{{ opt.label }}</strong> <code class="flag-code">{{ opt.key }}</code></label>
                <span class="desc">{{ opt.description }}</span>
                <details v-if="opt.tip" class="opt-tip">
                  <summary>quando usar?</summary>
                  <p>{{ opt.tip }}</p>
                </details>
              </div>
              <div class="opt-value">
                <select
                  v-if="opt.type === 'toggle'"
                  class="env-val"
                  :data-key="opt.key"
                  :value="currentEnv[opt.key] !== undefined ? currentEnv[opt.key] : opt.defaultValue"
                  @change="setEnvVal(opt.key, $event.target.value)"
                >
                  <option value="1">1 (on)</option>
                  <option value="0">0 (off)</option>
                </select>
                <select
                  v-else-if="opt.type === 'select' && opt.options"
                  class="env-val"
                  :data-key="opt.key"
                  :value="currentEnv[opt.key] !== undefined ? currentEnv[opt.key] : opt.defaultValue"
                  @change="setEnvVal(opt.key, $event.target.value)"
                >
                  <option v-for="o in opt.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
                <input
                  v-else
                  type="text"
                  class="env-val"
                  :data-key="opt.key"
                  :value="currentEnv[opt.key] !== undefined ? currentEnv[opt.key] : opt.defaultValue"
                  :placeholder="opt.defaultValue"
                  @input="setEnvVal(opt.key, $event.target.value)"
                />
              </div>
            </div>
          </section>
        </template>

        <!-- Args section -->
        <section class="opt-cat">
          <div class="opt-cat-title">Args — passados após %command%</div>
          <template v-for="cat in argCategories" :key="cat">
            <div style="padding:6px 10px 2px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em">{{ cat }}</div>
            <div v-for="arg in argOptionsByCategory(cat)" :key="arg.key" class="opt-row">
              <input
                type="checkbox"
                :id="'arg_' + arg.key"
                class="arg-cb"
                :data-value="arg.value"
                :checked="currentArgs.includes(arg.value)"
                @change="toggleArg(arg.value, $event.target.checked)"
              />
              <div class="opt-meta">
                <label :for="'arg_' + arg.key"><code>{{ arg.label }}</code> <span class="desc" style="display:inline">{{ arg.description }}</span></label>
                <details v-if="arg.tip" class="opt-tip">
                  <summary>quando usar?</summary>
                  <p>{{ arg.tip }}</p>
                </details>
              </div>
            </div>
          </template>
        </section>

        <!-- Resolution section -->
        <section class="opt-cat">
          <div class="opt-cat-title">Forçar Resolução — args pós %command%</div>
          <div class="res-note">
            Para jogos que não detectam o monitor: RE Engine (Resident Evil, DMC5, Monster Hunter World), alguns UE4.
            Marque o <strong>formato</strong> que o jogo aceita e defina a resolução abaixo.
            <details class="opt-tip" style="margin-top:4px">
              <summary>como descobrir o formato correto?</summary>
              <p>Tente -width/-height primeiro (RE Engine, maioria UE4/UE5). Se não funcionar, -screen-width/-screen-height (Unity). Para Source Engine use gamescope com -w/-h em vez disto. Consulte a wiki do jogo no PCGamingWiki — geralmente lista os args aceitos.</p>
            </details>
          </div>
          <div class="res-shared">
            <label for="shared-res-w">Largura</label>
            <input
              type="text"
              id="shared-res-w"
              class="res-input"
              v-model="resWidth"
            />
            <span style="color:var(--muted)">×</span>
            <label for="shared-res-h">Altura</label>
            <input
              type="text"
              id="shared-res-h"
              class="res-input"
              v-model="resHeight"
            />
            <div class="res-presets-inline">
              <button type="button" @click="setRes(3440, 1440)">3440×1440</button>
              <button type="button" @click="setRes(2560, 1600)">2560×1600</button>
              <button type="button" @click="setRes(1920, 1080)">1920×1080</button>
            </div>
          </div>
          <div v-for="fmt in RESOLUTION_FORMATS" :key="fmt.key" class="opt-row">
            <input
              type="checkbox"
              :id="'res_' + fmt.key"
              class="res-fmt-cb"
              :data-wflag="fmt.widthFlag"
              :data-hflag="fmt.heightFlag"
              :data-fmtkey="fmt.key"
              :checked="currentResFormats.includes(fmt.key)"
              @change="toggleResFmt(fmt.key, $event.target.checked)"
            />
            <div class="opt-meta">
              <label :for="'res_' + fmt.key"><code>{{ fmt.widthFlag }} {w} {{ fmt.heightFlag }} {h}</code> <span style="color:var(--muted);font-size:11px">{{ fmt.label }}</span></label>
              <span class="desc">{{ fmt.description }}</span>
            </div>
          </div>
        </section>

      </div><!-- /options-col -->

      <!-- ========== RIGHT: Preview + Diagnóstico ========== -->
      <div class="preview-col">
        <div class="preview-box">
          <div style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Preview ao vivo</div>
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;min-height:60px;color:var(--text);font-size:12px">{{ previewString }}</pre>
        </div>
        <div class="preview-actions">
          <button type="button" class="btn-preview" @click="copyPreview">{{ copyLabel }}</button>
          <button type="button" class="btn-preview btn-save" :disabled="savingLaunch" @click="saveLaunch">
            <span v-if="savingLaunch" class="pd-spinner"></span>
            {{ savingLaunch ? 'Salvando...' : 'Salvar override' }}
          </button>
          <button
            v-if="game.user_launch_options"
            type="button"
            class="btn-preview btn-clear"
            title="Remove o override e volta a usar a launch curada"
            :disabled="clearingLaunch"
            @click="clearLaunch"
          >
            <span v-if="clearingLaunch" class="pd-spinner"></span>
            {{ clearingLaunch ? 'Limpando...' : 'Limpar override' }}
          </button>
        </div>

        <!-- Steam apply panel -->
        <div class="steam-apply-panel">
          <div class="steam-apply-status" v-html="steamStatusHtml"></div>
          <button
            type="button"
            class="btn-preview btn-steam-apply"
            :disabled="!steamApplyReady || applyingSteam"
            @click="applySteam"
          >
            <span v-if="applyingSteam" class="pd-spinner"></span>
            {{ applyingSteam ? 'Aplicando...' : 'Aplicar no Steam' }}
          </button>
          <div v-html="steamCurrentHtml"></div>
        </div>

        <!-- Diagnóstico -->
        <div class="diag-panel">
          <div class="diag-title">Diagnóstico</div>
          <div>
            <div v-if="triggeredRules.length === 0" class="diag-ok">&#10003; Sem conflitos detectados</div>
            <div
              v-for="rule in triggeredRules"
              :key="rule.id"
              class="diag-card"
              :class="'diag-' + rule.severity"
            >
              <div class="diag-card-head">
                <span class="diag-icon">{{ rule.severity === 'error' ? '✕' : rule.severity === 'warning' ? '⚠' : 'ℹ' }}</span>
                <span class="diag-msg">{{ rule.message }}</span>
              </div>
              <div class="diag-detail">{{ rule.detail }}</div>
              <div
                v-if="(rule.fixDisable && rule.fixDisable.length) || (rule.fixEnable && rule.fixEnable.length)"
                class="diag-actions"
              >
                <button type="button" class="diag-fix" @click="applyFix(rule.fixDisable || [], rule.fixEnable || [])">
                  {{ (rule.fixDisable && rule.fixDisable.length) ? 'Corrigir' : 'Aplicar sugestão' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- IA panel -->
        <div class="ai-panel">
          <div class="ai-title">IA</div>

          <div class="ai-problem-box">
            <label for="ai-problem-text" class="ai-problem-label">Descreva um problema (opcional)</label>
            <textarea
              id="ai-problem-text"
              v-model="aiProblemText"
              rows="3"
              placeholder="ex: trava ao carregar save · cursor escapa pro monitor 2 · FPS cai no chuveiro do RE7"
            ></textarea>
            <button
              type="button"
              class="btn-ai btn-ai-troubleshoot"
              :disabled="aiTroubleshootLoading"
              @click="aiTroubleshoot"
            >
              <span v-if="aiTroubleshootLoading" class="pd-spinner"></span>
              {{ aiTroubleshootLoading ? 'Analisando...' : 'Resolver problema com IA' }}
            </button>
          </div>

          <div class="ai-actions">
            <button
              type="button"
              class="btn-ai btn-ai-secondary"
              :disabled="aiDiagnoseLoading"
              @click="aiDiagnose"
            >
              <span v-if="aiDiagnoseLoading" class="pd-spinner"></span>
              {{ aiDiagnoseLoading ? 'Diagnosticando...' : 'Diagnosticar config atual' }}
            </button>
            <button
              type="button"
              class="btn-ai btn-ai-secondary"
              :disabled="aiSuggestLoading"
              @click="aiSuggest"
            >
              <span v-if="aiSuggestLoading" class="pd-spinner"></span>
              {{ aiSuggestLoading ? 'Pensando...' : 'Sugerir build do zero' }}
            </button>
          </div>
          <div class="ai-log-status">
            <span v-if="logStatusLoading" class="ai-log-badge ai-log-checking">verificando log do Proton…</span>
            <template v-else-if="logStatus">
              <span v-if="logStatus.found" class="ai-log-badge ai-log-found">
                &#10003; log auto: {{ fmtRelativeTime(logStatus.mtime) }} · {{ fmtBytes(logStatus.size) }} ({{ logStatus.lines }} linhas){{ logStatus.truncated ? ' · trecho filtrado' : '' }}
              </span>
              <span v-else class="ai-log-badge ai-log-missing">
                {{ logStatus.reason === 'empty' ? 'log vazio' : 'sem log' }} · ative <code>PROTON_LOG=1</code> e rode o jogo
              </span>
              <button type="button" class="ai-log-refresh" title="Recarregar status" @click="refreshLogStatus">↻</button>
            </template>
            <span v-else class="ai-log-badge ai-log-missing">status indisponível</span>
          </div>
          <details class="ai-log-toggle">
            <summary>Anexar log manualmente (sobrescreve auto)</summary>
            <textarea v-model="manualProtonLog" id="ai-proton-log" rows="6" placeholder="Cole trecho de ~/steam-&lt;appid&gt;.log se preferir não usar o auto"></textarea>
          </details>
          <p class="ai-hint">
            <router-link to="/settings/ai">Configurar provider / modelo →</router-link>
          </p>
        </div>

        <p style="color:var(--muted);font-size:11px;margin-top:8px">Salvar grava em <code>user_launch_options</code> no SQLite.</p>
      </div>

    </div><!-- /builder-layout -->

    <!-- Launch curada (read-only) -->
    <details class="launch-curated-section">
      <summary>Launch curada (referência sem override)</summary>
      <pre class="copy" @click="copyText(curatedLaunchDisplay)">{{ curatedLaunchDisplay }}</pre>
      <div v-if="notes.length" class="curated-notes">
        <strong style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em">Notas curadas</strong>
        <ul>
          <li v-for="(n, i) in notes" :key="i">{{ n }}</li>
        </ul>
      </div>
    </details>

    <!-- Notas pessoais -->
    <section class="user-notes-section">
      <h2>Notas pessoais</h2>
      <textarea v-model="userNotes" rows="4" placeholder="o que você aprendeu sobre rodar esse jogo"></textarea>
      <div class="actions">
        <button type="button" :disabled="savingNotes" @click="saveNotes">
          <span v-if="savingNotes" class="pd-spinner"></span>
          {{ savingNotes ? 'Salvando...' : 'Salvar notas' }}
        </button>
        <button
          v-if="game.user_notes"
          type="button"
          class="danger"
          :disabled="clearingNotes"
          @click="clearNotes"
        >
          <span v-if="clearingNotes" class="pd-spinner"></span>
          {{ clearingNotes ? 'Limpando...' : 'Limpar notas' }}
        </button>
      </div>
    </section>

    <!-- Community section -->
    <details class="community-section" @toggle="onCommunityToggle">
      <summary>Relatos da comunidade ProtonDB (últimos 10)</summary>
      <div>
        <p v-if="!communityLoaded && !communityLoading" style="color:var(--muted);font-size:13px">Abrindo...</p>
        <p v-if="communityLoading" style="color:var(--muted);font-size:13px">Carregando...</p>
        <p v-if="communityError" style="color:var(--tier-borked);font-size:13px">Erro ao buscar: {{ communityError }}</p>
        <template v-if="communityData">
          <p v-if="!communityData.reports || communityData.reports.length === 0" style="color:var(--muted);font-size:13px">Nenhum relato encontrado.</p>
          <template v-else>
            <p class="report-meta" style="margin-bottom:8px">Total: {{ communityData.total }} relatos</p>
            <div
              v-for="(r, i) in communityData.reports"
              :key="i"
              class="report-card"
            >
              <div class="report-meta">
                <span class="badge" :style="{ background: ratingColor(r.rating), color: '#0a0d12' }">{{ r.rating }}</span>
                <template v-if="r.gpu"> · {{ r.gpu }}</template>
                <template v-if="r.protonVersion"> · {{ r.protonVersion }}</template>
                · {{ relativeTime(r.timestamp) }}
              </div>
              <p v-if="r.notes" style="margin:6px 0 0;font-size:13px">{{ r.notes.slice(0, 300) }}{{ r.notes.length > 300 ? '…' : '' }}</p>
            </div>
          </template>
        </template>
      </div>
    </details>

    <!-- AI Modal -->
    <div v-if="aiModalOpen" class="ai-modal-backdrop" @click.self="closeAIModal">
      <div class="ai-modal">
        <div class="ai-modal-head">
          <span>{{ aiModalTitle }}</span>
          <button type="button" class="ai-modal-close" aria-label="fechar" @click="closeAIModal">&times;</button>
        </div>
        <div class="ai-modal-body">
          <div v-if="aiModalLoading" class="ai-loading">Consultando modelo… <span class="ai-spinner"></span></div>
          <div v-else-if="aiModalError" class="ai-error">{{ aiModalError }}</div>
          <div v-else v-html="aiModalBodyHtml"></div>
        </div>
        <div class="ai-modal-actions">
          <template v-if="aiModalError">
            <router-link to="/settings/ai" class="btn-ai btn-ai-secondary">Abrir Settings</router-link>
            <button type="button" class="btn-ai btn-ai-secondary" @click="closeAIModal">Fechar</button>
          </template>
          <template v-else-if="!aiModalLoading && aiModalCanApply">
            <button type="button" class="btn-ai" @click="applyAIRecommendation(aiModalRec, aiModalRemove); closeAIModal()">
              {{ aiModalApplyLabel }}
            </button>
            <button type="button" class="btn-ai btn-ai-secondary" @click="closeAIModal">Fechar</button>
          </template>
          <template v-else-if="!aiModalLoading">
            <button type="button" class="btn-ai btn-ai-secondary" @click="closeAIModal">Fechar</button>
          </template>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api, call, toast, openExternal } from '../api'
import {
  ENV_OPTIONS, ARG_OPTIONS, WRAPPER_OPTIONS, GAMESCOPE_OPTIONS,
  RESOLUTION_FORMATS, ENGINE_PRESETS,
} from '@domain/games/ConfigCatalog'
import { COMPAT_RULES } from '@domain/games/CompatibilityRules'
import { parseLaunchString } from '@domain/games/LaunchOptions'

const route = useRoute()
const appid = route.params.appid

// ─── Game data ────────────────────────────────────────────────
const game = ref(null)
const loaded = ref(false)
const monitors = ref([])
const notes = ref([])
const enginePreset = ref(null)
const userNotes = ref('')

// ─── Builder state ────────────────────────────────────────────
const currentEnv = ref({})
const currentArgs = ref([])
const currentWrappers = ref([])
const gamescopeEnabled = ref(false)
const gamescopeValues = ref({})
const currentResFormats = ref([])
const resWidth = ref('3440')
const resHeight = ref('1440')

// ─── Monitor picker ───────────────────────────────────────────
const selectedMonitor = ref('')

// ─── Engine bar ───────────────────────────────────────────────
const manualPresetKey = ref('')
const presetAppliedNote = ref('')

// ─── Save/clear state ─────────────────────────────────────────
const savingLaunch = ref(false)
const clearingLaunch = ref(false)
const savingNotes = ref(false)
const clearingNotes = ref(false)

// ─── Copy ─────────────────────────────────────────────────────
const copyLabel = ref('Copiar')

// ─── PCGamingWiki ─────────────────────────────────────────────
const pcgwLoading = ref(true)
const pcgwData = ref(null)
const pcgwError = ref('')
const pcgwPageUrl = ref('')

const PCGW_FEATURE_LABEL = {
  widescreen:      'Widescreen 16:9',
  multimonitor:    'Multi-monitor',
  ultrawidescreen: 'Ultra-widescreen 21:9',
  '4k':            '4K Ultra HD',
  fov:             'Field of view (FOV)',
}
const PCGW_STATE_LABEL = {
  native:      'nativo',
  hackable:    'mod / hack',
  limited:     'limitado',
  unsupported: 'não suporta',
  unknown:     'sem info',
}
const PCGW_FEATURE_ORDER = ['ultrawidescreen', 'widescreen', 'multimonitor', '4k', 'fov']

const pcgwRows = computed(() => {
  if (!pcgwData.value || !pcgwData.value.found || !pcgwData.value.features) return []
  return PCGW_FEATURE_ORDER
    .filter(key => pcgwData.value.features[key])
    .map(key => {
      const f = pcgwData.value.features[key]
      return {
        key,
        featureLabel: PCGW_FEATURE_LABEL[key] || key,
        state: f.state,
        stateLabel: PCGW_STATE_LABEL[f.state] || f.state,
        notes: f.notes || '',
      }
    })
})

// ─── Steam apply panel ────────────────────────────────────────
const steamStatusHtml = ref('<span class="steam-apply-disabled">verificando localconfig.vdf…</span>')
const steamCurrentHtml = ref('')
const steamApplyReady = ref(false)
const applyingSteam = ref(false)

// ─── Community ────────────────────────────────────────────────
const communityLoaded = ref(false)
const communityLoading = ref(false)
const communityData = ref(null)
const communityError = ref('')

// ─── AI ───────────────────────────────────────────────────────
const aiProblemText = ref('')
const manualProtonLog = ref('')
const logStatus = ref(null)
const logStatusLoading = ref(true)
const aiModalOpen = ref(false)
const aiModalTitle = ref('')
const aiModalBodyHtml = ref('')
const aiModalLoading = ref(false)
const aiModalError = ref('')
const aiModalCanApply = ref(false)
const aiModalApplyLabel = ref('Aplicar recomendação')
const aiModalRec = ref(null)
const aiModalRemove = ref(null)
const aiDiagnoseLoading = ref(false)
const aiSuggestLoading = ref(false)
const aiTroubleshootLoading = ref(false)

// ─── Computed catalogs ────────────────────────────────────────
const envCategories = computed(() => [...new Set(ENV_OPTIONS.map(e => e.category))])
function envOptionsByCategory(cat) { return ENV_OPTIONS.filter(e => e.category === cat) }

const argCategories = computed(() => [...new Set(ARG_OPTIONS.map(a => a.category))])
function argOptionsByCategory(cat) { return ARG_OPTIONS.filter(a => a.category === cat) }

// ─── Preview string (live) ────────────────────────────────────
const previewString = computed(() => buildLaunchString())

// ─── Curated launch display (with monitor override) ───────────
const curatedLaunchDisplay = computed(() => {
  const base = game.value?.launch_options || ''
  if (!selectedMonitor.value) return base
  const SDL_RX = /SDL_VIDEO_FULLSCREEN_DISPLAYS=\S+\s?/
  if (SDL_RX.test(base)) {
    return base.replace(SDL_RX, 'SDL_VIDEO_FULLSCREEN_DISPLAYS=' + selectedMonitor.value + ' ')
  }
  return 'SDL_VIDEO_FULLSCREEN_DISPLAYS=' + selectedMonitor.value + ' ' + base
})

// ─── Conflict rules ───────────────────────────────────────────
const triggeredRules = computed(() => {
  const state = getCurrentState()
  return COMPAT_RULES.filter(rule => rule.when.every(cond => evalCond(cond, state)))
})

// ─── Helpers ──────────────────────────────────────────────────
function getCurrentState() {
  return {
    env: currentEnv.value,
    args: currentArgs.value,
    wrappers: [
      ...currentWrappers.value,
      ...(gamescopeEnabled.value ? ['gamescope'] : []),
    ],
    gs: gamescopeValues.value,
    resFmts: currentResFormats.value,
  }
}

function evalCond(cond, state) {
  const colonIdx = cond.indexOf(':')
  const type = cond.slice(0, colonIdx)
  const rest = cond.slice(colonIdx + 1)

  if (type === 'env') {
    const eqIdx = rest.indexOf('=')
    if (eqIdx >= 0) {
      const k = rest.slice(0, eqIdx)
      const v = rest.slice(eqIdx + 1)
      return state.env[k] !== undefined && state.env[k] === v
    }
    return state.env[rest] !== undefined
  }
  if (type === 'env_off')  return state.env[rest] === undefined
  if (type === 'arg')      return state.args.indexOf(rest) >= 0
  if (type === 'arg_off')  return state.args.indexOf(rest) < 0
  if (type === 'wrap')     return state.wrappers.indexOf(rest) >= 0
  if (type === 'gs')       return state.gs[rest] !== undefined
  if (type === 'gs_off')   return state.gs[rest] === undefined
  if (type === 'res')      return state.resFmts.indexOf(rest) >= 0
  return false
}

function buildLaunchString() {
  const wrappers = []
  for (const w of WRAPPER_OPTIONS) {
    if (currentWrappers.value.includes(w.key)) wrappers.push(w.prefix)
  }

  let gamescopeStr = ''
  if (gamescopeEnabled.value) {
    const gsParts = ['gamescope']
    for (const opt of GAMESCOPE_OPTIONS) {
      if (gamescopeValues.value[opt.flag] !== undefined) {
        if (opt.type === 'toggle') {
          gsParts.push(opt.flag)
        } else {
          const val = String(gamescopeValues.value[opt.flag]).trim()
          if (val) gsParts.push(opt.flag + ' ' + val)
        }
      }
    }
    gsParts.push('--')
    gamescopeStr = gsParts.join(' ')
  }

  const envParts = []
  for (const [key, val] of Object.entries(currentEnv.value)) {
    if (key && val) envParts.push(key + '=' + val)
  }

  const args = [...currentArgs.value]
  const rW = (resWidth.value || '').trim()
  const rH = (resHeight.value || '').trim()
  for (const fmt of RESOLUTION_FORMATS) {
    if (currentResFormats.value.includes(fmt.key) && rW && rH) {
      args.push(fmt.widthFlag + ' ' + rW + ' ' + fmt.heightFlag + ' ' + rH)
    }
  }

  const parts = []
  if (envParts.length) parts.push(envParts.join(' '))
  if (gamescopeStr) {
    parts.push(gamescopeStr)
    if (wrappers.length) parts.push(wrappers.join(' '))
  } else if (wrappers.length) {
    parts.push(wrappers.join(' '))
  }
  parts.push('%command%')
  if (args.length) parts.push(args.join(' '))
  return parts.join(' ')
}

// ─── Toggle handlers ─────────────────────────────────────────
function toggleWrapper(key, checked) {
  if (checked) {
    if (!currentWrappers.value.includes(key)) currentWrappers.value = [...currentWrappers.value, key]
  } else {
    currentWrappers.value = currentWrappers.value.filter(k => k !== key)
  }
}

function toggleGamescope(checked) {
  gamescopeEnabled.value = checked
}

function toggleGsOpt(opt, checked) {
  const updated = { ...gamescopeValues.value }
  if (checked) {
    if (updated[opt.flag] === undefined) {
      updated[opt.flag] = opt.type === 'toggle' ? '1' : (opt.defaultValue || '')
    }
  } else {
    delete updated[opt.flag]
  }
  gamescopeValues.value = updated
}

function setGsVal(opt, val) {
  gamescopeValues.value = { ...gamescopeValues.value, [opt.flag]: val }
}

function toggleEnv(key, checked) {
  const updated = { ...currentEnv.value }
  if (checked) {
    const opt = ENV_OPTIONS.find(o => o.key === key)
    if (updated[key] === undefined) updated[key] = opt ? opt.defaultValue : '1'
  } else {
    delete updated[key]
  }
  currentEnv.value = updated
}

function setEnvVal(key, val) {
  currentEnv.value = { ...currentEnv.value, [key]: val }
}

function toggleArg(value, checked) {
  if (checked) {
    if (!currentArgs.value.includes(value)) currentArgs.value = [...currentArgs.value, value]
  } else {
    currentArgs.value = currentArgs.value.filter(v => v !== value)
  }
}

function toggleResFmt(key, checked) {
  if (checked) {
    if (!currentResFormats.value.includes(key)) currentResFormats.value = [...currentResFormats.value, key]
  } else {
    currentResFormats.value = currentResFormats.value.filter(k => k !== key)
  }
}

function setRes(w, h) {
  resWidth.value = String(w)
  resHeight.value = String(h)
}

function gsPreset(w, h, r) {
  const fields = { '-w': w, '-h': h, '-W': w, '-H': h, '-r': r }
  const updated = { ...gamescopeValues.value }
  for (const opt of GAMESCOPE_OPTIONS) {
    if (fields[opt.flag] !== undefined) {
      updated[opt.flag] = String(fields[opt.flag])
    }
  }
  gamescopeValues.value = updated
}

// ─── Disable/enable flags (for fix buttons and AI apply) ──────
function disableFlag(cond) {
  const colonIdx = cond.indexOf(':')
  const type = cond.slice(0, colonIdx)
  const rest = cond.slice(colonIdx + 1)
  if (type === 'env') {
    const updated = { ...currentEnv.value }
    delete updated[rest]
    currentEnv.value = updated
  } else if (type === 'arg') {
    currentArgs.value = currentArgs.value.filter(v => v !== rest)
  } else if (type === 'wrap') {
    if (rest === 'gamescope') {
      gamescopeEnabled.value = false
    } else {
      currentWrappers.value = currentWrappers.value.filter(k => {
        const w = WRAPPER_OPTIONS.find(o => o.key === k)
        return !w || w.prefix !== rest
      })
    }
  } else if (type === 'gs') {
    const updated = { ...gamescopeValues.value }
    delete updated[rest]
    gamescopeValues.value = updated
  } else if (type === 'res') {
    currentResFormats.value = currentResFormats.value.filter(k => k !== rest)
  }
}

function enableFlag(flag, value) {
  const colonIdx = flag.indexOf(':')
  const type = flag.slice(0, colonIdx)
  const rest = flag.slice(colonIdx + 1)
  if (type === 'env') {
    const opt = ENV_OPTIONS.find(o => o.key === rest)
    const val = value !== undefined ? value : (opt ? opt.defaultValue : '1')
    currentEnv.value = { ...currentEnv.value, [rest]: val }
  } else if (type === 'arg') {
    if (!currentArgs.value.includes(rest)) currentArgs.value = [...currentArgs.value, rest]
  } else if (type === 'gs') {
    gamescopeEnabled.value = true
    const updated = { ...gamescopeValues.value }
    if (updated[rest] === undefined || value !== undefined) {
      const opt = GAMESCOPE_OPTIONS.find(o => o.flag === rest)
      updated[rest] = value !== undefined ? value : (opt && opt.defaultValue ? opt.defaultValue : '')
    }
    gamescopeValues.value = updated
  }
}

function applyFix(fixDisable, fixEnable) {
  ;(fixDisable || []).forEach(cond => disableFlag(cond))
  ;(fixEnable || []).forEach(item => enableFlag(item.flag, item.value))
}

// ─── Engine preset ────────────────────────────────────────────
function applyEnginePreset(presetKey) {
  const preset = ENGINE_PRESETS[presetKey]
  if (!preset) return

  for (const item of (preset.envEnable || [])) {
    currentEnv.value = { ...currentEnv.value, [item.key]: item.val }
  }
  for (const val of (preset.argsEnable || [])) {
    if (!currentArgs.value.includes(val)) currentArgs.value = [...currentArgs.value, val]
  }

  presetAppliedNote.value = '✓ Preset aplicado: ' + preset.note
}

// ─── Copy helpers ─────────────────────────────────────────────
function copyPreview() {
  navigator.clipboard.writeText(previewString.value).then(() => {
    copyLabel.value = 'Copiado!'
    setTimeout(() => { copyLabel.value = 'Copiar' }, 1200)
  })
}

function copyText(text) {
  navigator.clipboard.writeText(text || '')
}

// ─── Save/clear actions ───────────────────────────────────────
async function saveLaunch() {
  savingLaunch.value = true
  try {
    const updated = await call(() => api.games.save({ appid, action: 'save_launch', user_launch_options: previewString.value }))
    game.value = updated
    toast('Launch salva!', 'success')
  } catch { /* toast já mostrado */ }
  finally { savingLaunch.value = false }
}

async function clearLaunch() {
  clearingLaunch.value = true
  try {
    const updated = await call(() => api.games.save({ appid, action: 'clear_launch' }))
    game.value = updated
    // Re-parse curated launch after clear
    const launchStr = updated.user_launch_options || updated.launch_options || ''
    applyParsed(parseLaunchString(launchStr))
    toast('Override removido.', 'success')
  } catch { /* toast já mostrado */ }
  finally { clearingLaunch.value = false }
}

async function saveNotes() {
  savingNotes.value = true
  try {
    const updated = await call(() => api.games.save({ appid, action: 'save_notes', user_notes: userNotes.value }))
    game.value = updated
    toast('Notas salvas!', 'success')
  } catch { /* toast já mostrado */ }
  finally { savingNotes.value = false }
}

async function clearNotes() {
  clearingNotes.value = true
  try {
    const updated = await call(() => api.games.save({ appid, action: 'clear_notes' }))
    game.value = updated
    userNotes.value = ''
    toast('Notas removidas.', 'success')
  } catch { /* toast já mostrado */ }
  finally { clearingNotes.value = false }
}

// ─── Steam apply ──────────────────────────────────────────────
async function refreshSteamStatus() {
  try {
    const d = await call(() => api.games.steamLaunch(appid), { quiet: true })
    if (!d.configured) {
      steamStatusHtml.value = '<span class="steam-apply-disabled">Configure <a href="#" onclick="document.querySelector(\'a[href=\\\"/settings/steam\\\"]\')?.click()">Steam Credentials</a> pra habilitar.</span>'
      steamApplyReady.value = false
      steamCurrentHtml.value = ''
      return
    }
    if (!d.available) {
      steamStatusHtml.value = '<span class="steam-apply-disabled">' + escapeHTML(d.reason || 'localconfig.vdf indisponível') + '</span>'
      steamApplyReady.value = false
      steamCurrentHtml.value = ''
      return
    }
    if (d.steamRunning) {
      steamStatusHtml.value = '<span class="steam-apply-warn">⚠ Steam rodando — feche o cliente antes de aplicar (não só minimize).</span>'
      steamApplyReady.value = false
    } else {
      steamStatusHtml.value = '<span class="steam-apply-ok">Pronto pra aplicar no localconfig.vdf.</span>'
      steamApplyReady.value = true
    }
    if (d.foundInSteam) {
      steamCurrentHtml.value = '<div class="steam-apply-current-label">Atualmente no Steam:</div>' +
        '<pre class="steam-apply-current-val">' + escapeHTML(d.currentInSteam || '(vazio)') + '</pre>'
    } else if (d.foundReason) {
      steamCurrentHtml.value = '<span class="steam-apply-disabled">' + escapeHTML(d.foundReason) + '</span>'
    } else {
      steamCurrentHtml.value = ''
    }
  } catch (err) {
    steamStatusHtml.value = '<span class="steam-apply-disabled">erro: ' + escapeHTML(err?.message || String(err)) + '</span>'
    steamApplyReady.value = false
  }
}

async function applySteam() {
  applyingSteam.value = true
  steamStatusHtml.value = '<span>aplicando…</span>'
  try {
    const result = await call(() => api.games.applySteam(appid), { quiet: true })
    if (result && result.error) {
      steamStatusHtml.value = '<span class="steam-apply-warn">' + escapeHTML(result.error) + '</span>'
    } else if (result && result.ok === false) {
      steamStatusHtml.value = '<span class="steam-apply-warn">' + escapeHTML(result.reason || 'falhou') + '</span>'
    } else {
      steamStatusHtml.value = '<span class="steam-apply-ok">✓ Aplicado. Backup: <code>' + escapeHTML(result?.backupPath || '') + '</code></span>'
      setTimeout(refreshSteamStatus, 800)
    }
  } catch (err) {
    steamStatusHtml.value = '<span class="steam-apply-warn">erro: ' + escapeHTML(err?.message || String(err)) + '</span>'
  }
  finally { applyingSteam.value = false }
}

// ─── PCGamingWiki ─────────────────────────────────────────────
async function loadPCGW(force) {
  pcgwLoading.value = true
  pcgwError.value = ''
  pcgwData.value = null
  pcgwPageUrl.value = ''
  try {
    const data = await call(() => api.games.widescreen(appid, force), { quiet: true })
    pcgwData.value = data
    if (data.pageUrl) pcgwPageUrl.value = data.pageUrl
  } catch (err) {
    pcgwError.value = err?.message || String(err)
  }
  finally { pcgwLoading.value = false }
}

// ─── Community ────────────────────────────────────────────────
function onCommunityToggle(e) {
  if (!e.target.open || communityLoaded.value) return
  communityLoaded.value = true
  loadCommunity()
}

async function loadCommunity() {
  communityLoading.value = true
  communityError.value = ''
  try {
    const data = await call(() => api.games.community(appid), { quiet: true })
    communityData.value = data
  } catch (err) {
    communityError.value = err?.message || String(err)
  }
  finally { communityLoading.value = false }
}

function ratingColor(rating) {
  const map = { platinum: '#d6d6d6', gold: '#f5b942', silver: '#c0c0c0', bronze: '#cd7f32', borked: '#ff5a5a' }
  return map[rating] || '#888'
}

function relativeTime(ts) {
  const diff = Date.now() - ts * 1000
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'hoje'
  if (days < 30) return days + 'd atrás'
  const months = Math.floor(days / 30)
  if (months < 12) return months + 'mo atrás'
  return Math.floor(months / 12) + 'a atrás'
}

// ─── AI log status ────────────────────────────────────────────
function fmtRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1)  return 'agora'
  if (min < 60) return min + 'min atrás'
  const h = Math.floor(min / 60)
  if (h < 24) return h + 'h atrás'
  const d = Math.floor(h / 24)
  return d + 'd atrás'
}

function fmtBytes(n) {
  if (n < 1024) return n + 'B'
  if (n < 1048576) return (n / 1024).toFixed(1) + 'KB'
  return (n / 1048576).toFixed(1) + 'MB'
}

async function refreshLogStatus() {
  logStatusLoading.value = true
  logStatus.value = null
  try {
    const d = await call(() => api.ai.protonLog(appid), { quiet: true })
    logStatus.value = d
  } catch {
    logStatus.value = null
  }
  finally { logStatusLoading.value = false }
}

// ─── AI modal ─────────────────────────────────────────────────
function openAIModal(title) {
  aiModalTitle.value = title
  aiModalLoading.value = true
  aiModalError.value = ''
  aiModalBodyHtml.value = ''
  aiModalCanApply.value = false
  aiModalRec.value = null
  aiModalRemove.value = null
  aiModalOpen.value = true
}

function closeAIModal() {
  aiModalOpen.value = false
}

function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

function severityClass(s) {
  return s === 'error' ? 'diag-error' : s === 'warning' ? 'diag-warning' : 'diag-info'
}

function buildDiagnoseHtml(data) {
  const issues = Array.isArray(data.issues) ? data.issues : []
  const confidence = typeof data.confidence === 'number' ? data.confidence : null
  const reasoning = data.reasoning || ''
  const cached = data.cached ? ' <span class="ai-cached-badge">cache</span>' : ''
  const modelUsed = data.model_used ? '<span class="ai-model-tag">' + escapeHTML(data.model_used) + '</span>' : ''
  let logDetail = ''
  if (data.log_bytes) logDetail = ' (' + (data.log_bytes < 1024 ? data.log_bytes + 'B' : (data.log_bytes / 1024).toFixed(1) + 'KB') + ', ' + data.log_lines + ' linhas)'
  const logSrc = data.log_source === 'auto' ? ' <span class="ai-log-src">log: auto' + logDetail + '</span>' :
    data.log_source === 'manual' ? ' <span class="ai-log-src">log: manual' + logDetail + '</span>' :
    ' <span class="ai-log-src ai-log-src-none">log: ausente</span>'

  let html = '<div class="ai-meta">' + modelUsed + cached + logSrc
  if (confidence !== null) html += ' <span class="ai-confidence">confiança ' + Math.round(confidence * 100) + '%</span>'
  html += '</div>'

  if (issues.length) {
    html += '<div class="ai-section-title">Problemas encontrados</div>'
    issues.forEach(i => {
      html += '<div class="diag-card ' + severityClass(i.severity) + '">' +
        '<div class="diag-msg">' + escapeHTML(i.message) + '</div>' +
        (i.explanation ? '<div class="diag-detail">' + escapeHTML(i.explanation) + '</div>' : '') +
        '</div>'
    })
  } else {
    html += '<div class="diag-ok" style="padding:8px 0">&#10003; IA não encontrou problemas críticos</div>'
  }

  if (reasoning) {
    html += '<div class="ai-section-title">Raciocínio</div><div class="ai-reasoning">' + escapeHTML(reasoning) + '</div>'
  }
  return html
}

function buildSuggestHtml(data) {
  const rec = data.recommendation || {}
  const reasoning = data.reasoning || ''
  const considerations = Array.isArray(data.considerations) ? data.considerations : []
  const confidence = typeof data.confidence === 'number' ? data.confidence : null
  const cached = data.cached ? ' <span class="ai-cached-badge">cache</span>' : ''
  const modelUsed = data.model_used ? '<span class="ai-model-tag">' + escapeHTML(data.model_used) + '</span>' : ''

  let html = '<div class="ai-meta">' + modelUsed + cached
  if (confidence !== null) html += ' <span class="ai-confidence">confiança ' + Math.round(confidence * 100) + '%</span>'
  html += '</div>'

  const lines = []
  if (rec.env && Object.keys(rec.env).length) {
    lines.push('<strong>Env:</strong> ' + Object.keys(rec.env).map(k => escapeHTML(k + '=' + rec.env[k])).join(', '))
  }
  if (rec.args && rec.args.length) lines.push('<strong>Args:</strong> ' + rec.args.map(escapeHTML).join(' '))
  if (rec.wrappers && rec.wrappers.length) lines.push('<strong>Wrappers:</strong> ' + rec.wrappers.map(escapeHTML).join(', '))
  if (rec.gamescope && Object.keys(rec.gamescope).length) {
    lines.push('<strong>Gamescope:</strong> ' + Object.keys(rec.gamescope).map(k => escapeHTML(k + ' ' + rec.gamescope[k])).join(', '))
  }
  html += '<div class="ai-section-title">Recomendação</div>'
  html += lines.length
    ? '<div class="ai-rec-summary">' + lines.join('<br>') + '</div>'
    : '<p style="color:var(--muted)">(config mínima/vazia — modelo julga não precisar de tweaks)</p>'

  if (reasoning) {
    html += '<div class="ai-section-title">Raciocínio</div><div class="ai-reasoning">' + escapeHTML(reasoning) + '</div>'
  }
  if (considerations.length) {
    html += '<div class="ai-section-title">Avisos</div><ul class="ai-considerations">' +
      considerations.map(c => '<li>' + escapeHTML(c) + '</li>').join('') + '</ul>'
  }
  return html
}

function buildTroubleshootHtml(data) {
  const diagnosis = data.diagnosis || ''
  const issues = Array.isArray(data.issues) ? data.issues : []
  const reasoning = data.reasoning || ''
  const confidence = typeof data.confidence === 'number' ? data.confidence : null
  const cached = data.cached ? ' <span class="ai-cached-badge">cache</span>' : ''
  const modelUsed = data.model_used ? '<span class="ai-model-tag">' + escapeHTML(data.model_used) + '</span>' : ''
  let logDetail = ''
  if (data.log_bytes) logDetail = ' (' + (data.log_bytes < 1024 ? data.log_bytes + 'B' : (data.log_bytes / 1024).toFixed(1) + 'KB') + ', ' + data.log_lines + ' linhas)'
  const logSrc = data.log_source === 'auto' ? ' <span class="ai-log-src">log: auto' + logDetail + '</span>' :
    data.log_source === 'manual' ? ' <span class="ai-log-src">log: manual' + logDetail + '</span>' :
    ' <span class="ai-log-src ai-log-src-none">log: ausente</span>'

  let html = '<div class="ai-meta">' + modelUsed + cached + logSrc
  if (confidence !== null) html += ' <span class="ai-confidence">confiança ' + Math.round(confidence * 100) + '%</span>'
  html += '</div>'

  if (diagnosis) {
    html += '<div class="ai-section-title">Diagnóstico</div><div class="ai-reasoning">' + escapeHTML(diagnosis) + '</div>'
  }
  if (issues.length) {
    html += '<div class="ai-section-title">Pontos identificados</div>'
    issues.forEach(i => {
      html += '<div class="diag-card ' + severityClass(i.severity) + '">' +
        '<div class="diag-msg">' + escapeHTML(i.message) + '</div>' +
        (i.explanation ? '<div class="diag-detail">' + escapeHTML(i.explanation) + '</div>' : '') +
        '</div>'
    })
  }
  if (reasoning) {
    html += '<div class="ai-section-title">Raciocínio das mudanças</div><div class="ai-reasoning">' + escapeHTML(reasoning) + '</div>'
  }
  return html
}

// ─── AI actions ───────────────────────────────────────────────
async function aiDiagnose() {
  aiDiagnoseLoading.value = true
  openAIModal('Diagnóstico IA')
  try {
    const protonLog = manualProtonLog.value.trim()
    const data = await call(() => api.ai.diagnose(appid), { quiet: true })
    aiModalBodyHtml.value = buildDiagnoseHtml(data)
    aiModalLoading.value = false
    const rec = data.recommendation || {}
    const remove = data.remove || {}
    const hasFix = rec.env || rec.args || rec.wrappers || rec.gamescope ||
      (remove.env && remove.env.length) || (remove.args && remove.args.length)
    if (hasFix) {
      aiModalCanApply.value = true
      aiModalApplyLabel.value = 'Aplicar recomendação'
      aiModalRec.value = rec
      aiModalRemove.value = remove
    }
  } catch (err) {
    aiModalLoading.value = false
    aiModalError.value = err?.message || 'erro desconhecido'
  }
  finally { aiDiagnoseLoading.value = false }
}

async function aiSuggest() {
  aiSuggestLoading.value = true
  openAIModal('Sugestão IA')
  try {
    const data = await call(() => api.ai.suggest(appid), { quiet: true })
    aiModalBodyHtml.value = buildSuggestHtml(data)
    aiModalLoading.value = false
    aiModalCanApply.value = true
    aiModalApplyLabel.value = 'Aplicar recomendação'
    aiModalRec.value = data.recommendation || {}
    aiModalRemove.value = {}
  } catch (err) {
    aiModalLoading.value = false
    aiModalError.value = err?.message || 'erro desconhecido'
  }
  finally { aiSuggestLoading.value = false }
}

async function aiTroubleshoot() {
  const problem = aiProblemText.value.trim()
  if (problem.length < 5) {
    openAIModal('Resolver problema · IA')
    aiModalLoading.value = false
    aiModalError.value = 'Descreva o problema com pelo menos 5 caracteres.'
    return
  }

  aiTroubleshootLoading.value = true
  openAIModal('Resolver problema · IA')

  const state = getCurrentState()
  const payload = {
    problem,
    proton_log: manualProtonLog.value.trim() || undefined,
    current_state: {
      env: state.env,
      args: state.args,
      wrappers: state.wrappers,
      gamescope: state.gs,
      resW: resWidth.value,
      resH: resHeight.value,
      resFormats: state.resFmts,
    },
  }

  try {
    const data = await call(() => api.ai.troubleshoot(appid, payload.problem, payload.current_state), { quiet: true })
    aiModalBodyHtml.value = buildTroubleshootHtml(data)
    aiModalLoading.value = false
    const rec = data.recommendation || {}
    const remove = data.remove || {}
    const hasFix = (rec && (rec.env || rec.args || rec.wrappers || rec.gamescope)) ||
      (remove && ((remove.env && remove.env.length) || (remove.args && remove.args.length)))
    if (hasFix) {
      aiModalCanApply.value = true
      aiModalApplyLabel.value = 'Aplicar correções'
      aiModalRec.value = rec
      aiModalRemove.value = remove
    }
  } catch (err) {
    aiModalLoading.value = false
    aiModalError.value = err?.message || 'erro desconhecido'
  }
  finally { aiTroubleshootLoading.value = false }
}

function applyAIRecommendation(rec, remove) {
  if (remove && Array.isArray(remove.env)) {
    remove.env.forEach(k => disableFlag('env:' + k))
  }
  if (remove && Array.isArray(remove.args)) {
    remove.args.forEach(v => disableFlag('arg:' + v))
  }
  if (rec && rec.env && typeof rec.env === 'object') {
    Object.keys(rec.env).forEach(k => enableFlag('env:' + k, String(rec.env[k])))
  }
  if (rec && Array.isArray(rec.args)) {
    rec.args.forEach(v => enableFlag('arg:' + v))
  }
  if (rec && Array.isArray(rec.wrappers)) {
    rec.wrappers.forEach(w => {
      if (w === 'gamescope') {
        gamescopeEnabled.value = true
      } else {
        const found = WRAPPER_OPTIONS.find(o => o.prefix === w || o.key === w)
        if (found && !currentWrappers.value.includes(found.key)) {
          currentWrappers.value = [...currentWrappers.value, found.key]
        }
      }
    })
  }
  if (rec && rec.gamescope && typeof rec.gamescope === 'object') {
    gamescopeEnabled.value = true
    Object.keys(rec.gamescope).forEach(flag => enableFlag('gs:' + flag, String(rec.gamescope[flag])))
  }
}

// ─── Helpers ──────────────────────────────────────────────────
function applyParsed(parsed) {
  currentEnv.value = parsed.currentEnv
  currentArgs.value = parsed.currentArgs
  currentWrappers.value = parsed.currentWrappers
  gamescopeEnabled.value = parsed.gamescopeEnabled
  gamescopeValues.value = parsed.gamescopeValues
  currentResFormats.value = parsed.currentResFormats
  resWidth.value = parsed.currentResWidth
  resHeight.value = parsed.currentResHeight
}

// ─── Mount ────────────────────────────────────────────────────
onMounted(async () => {
  const [g, sys] = await Promise.all([
    call(() => api.games.get(appid)),
    call(() => api.system.info()),
  ])

  game.value = g
  loaded.value = true

  if (!g) return

  userNotes.value = g.user_notes || ''
  notes.value = g.notes_json ? JSON.parse(g.notes_json) : []
  enginePreset.value = ENGINE_PRESETS[g.engine ?? ''] ?? null

  const launchStr = g.user_launch_options || g.launch_options || ''
  applyParsed(parseLaunchString(launchStr))

  // Monitor picker: pre-select from curated launch
  monitors.value = sys?.monitors ?? []
  const monitorMatch = (g.launch_options || '').match(/SDL_VIDEO_FULLSCREEN_DISPLAYS=(\S+)/)
  selectedMonitor.value = monitorMatch?.[1] ?? ''

  // Load panels
  loadPCGW(false)
  refreshSteamStatus()
  refreshLogStatus()
})
</script>
