import type { ExplorerCore, ExplorerCoreFactory } from "./browser-server/lifecycle.js";
import { countSensitivePathsUnderRoot } from "./discovery/sensitive-paths.js";
import { createNativeWorkspaceFreshness } from "./freshness/workspace-native.js";
import { createServer as createCodeExplorerServer } from "./server/create-server.js";
import type { CodeExplorerServer } from "./server/server-contract.js";
import {
  createNativeProjectRoot,
  createStartedRuntimeAdapters,
  loadAdapterSelectionRecord,
  type LanguageAdapter,
  type ProjectRoot,
} from "./semantic/api/public-api.js";

function stopAdapters(adapters: readonly LanguageAdapter[]): Promise<PromiseSettledResult<void>[]> {
  return Promise.allSettled(adapters.map((adapter) => adapter.shutdown?.()));
}

export function createRuntimeServer(projectRoot: ProjectRoot, adapters: readonly LanguageAdapter[]): CodeExplorerServer {
  return createCodeExplorerServer({
    projectRoot,
    adapters,
    sensitive_paths_excluded: countSensitivePathsUnderRoot(projectRoot.canonicalPath),
    freshness: createNativeWorkspaceFreshness({
      root: projectRoot.canonicalPath,
      supported: (candidate) => /\.(?:rs|py|cs|ts|tsx|js|jsx|json)$/iu.test(candidate),
    }),
  });
}

function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) =>
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
  );
}

function createRuntimeCore(server: CodeExplorerServer, adapters: readonly LanguageAdapter[]): ExplorerCore {
  let closing: Promise<void> | undefined;
  const cleanup = async () => {
    await server.close();
    await stopAdapters(adapters);
  };
  return {
    call: (name, arguments_) => server.call(name, arguments_),
    close: async (signal) => {
      if (signal.aborted) throw new Error("aborted");
      closing ??= cleanup();
      await Promise.race([closing, abortPromise(signal)]);
    },
  };
}

async function startRuntimeCore({ projectRoot, signal }: Parameters<ExplorerCoreFactory["start"]>[0]): Promise<ExplorerCore> {
  loadAdapterSelectionRecord();
  let adapters: readonly LanguageAdapter[] = [];
  try {
    adapters = await createStartedRuntimeAdapters(projectRoot, signal);
    if (signal.aborted) throw new Error("aborted");
    return createRuntimeCore(createRuntimeServer(projectRoot, adapters), adapters);
  } catch (error) {
    await stopAdapters(adapters);
    throw error;
  }
}

export function createRuntimeCoreFactory(): ExplorerCoreFactory {
  return { start: startRuntimeCore };
}
