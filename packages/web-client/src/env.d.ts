/// <reference types="vite/client" />
declare module '*.css';

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
