// Shims for config-time TypeScript to avoid editor errors before deps are installed.
// Safe to delete after running `npm install`.

declare module 'vite' {
  export function defineConfig(config: any): any
}

declare module '@vitejs/plugin-react' {
  const plugin: any
  export default plugin
}

declare module 'node:url' {
  export function fileURLToPath(url: any): any
  export const URL: any
}
