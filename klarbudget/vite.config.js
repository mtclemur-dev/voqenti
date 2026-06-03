import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      clientPort: 5174,
    },
  },
})
