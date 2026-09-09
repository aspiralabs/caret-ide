// Ambient types for Vite's `?worker` imports (this project doesn't reference
// `vite/client` globally). A `?worker` import yields a Worker constructor.
declare module '*?worker' {
  const workerConstructor: {
    new (options?: { name?: string }): Worker
  }
  export default workerConstructor
}
