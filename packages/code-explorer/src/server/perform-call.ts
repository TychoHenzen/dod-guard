import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import { createDiscoveryPipeline } from "../discovery/pipeline.js";
import { codeExplorerError, type CodeExplorerError } from "../navigation/error.js";
import type { LanguageAdapter } from "../semantic/api/public-api.js";
import { handleFocus } from "./focus-action.js";
import { handleFollow } from "./follow-action.js";
import { handleHistory } from "./history-action.js";
import { handleSearch } from "./search-action.js";
import { handleStatus } from "./status-action.js";
import type { CodeExplorerEnvelope } from "./envelope.js";
import type { ServerRuntime } from "./server-runtime.js";
import type { ToolName } from "./tool-name.js";

export async function performCall(
  runtime: ServerRuntime,
  name: ToolName,
  arguments_: Record<string, unknown>,
  sessionId: string | undefined,
): Promise<CodeExplorerEnvelope | CodeExplorerError> {
  const rootStatus = await runtime.rootAccess.check();
  if (name !== "code_status" && rootStatus.state !== "ready") return codeExplorerError(rootStatus.state);
  let capturedFreshness: FreshnessStatus;
  if (name === "code_status" && arguments_.action === "refresh") {
    await runtime.generationScheduler.refresh(async () => {
      runtime.state.refreshGeneration += 1;
      await Promise.all(
        (runtime.options.adapters ?? []).flatMap((adapter: LanguageAdapter) => {
          const refresh = adapter.refresh;
          return refresh ? [runtime.backendRequests.run(sessionId, () => refresh())] : [];
        }),
      );
      const replacement = await runtime.options.rebuild_derived?.();
      if (runtime.options.projectRoot) runtime.state.discovery = createDiscoveryPipeline(runtime.options.projectRoot);
      if (replacement?.landmarks) runtime.state.landmarks = replacement.landmarks;
    });
    capturedFreshness = runtime.freshness.status();
  } else {
    capturedFreshness = (await runtime.generationScheduler.accept()).status;
  }
  if (name === "code_focus") {
    const result = await handleFocus(runtime, arguments_, capturedFreshness);
    if (result) return result;
  }
  if (name === "code_follow") {
    const result = await handleFollow(runtime, arguments_, capturedFreshness);
    if (result) return result;
  }
  if (name === "code_history") return handleHistory(runtime, arguments_, capturedFreshness);
  if (name === "code_search" && runtime.state.discovery) return handleSearch(runtime, arguments_, capturedFreshness);
  return handleStatus(runtime, name, arguments_, capturedFreshness, rootStatus);
}
