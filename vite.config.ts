import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { proxy: { '/api/agent': { target: 'http://127.0.0.1:3001', changeOrigin: false } } },
})
