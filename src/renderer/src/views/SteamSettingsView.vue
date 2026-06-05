<template>
  <div v-if="loaded">
    <div class="page-header">
      <h1>Steam Credentials</h1>
      <span class="page-sub">API key + SteamID64 usados pelo Sync pra puxar a biblioteca.</span>
    </div>

    <p class="meta" style="margin-bottom:12px">Credenciais persistidas no SQLite local. Usadas pelo Sync pra chamar a Steam Web API (<code>IPlayerService/GetOwnedGames</code>).</p>

    <form class="ai-settings-form" @submit.prevent="save">
      <label>
        Steam API Key
        <input
          v-model="form.steam_api_key"
          type="password"
          autocomplete="off"
          placeholder="32 caracteres hex"
          required
        />
        <span class="hint">Gere em <code>steamcommunity.com/dev/apikey</code>.</span>
      </label>

      <label>
        Steam ID64
        <input
          v-model="form.steam_id64"
          type="text"
          autocomplete="off"
          placeholder="76561198..."
          required
        />
        <span class="hint">17 dígitos começando com 7656119. Veja em <code>steamid.io</code>.</span>
      </label>

      <div class="actions" style="margin-top:16px">
        <button type="submit">Salvar</button>
      </div>
    </form>

    <p v-if="cfg && cfg.updated_at" class="meta" style="margin-top:24px">Última atualização: {{ cfg.updated_at }}</p>

    <details class="system" style="margin-top:24px">
      <summary>Como obter</summary>
      <ul style="color:var(--muted);font-size:13px">
        <li><strong>API Key:</strong> faça login na Steam e abra <code>https://steamcommunity.com/dev/apikey</code>. Use o domínio <code>localhost</code> se pedir.</li>
        <li><strong>SteamID64:</strong> visite <code>https://steamid.io</code> com o link do seu perfil — copie o "steamID64".</li>
        <li>A biblioteca precisa estar pública pra Steam Web API retornar os jogos.</li>
      </ul>
    </details>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api, call, toast } from '../api'

const loaded = ref(false)
const cfg = ref(null)
const form = ref({ steam_api_key: '', steam_id64: '' })

async function load() {
  const data = await call(() => api.steam.getConfig())
  cfg.value = data
  if (data) {
    form.value.steam_api_key = data.api_key || ''
    form.value.steam_id64 = data.steam_id64 || ''
  }
  loaded.value = true
}

async function save() {
  try {
    const saved = await call(() => api.steam.setConfig({
      steam_api_key: form.value.steam_api_key,
      steam_id64: form.value.steam_id64,
    }))
    cfg.value = saved
    toast('Credenciais salvas', 'success')
  } catch { /* toast já mostrado pelo call() */ }
}

onMounted(load)
</script>
