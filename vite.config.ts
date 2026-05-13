import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        user:  new URL('./index.html',  import.meta.url).pathname,
        admin: new URL('./admin.html', import.meta.url).pathname,
      },
    },
  },
})
