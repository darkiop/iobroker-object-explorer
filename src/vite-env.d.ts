/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
declare const __GIT_BRANCH__: string;

interface RuntimeConfig {
  ioBrokerHost: string;
}

declare interface Window {
  __CONFIG__: RuntimeConfig;
}
