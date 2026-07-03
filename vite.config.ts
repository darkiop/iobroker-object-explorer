import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
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
  // Derive socket.io target from IOBROKER_TARGET — same host, port 8084 (or VITE_SOCKETIO_PORT)
  const SOCKETIO_TARGET = (() => {
    if (!IOBROKER_TARGET) return null
    try {
      const url = new URL(IOBROKER_TARGET)
      const port = env.VITE_SOCKETIO_PORT || '8084'
      return `http://${url.hostname}:${port}`
    } catch { return null }
  })()

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      react(),
      VitePWA({
        manifest: false,
        strategies: 'generateSW',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        injectRegister: null,
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
          globIgnores: ['**/config.js'],
          runtimeCaching: [
            {
              urlPattern: /\/v1\/objects/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'iobroker-objects-v1',
                networkTimeoutSeconds: 3,
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\/v1\/states/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'iobroker-states-v1',
                networkTimeoutSeconds: 3,
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
      ...(IOBROKER_TARGET ? [devConfigPlugin(IOBROKER_TARGET)] : []),
    ],
    server: {
      host: '0.0.0.0',
      ...(ALLOWED_HOSTS && { allowedHosts: ALLOWED_HOSTS }),
      ...((IOBROKER_TARGET || SOCKETIO_TARGET) && {
        proxy: {
          ...(IOBROKER_TARGET && {
            '/api': {
              target: IOBROKER_TARGET,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          }),
          ...(SOCKETIO_TARGET && {
            '/socket.io': {
              target: SOCKETIO_TARGET,
              changeOrigin: true,
              ws: true,
            },
          }),
        },
      }),
    },
  }
})
