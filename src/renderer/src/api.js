import { reactive } from 'vue'

// Estado de UI global: contador de operações em andamento (loading bar) e toasts.
export const ui = reactive({ busy: 0, toasts: [] })

let toastSeq = 0
export function toast(msg, kind = 'error') {
  const id = ++toastSeq
  ui.toasts.push({ id, msg: String(msg), kind })
  setTimeout(() => dismissToast(id), 6000)
  return id
}
export function dismissToast(id) {
  const i = ui.toasts.findIndex((t) => t.id === id)
  if (i >= 0) ui.toasts.splice(i, 1)
}

// Bridge exposta pelo preload (src/preload/index.ts).
export const api = window.api

// Envolve uma chamada IPC: liga a loading bar e mostra toast em erro.
// call(() => api.games.list(filter))  ->  resultado | lança o erro.
export async function call(fn, { quiet = false } = {}) {
  ui.busy++
  try {
    return await fn()
  } catch (err) {
    if (!quiet) toast(err?.message || String(err))
    throw err
  } finally {
    ui.busy--
  }
}

export function openExternal(url) {
  api.shell.openExternal(url)
}
