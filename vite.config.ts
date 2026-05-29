import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

function devConfigPlugin(ioBrokerTarget: string): Plugin {
  const host = ioBrokerTarget.replace(/^https?:\/\//, '')
  return {
    name: 'dev-config-js',
    configureServer(server) {
      server.middlewares.use('/config.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript')
        res.end(`window.__CONFIG__ = { ioBrokerHost: '${host}' };\n`)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const IOBROKER_TARGET = env.VITE_IOBROKER_TARGET
  const ALLOWED_HOSTS = env.VITE_ALLOWED_HOSTS?.split(',').map((h) => h.trim()).filter(Boolean)

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      react(),
      ...(IOBROKER_TARGET ? [devConfigPlugin(IOBROKER_TARGET)] : []),
    ],
    server: {
      host: '0.0.0.0',
      allowedHosts: ALLOWED_HOSTS ?? ['pve-ct-dev', 'localhost', '127.0.0.1', 'iobroker-object-explorer.birkenweg.walk-steinweiler.de'],
      ...(IOBROKER_TARGET && {
        proxy: {
          '/api': {
            target: IOBROKER_TARGET,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
          },
        },
      }),
    },
  }
})
