import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const IOBROKER_TARGET = env.VITE_IOBROKER_TARGET || 'http://10.4.0.20:8093'

  return {
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
  }
})
