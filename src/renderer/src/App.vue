<template>
  <LoadingBar />
  <div class="app-shell">
    <AppSidebar />
    <main class="main-content">
      <router-view v-slot="{ Component }">
        <component :is="Component" :key="$route.fullPath" />
      </router-view>
    </main>
  </div>
  <ToastStack />
</template>

<script setup>
import AppSidebar from './components/AppSidebar.vue'
import LoadingBar from './components/LoadingBar.vue'
import ToastStack from './components/ToastStack.vue'
</script>
