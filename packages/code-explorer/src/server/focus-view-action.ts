import * as path from "node:path";
import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import type { CodeExplorerError } from "../navigation/error.js";
import { createFocusView, type FocusView } from "../navigation/focus-view.js";
import type {
  ProjectRoot,
  SymbolIdentity,
} from "../semantic/api/public-api.js";
import { createEnvelope } from "./envelope.js";
import { projectCapacity } from "./errors.js";
import { schemas } from "./schemas.js";
import type { ServerRuntime } from "./server-runtime.js";

export function saveFocusView({
  runtime,
  sessionId,
  freshness,
  view,
}: {
  runtime: ServerRuntime;
  sessionId: string;
  freshness: FreshnessStatus;
  view: FocusView;
}): ReturnType<typeof createEnvelope> | CodeExplorerError {
  if (
    runtime.sessions.addView(runtime.connectionId, sessionId, view) ===
    "project_capacity"
  )
    return projectCapacity();
  runtime.state.viewHistory.push(view.view_id);
  return createEnvelope(freshness, "ready", {
    ...view,
    history_position:
      runtime.sessions.historyPosition(runtime.connectionId, sessionId) ?? 0,
  });
}

function fileLocation(
  filePath: string,
  lineCount: number,
): SymbolIdentity["location"] {
  const range = {
    start: { line: 0, character: 0 },
    end: { line: lineCount, character: 0 },
  };
  return { path: filePath, range };
}

export function createFileFocusView(
  root: ProjectRoot,
  focus: ReturnType<typeof schemas.code_focus.parse>,
  freshness: FreshnessStatus,
): FocusView {
  const filePath = focus.symbol_id.slice("file:".length);
  const body = root.protectedRead(filePath).bytes;
  const lineCount = body.split("\n").length;
  const symbol: SymbolIdentity = {
    id: focus.symbol_id,
    name: path.posix.basename(filePath),
    language: (path.posix.extname(filePath).slice(1) ||
      "text") as SymbolIdentity["language"],
    kind: "file",
    location: fileLocation(filePath, lineCount),
  };
  return createFocusView(
    symbol,
    { body, visible_symbols: [] },
    focus.body_limit_bytes,
    freshness.current_generation,
  );
}
