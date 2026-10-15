import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { fileURLToPath, URL } from 'node:url'

// 开发时把 /api 代理到本地 Go 服务，生产环境由同一个 Go 进程提供静态资源，
// 两者同源，因此不需要额外的 CORS 配置。
export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
})
