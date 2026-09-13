import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import type { CodeExplorerError } from "../navigation/error.js";
import {
  createFocusView,
  FocusBodyLimitError,
} from "../navigation/focus-view.js";
import { createEnvelope } from "./envelope.js";
import { resourceLimit } from "./errors.js";
import { createFileFocusView, saveFocusView } from "./focus-view-action.js";
import { schemas } from "./schemas.js";
import { collectFocusedSymbol } from "./semantic-operations.js";
import type { ServerRuntime } from "./server-runtime.js";

function createSelectedFocusView({
  runtime,
  focus,
  freshness,
  selected,
}: {
  runtime: ServerRuntime;
  focus: ReturnType<typeof schemas.code_focus.parse>;
  freshness: FreshnessStatus;
  selected: NonNullable<Awaited<ReturnType<typeof collectFocusedSymbol>>>;
}): ReturnType<typeof createEnvelope> | CodeExplorerError {
  try {
    const view = createFocusView(
      selected.symbol,
      selected.content,
      focus.body_limit_bytes,
      freshness.current_generation,
    );
    return saveFocusView({
      runtime,
      sessionId: focus.session_id,
      freshness,
      view,
    });
  } catch (error) {
    if (error instanceof FocusBodyLimitError) return resourceLimit();
    throw error;
  }
}

async function createSemanticFocusView({
  runtime,
  focus,
  freshness,
}: {
  runtime: ServerRuntime;
  focus: ReturnType<typeof schemas.code_focus.parse>;
  freshness: FreshnessStatus;
}): Promise<ReturnType<typeof createEnvelope> | CodeExplorerError | undefined> {
  const selected = await collectFocusedSymbol(
    runtime.options.adapters ?? [],
    focus.symbol_id,
    (operation) => runtime.backendRequests.run(focus.session_id, operation),
  );
  if (!selected) return;
  return createSelectedFocusView({ runtime, focus, freshness, selected });
}

export async function handleFocus(
  runtime: ServerRuntime,
  arguments_: Record<string, unknown>,
  freshness: FreshnessStatus,
): Promise<ReturnType<typeof createEnvelope> | CodeExplorerError | undefined> {
  const focus = schemas.code_focus.parse(arguments_);
  const root = runtime.options.projectRoot;
  if (focus.symbol_id.startsWith("file:") && root) {
    const view = createFileFocusView(root, focus, freshness);
    return saveFocusView({
      runtime,
      sessionId: focus.session_id,
      freshness,
      view,
    });
  }
  return createSemanticFocusView({ runtime, focus, freshness });
}
