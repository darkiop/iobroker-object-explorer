import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const IOBROKER_TARGET = 'http://10.4.0.20:8093'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['pve-ct-dev'],
    proxy: {
      '/api': {
        target: IOBROKER_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
