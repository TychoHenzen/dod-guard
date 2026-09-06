import { createNativeProjectRoot, type ProjectRoot } from "../semantic/api/public-api.js";
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

function linkAbortSignal(parent: AbortSignal | undefined, child: AbortController) {
  if (!parent) return () => undefined;
  const abort = () => child.abort(parent.reason);
  if (parent.aborted) {
    abort();
    return () => undefined;
  }
  parent.addEventListener("abort", abort, { once: true });
  return () => parent.removeEventListener("abort", abort);
}

async function startCore(
  options: { coreFactory: ExplorerCoreFactory; projectRoot: ProjectRoot; signal: AbortSignal },
  unlinkAbortSignal: () => void,
): Promise<Awaited<ReturnType<ExplorerCoreFactory["start"]>>> {
  try {
    const core = await options.coreFactory.start({ projectRoot: options.projectRoot, signal: options.signal });
    if (options.signal.aborted) {
      await core.close(AbortSignal.timeout(10_000));
      throw new Error("aborted");
    }
    return core;
  } catch (error) {
    unlinkAbortSignal();
    throw error;
  }
}

function closeCore(
  controller: AbortController,
  core: Awaited<ReturnType<ExplorerCoreFactory["start"]>>,
  unlinkAbortSignal: () => void,
) {
  let closing: Promise<void> | undefined;
  return () => {
    if (closing) return closing;
    closing = (async () => {
      controller.abort();
      await core.close(AbortSignal.timeout(10_000));
      unlinkAbortSignal();
    })();
    return closing;
  };
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
  const unlinkAbortSignal = linkAbortSignal(options.signal, controller);
  const core = await startCore(
    { coreFactory: options.coreFactory, projectRoot, signal: controller.signal },
    unlinkAbortSignal,
  );
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
  return {
    projectRoot,
    handle: (request) => router.handle(request),
    close: closeCore(controller, core, unlinkAbortSignal),
  };
}
