<template>
  <div class="toast-stack">
    <div v-for="t in ui.toasts" :key="t.id" class="toast" :class="'toast-' + t.kind" @click="dismissToast(t.id)">
      {{ t.msg }}
    </div>
  </div>
</template>

<script setup>
import { ui, dismissToast } from '../api'
</script>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: 18px;
  right: 18px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 380px;
}
.toast {
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 0.85rem;
  cursor: pointer;
  border: 1px solid var(--border, #2a2f3a);
  background: var(--bg-2, #0f1218);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  color: var(--text, #e6e8ee);
}
.toast-error { border-color: #b4413c; }
.toast-success { border-color: #2f8f5b; }
</style>
