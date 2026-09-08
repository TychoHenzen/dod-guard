import * as path from "node:path";
import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import {
  codeExplorerError,
  type CodeExplorerError,
} from "../navigation/error.js";
import {
  createFocusView,
  FocusBodyLimitError,
  type FocusView,
} from "../navigation/focus-view.js";
import type { SymbolIdentity } from "../semantic/api/public-api.js";
import { collectFocusedSymbol } from "./semantic-operations.js";
import { createEnvelope } from "./envelope.js";
import { projectCapacity, resourceLimit } from "./errors.js";
import type { ServerRuntime } from "./server-runtime.js";
import { schemas } from "./schemas.js";

export async function handleFocus(
  runtime: ServerRuntime,
  arguments_: Record<string, unknown>,
  freshness: FreshnessStatus,
): Promise<ReturnType<typeof createEnvelope> | CodeExplorerError | undefined> {
  const focus = schemas.code_focus.parse(arguments_);
  const saveView = (view: FocusView) => {
    if (
      runtime.sessions.addView(runtime.connectionId, focus.session_id, view) ===
      "project_capacity"
    )
      return projectCapacity();
    runtime.state.viewHistory.push(view.view_id);
    return createEnvelope(freshness, "ready", {
      ...view,
      history_position:
        runtime.sessions.historyPosition(
          runtime.connectionId,
          focus.session_id,
        ) ?? 0,
    });
  };
  if (focus.symbol_id.startsWith("file:") && runtime.options.projectRoot) {
    const filePath = focus.symbol_id.slice("file:".length);
    const body = runtime.options.projectRoot.protectedRead(filePath).bytes;
    const lineCount = body.split("\n").length;
    const view = createFocusView(
      {
        id: focus.symbol_id,
        name: path.posix.basename(filePath),
        language: (path.posix.extname(filePath).slice(1) ||
          "text") as SymbolIdentity["language"],
        kind: "file",
        location: {
          path: filePath,
          range: {
            start: { line: 0, character: 0 },
            end: { line: lineCount, character: 0 },
          },
        },
      },
      { body, visible_symbols: [] },
      focus.body_limit_bytes,
      freshness.current_generation,
    );
    return saveView(view);
  }
  const selected = await collectFocusedSymbol(
    runtime.options.adapters ?? [],
    focus.symbol_id,
    (operation) => runtime.backendRequests.run(focus.session_id, operation),
  );
  if (!selected) return undefined;
  try {
    return saveView(
      createFocusView(
        selected.symbol,
        selected.content,
        focus.body_limit_bytes,
        freshness.current_generation,
      ),
    );
  } catch (error) {
    if (error instanceof FocusBodyLimitError) return resourceLimit();
    throw error;
  }
}
