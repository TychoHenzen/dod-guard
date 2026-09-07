import type { ProjectRoot } from "../semantic/api/public-api.js";
import type { EmbeddedBrowserRuntime } from "./embedded-browser-runtime.js";
import type { ExplorerCoreFactory } from "./lifecycle.js";
import { unavailableBrowserCall } from "./browser-unavailable-call.js";
import { BrowserHttpRouter } from "./http-router.js";

export function createEmbeddedRuntime(options: {
  projectRoot: ProjectRoot;
  origin: string;
  assetRoot: string;
  core: Awaited<ReturnType<ExplorerCoreFactory["start"]>>;
  controller: AbortController;
  unlinkAbortSignal: () => void;
}): EmbeddedBrowserRuntime {
  const router = new BrowserHttpRouter({
    origin: options.origin,
    assetRoot: options.assetRoot,
    call: options.core.call ?? unavailableBrowserCall,
  });
  return {
    projectRoot: options.projectRoot,
    handle: (request) => router.handle(request),
    close: closeCore(options),
  };
}

function closeCore(options: {
  core: Awaited<ReturnType<ExplorerCoreFactory["start"]>>;
  controller: AbortController;
  unlinkAbortSignal: () => void;
}): () => Promise<void> {
  let closing: Promise<void> | undefined;
  return () => {
    if (closing) return closing;
    closing = closeRuntime(options);
    return closing;
  };
}

async function closeRuntime(options: {
  core: Awaited<ReturnType<ExplorerCoreFactory["start"]>>;
  controller: AbortController;
  unlinkAbortSignal: () => void;
}): Promise<void> {
  options.controller.abort();
  await options.core.close(AbortSignal.timeout(10_000));
  options.unlinkAbortSignal();
}
