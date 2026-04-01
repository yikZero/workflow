# Runtime targets

## Use Vercel-managed execution when

- The app is deploying on Vercel.
- The user wants zero-config workflow storage, queueing, and streaming.

Guidance:

- Start workflows from the app boundary with `start()`.
- Retrieve runs later with `getRun()`.
- Do not invent custom `World` code unless the task requires it.

## Use a custom World when

- The app is self-hosted.
- The app is not deploying on Vercel.
- The task explicitly asks for custom infrastructure.

Minimum interface to mention:

```ts
interface World extends Queue, Storage, Streamer {
  start?(): Promise<void>;
}
```

Required responsibilities:

- **Storage** for runs, steps, hooks, waits, and the event log.
- **Queueing** for workflow and step invocations.
- **Streaming** for readable/writable workflow streams.

## Framework rule

If the target framework is named, shape app-boundary examples to that framework.

If the target framework is **not** named, keep examples framework-agnostic with `Request` / `Response`. Do not default to Next.js-only route signatures unless Next.js is explicitly named.
