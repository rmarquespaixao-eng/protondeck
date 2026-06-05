import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// O código backend usa specifiers ESM-TS (`import x from './foo.js'` apontando
// pra `./foo.ts`). O bundler do Vite/Rollup não resolve `.js`→`.ts` sozinho,
// então este plugin faz isso pré-resolução. Aplica em main/preload/renderer
// pra que main e renderer possam importar `domain/` e `application/` direto.
const jsToTs = {
  name: 'resolve-js-to-ts',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer) return null
    // Só reescreve imports do NOSSO código-fonte. Nunca toca nos chunks internos
    // do otimizador de deps do Vite (.vite/deps) nem em node_modules — senão o
    // pre-bundling de vue/vue-router quebra ("optimized info should be defined").
    if (importer.includes('node_modules') || importer.includes('.vite')) return null
    if (/^\.{0,2}\//.test(source) && source.endsWith('.js')) {
      const tsSource = source.slice(0, -3) + '.ts'
      const resolved = await this.resolve(tsSource, importer, { ...options, skipSelf: true })
      if (resolved) return resolved
    }
    return null
  },
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), jsToTs],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin(), jsToTs],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@domain': resolve(__dirname, 'src/domain'),
      },
    },
    plugins: [vue(), jsToTs],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
})
