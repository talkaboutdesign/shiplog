/// <reference types="vite/client" />

declare module "vite" {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<any>>;
  }
}
