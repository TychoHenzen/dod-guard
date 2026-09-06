import type { FocusHandle } from "../navigation/focus-view.js";

export type CoreCall = { name: string; arguments_: Record<string, unknown> };

function focused(
  symbolId: string,
  name: string,
  kind: string,
  path: string,
  body: string,
  handles: FocusHandle[] = [],
) {
  return {
    schema_version: 1,
    project_generation: 1,
    state: "ready",
    data: {
      view_id: `view-${name.replace(".ts", "")}`,
      project_generation: 1,
      symbol_id: symbolId,
      name,
      kind,
      path,
      content: {
        body,
        truncated: false,
        limit_bytes: 32768,
        returned_bytes: Buffer.byteLength(body),
        total_bytes: Buffer.byteLength(body),
      },
      handles,
    },
  };
}

const invalidReply = { schema_version: 1, code: "invalid_request", message: "invalid_request", retryable: false };
const statusReplies = {
  start_session: { schema_version: 1, state: "ready", data: { session_id: "core-session" } },
  status: { schema_version: 1, state: "ready", data: {} },
};
const searchReplies = {
  "": {
    schema_version: 1,
    state: "ready",
    data: {
      landmarks: [
        {
          group: "entry_points",
          symbols: [{ symbol_id: "symbol-main", name: "main", path: "src/main.ts", kind: "function" }],
        },
      ],
    },
  },
  main: {
    schema_version: 1,
    state: "ready",
    data: {
      candidates: [
        {
          type: "symbol",
          identity: "symbol-main",
          name: "main",
          match_class: "exact",
          match_score: 100,
          path: "src/main.ts",
          kind: "function",
        },
      ],
    },
  },
  client: {
    schema_version: 1,
    state: "ready",
    data: {
      candidates: [
        {
          type: "file",
          identity: "file:src/browser/client.ts",
          match_class: "exact",
          match_score: 100,
          path: "src/browser/client.ts",
        },
      ],
    },
  },
};
const mainFocus = focused("symbol-main", "main", "function", "src/main.ts", "export function main() { return 1; }", [
  {
    handle: "handle-main",
    name: "main",
    symbol_id: "symbol-main",
    start: 16,
    end: 20,
    out_of_range: false,
    relations: ["definition", "references", "callers", "callees", "type", "implementation"],
  },
]);
const clientFocus = focused(
  "file:src/browser/client.ts",
  "client.ts",
  "file",
  "src/browser/client.ts",
  "export const client = true;",
);

function packagedReply(name: string, arguments_: Record<string, unknown>) {
  if (name === "code_status" && typeof arguments_.action === "string")
    return statusReplies[arguments_.action as keyof typeof statusReplies] ?? invalidReply;
  if (name === "code_search" && typeof arguments_.query === "string")
    return searchReplies[arguments_.query as keyof typeof searchReplies] ?? invalidReply;
  if (name === "code_focus" && arguments_.symbol_id === "symbol-main") return mainFocus;
  if (name === "code_focus" && arguments_.symbol_id === "file:src/browser/client.ts") return clientFocus;
  if (name === "code_follow" && arguments_.handle === "handle-main")
    return { schema_version: 1, state: "ready", data: { relation: arguments_.relation, candidates: [] } };
  return invalidReply;
}

export function createPackagedCore(calls: CoreCall[]) {
  return async (name: string, arguments_: Record<string, unknown>) => {
    calls.push({ name, arguments_ });
    return packagedReply(name, arguments_);
  };
}
