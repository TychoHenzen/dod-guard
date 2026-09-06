import type { LanguageAdapter } from "./language-adapter.js";
import type { ProjectRoot } from "./project-root.js";
import { createRuntimeAdapters } from "./runtime-adapters.js";

export async function createStartedRuntimeAdapters(
  projectRoot: ProjectRoot,
  signal?: AbortSignal,
): Promise<readonly LanguageAdapter[]> {
  const adapters = createRuntimeAdapters(projectRoot);
  await Promise.allSettled(
    adapters.map((adapter) => startAdapter(adapter, signal)),
  );
  if (signal?.aborted) {
    await Promise.allSettled(adapters.map((adapter) => adapter.shutdown?.()));
    throw new Error("aborted");
  }
  return adapters;
}

async function startAdapter(
  adapter: LanguageAdapter,
  signal?: AbortSignal,
): Promise<void> {
  if (!adapter.start) return;
  if (!signal) return adapter.start();
  await startWithAbort(adapter, signal);
}

function startWithAbort(
  adapter: LanguageAdapter,
  signal: AbortSignal,
): Promise<void> {
  let abortHandler: (() => void) | undefined;
  return Promise.race([
    adapter.start?.(signal) ?? Promise.resolve(),
    new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(new Error("aborted"));
        return;
      }
      abortHandler = () => reject(new Error("aborted"));
      signal.addEventListener("abort", abortHandler, {
        once: true,
      });
    }),
  ]).finally(() => {
    if (abortHandler) signal.removeEventListener("abort", abortHandler);
  });
}
