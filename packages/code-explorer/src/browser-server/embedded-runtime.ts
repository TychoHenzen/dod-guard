import type { ProjectRoot } from "../semantic/project-root.js";
import { createNativeProjectRoot } from "../semantic/project-root.js";
import { type BrowserHttpRequest, type BrowserHttpResponse, BrowserHttpRouter } from "./http-router.js";
import { BrowserServerError, type ExplorerCoreFactory } from "./lifecycle.js";

export type EmbeddedBrowserRuntime = {
  projectRoot: ProjectRoot;
  handle(request: BrowserHttpRequest): Promise<BrowserHttpResponse>;
  close(): Promise<void>;
};

function loopbackOrigin(origin: string): URL {
  const parsed = new URL(origin);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !parsed.port) {
    throw new BrowserServerError("invalid_request");
  }
  return parsed;
}

export async function startEmbeddedBrowserRuntime(options: {
  projectRoot: string;
  origin: string;
  assetRoot: string;
  coreFactory: ExplorerCoreFactory;
  signal?: AbortSignal;
}): Promise<EmbeddedBrowserRuntime> {
  const parsedOrigin = loopbackOrigin(options.origin);
  const projectRoot = createNativeProjectRoot(options.projectRoot);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  let core: Awaited<ReturnType<ExplorerCoreFactory["start"]>>;
  try {
    core = await options.coreFactory.start({ projectRoot, signal: controller.signal });
    if (controller.signal.aborted) {
      await core.close(AbortSignal.timeout(10_000));
      throw new Error("aborted");
    }
  } catch (error) {
    options.signal?.removeEventListener("abort", abort);
    throw error;
  }
  const router = new BrowserHttpRouter({
    origin: parsedOrigin.origin,
    assetRoot: options.assetRoot,
    call:
      core.call ??
      (async () => ({
        schema_version: 1,
        code: "workspace_unavailable",
        message: "workspace_unavailable",
        retryable: true,
      })),
  });
  let closing: Promise<void> | undefined;
  return {
    projectRoot,
    handle: (request) => router.handle(request),
    close: () =>
      (closing ??= (async () => {
        controller.abort();
        await core.close(AbortSignal.timeout(10_000));
        options.signal?.removeEventListener("abort", abort);
      })()),
  };
}
