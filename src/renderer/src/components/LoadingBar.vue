<template>
  <div id="loading-bar" :class="{ 'is-loading': active, 'is-done': done }" :style="{ width: width + '%' }"></div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ui } from '../api'

const width = ref(0)
const active = ref(false)
const done = ref(false)
let timer = null

function start() {
  active.value = true
  done.value = false
  width.value = 0
  clearInterval(timer)
  timer = setInterval(() => {
    width.value = Math.min(90, width.value + (90 - width.value) * 0.08)
    if (width.value >= 89.5) { clearInterval(timer); timer = null }
  }, 150)
}

function finish() {
  clearInterval(timer); timer = null
  width.value = 100
  done.value = true
  active.value = false
  setTimeout(() => { width.value = 0; done.value = false }, 400)
}

watch(() => ui.busy, (n, o) => {
  if (o === 0 && n > 0) start()
  else if (n === 0 && o > 0) finish()
})
</script>
