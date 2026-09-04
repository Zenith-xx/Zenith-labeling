/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LABELING_SERVER_URL?: string;
  readonly VITE_TUNNEL_HMR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
