<template>
  <div v-if="loaded">
    <div class="page-header">
      <h1>AI Provider</h1>
      <span class="page-sub">Configure provider e modelo para Diagnosticar / Sugerir / Resolver problema com IA.</span>
    </div>

    <p class="meta" style="margin-bottom:12px">O system prompt do agente é cacheado por 5 minutos no Anthropic (cache_control ephemeral), reduzindo o custo de cada chamada repetida em ~90%. OpenAI cacheia automaticamente prompts &gt; 1024 tokens.</p>

    <form class="ai-settings-form" @submit.prevent="save">

      <label>
        Provider
        <select v-model="form.provider" required @change="onProviderChange">
          <option value="anthropic">Anthropic (Claude) — cache + tools recomendado</option>
          <option value="openai">OpenAI (GPT) — cache automático + tools</option>
          <option value="ollama">Ollama (local — sem custo, sem tools)</option>
        </select>
      </label>

      <label>
        Modelo
        <select v-model="form.model" required>
          <option v-for="m in currentModels" :key="m.id" :value="m.id">
            {{ m.label }}{{ m.note ? ' — ' + m.note : '' }}
          </option>
        </select>
        <span class="hint" id="model-note"></span>
      </label>

      <label id="key-label" :style="{ opacity: form.provider === 'ollama' ? '0.5' : '1' }">
        API Key
        <input
          v-model="form.api_key"
          type="password"
          autocomplete="off"
          placeholder="cole a chave aqui"
        />
        <span class="hint">
          {{ form.provider === 'ollama'
            ? 'Ollama local não precisa de chave. Deixe vazio.'
            : 'Salva localmente no SQLite. Nunca exposta ao frontend.' }}
        </span>
      </label>

      <label>
        Base URL (opcional)
        <input
          v-model="form.base_url"
          type="text"
          :placeholder="'(usa padrão do provider)'"
        />
        <span class="hint" id="baseurl-hint">Padrão: {{ defaultBaseUrls[form.provider] }}</span>
      </label>

      <div class="actions" style="margin-top:16px">
        <button type="submit">Salvar</button>
      </div>
    </form>

    <p v-if="config && config.updated_at" class="meta" style="margin-top:24px">
      Última atualização: {{ config.updated_at }} · Atualmente: <strong>{{ config.provider }}/{{ config.model }}</strong>
    </p>

    <details class="system" style="margin-top:24px">
      <summary>Como usar</summary>
      <ul style="color:var(--muted);font-size:13px">
        <li><strong>Anthropic:</strong> gere chave em <code>console.anthropic.com</code> → API Keys. <strong>Cache + tools</strong> habilitados — economia máxima de tokens.</li>
        <li><strong>OpenAI:</strong> gere chave em <code>platform.openai.com/api-keys</code>. Cache automático nos prompts longos.</li>
        <li><strong>Ollama (local):</strong> instale <code>ollama</code> e rode <code>ollama pull qwen2.5-coder:7b</code>. Zero custo. <strong>Sem tools</strong> — usa só single-shot.</li>
        <li>Cache de resposta no SQLite: 24h por (jogo + provider + modelo + config). Repetições não custam.</li>
      </ul>
    </details>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, call, toast } from '../api'

const loaded = ref(false)
const config = ref(null)
const providerModels = ref({})
const defaultBaseUrls = ref({})

const form = ref({
  provider: 'anthropic',
  model: '',
  api_key: '',
  base_url: '',
})

const currentModels = computed(() => providerModels.value[form.value.provider] || [])

function onProviderChange() {
  const models = providerModels.value[form.value.provider] || []
  form.value.model = models.length ? models[0].id : ''
}

async function load() {
  const r = await call(() => api.ai.getConfig())
  config.value = r.config
  providerModels.value = r.providerModels
  defaultBaseUrls.value = r.defaultBaseUrls

  const cfg = r.config
  const provider = cfg?.provider || 'anthropic'
  form.value.provider = provider

  const models = r.providerModels[provider] || []
  const savedModel = cfg?.model
  form.value.model = savedModel && models.some((m) => m.id === savedModel)
    ? savedModel
    : (models.length ? models[0].id : '')

  form.value.api_key = cfg?.api_key || ''
  form.value.base_url = cfg?.base_url || ''

  loaded.value = true
}

async function save() {
  try {
    const saved = await call(() => api.ai.setConfig({
      provider: form.value.provider,
      model: form.value.model,
      api_key: form.value.api_key.trim() || null,
      base_url: form.value.base_url.trim() || null,
    }))
    config.value = saved
    toast('Configuração de IA salva', 'success')
  } catch { /* toast já mostrado */ }
}

onMounted(load)
</script>
