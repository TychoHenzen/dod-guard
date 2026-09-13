import { createDiscoveryPipeline } from "../discovery/pipeline.js";
import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import type { LanguageAdapter } from "../semantic/api/public-api.js";
import type { ServerRuntime } from "./server-runtime.js";
import type { ToolName } from "./tool-name.js";

export type PerformCallRequest = {
  runtime: ServerRuntime;
  name: ToolName;
  arguments_: Record<string, unknown>;
  sessionId: string | undefined;
};

function queueAdapterRefresh(
  runtime: ServerRuntime,
  adapter: LanguageAdapter,
  sessionId: string | undefined,
): Promise<void>[] {
  const refresh = adapter.refresh;
  return refresh
    ? [runtime.backendRequests.run(sessionId, () => refresh())]
    : [];
}

async function refreshAdapters(
  runtime: ServerRuntime,
  sessionId: string | undefined,
): Promise<void> {
  const operations = (runtime.options.adapters ?? []).flatMap((adapter) =>
    queueAdapterRefresh(runtime, adapter, sessionId),
  );
  await Promise.all(operations);
}

async function refreshProject(
  runtime: ServerRuntime,
  sessionId: string | undefined,
): Promise<void> {
  runtime.state.refreshGeneration += 1;
  await refreshAdapters(runtime, sessionId);
  const replacement = await runtime.options.rebuild_derived?.();
  if (runtime.options.projectRoot)
    runtime.state.discovery = createDiscoveryPipeline(
      runtime.options.projectRoot,
    );
  if (replacement?.landmarks)
    runtime.state.landmarks = replacement.landmarks;
}

export async function requestFreshness(
  request: PerformCallRequest,
): Promise<FreshnessStatus> {
  const { runtime, name, arguments_, sessionId } = request;
  if (name === "code_status" && arguments_.action === "refresh") {
    await runtime.generationScheduler.refresh(() =>
      refreshProject(runtime, sessionId),
    );
    return runtime.freshness.status();
  }
  return (await runtime.generationScheduler.accept()).status;
}
