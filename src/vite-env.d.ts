/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface RuntimeConfig {
  ioBrokerHost: string;
}

declare interface Window {
  __CONFIG__: RuntimeConfig;
}
