// Temporary shims to keep the IDE clean before `npm install`.
// Safe to delete after dependencies are installed.

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any
    }
  }
}

declare module 'react' {
  const React: any
  export default React
  export const StrictMode: any

  // Minimal React namespace/types
  export namespace React {
    export type FC<P = any> = (props: P) => any
    export type ChangeEvent<T = any> = any
    export type FormEvent<T = any> = any
    export type ChangeEventHandler<T = any> = (event: any) => void
    export type FormEventHandler<T = any> = (event: any) => void
  }

  // Hook shims with basic generics to avoid TS generic errors
  export function useState<T = any>(initial: T): [T, (value: T) => void]
  export function useEffect(cb: (...args: any[]) => any, deps?: any[]): void
}

declare module 'react-dom/client' {
  export const createRoot: any
}

declare module 'react-router-dom' {
  export const BrowserRouter: any
  export const Routes: any
  export const Route: any
  export const Link: any
  export const Navigate: any
  export function useNavigate(): (path: string) => void
}

// Provide jsx-runtime module to satisfy TS JSX checks
declare module 'react/jsx-runtime' {
  export const jsx: any
  export const jsxs: any
  export const Fragment: any
}
