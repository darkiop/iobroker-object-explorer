/// <reference types="vite/client" />

interface RuntimeConfig {
  ioBrokerHost: string;
}

declare interface Window {
  __CONFIG__: RuntimeConfig;
}
