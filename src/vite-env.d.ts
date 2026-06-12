/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface RuntimeConfig {
  ioBrokerHost: string;
}

declare interface Window {
  __CONFIG__: RuntimeConfig;
}
