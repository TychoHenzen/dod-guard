export type CoreCall = { name: string; arguments_: Record<string, unknown> };

function focused(symbolId: string, name: string, kind: string, path: string, body: string) {
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
      handles: [],
    },
  };
}

export function createPackagedCore(calls: CoreCall[]) {
  return async (name: string, arguments_: Record<string, unknown>) => {
    calls.push({ name, arguments_ });
    if (name === "code_status" && arguments_.action === "start_session") {
      return { schema_version: 1, state: "ready", data: { session_id: "core-session" } };
    }
    if (name === "code_status" && arguments_.action === "status") {
      return { schema_version: 1, state: "ready", data: {} };
    }
    if (name === "code_search" && arguments_.query === "") {
      return {
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
      };
    }
    if (name === "code_search" && arguments_.query === "main") {
      return {
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
      };
    }
    if (name === "code_search" && arguments_.query === "client") {
      return {
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
      };
    }
    if (name === "code_focus" && arguments_.symbol_id === "symbol-main") {
      return focused("symbol-main", "main", "function", "src/main.ts", "export function main() { return 1; }");
    }
    if (name === "code_focus" && arguments_.symbol_id === "file:src/browser/client.ts") {
      return focused(
        "file:src/browser/client.ts",
        "client.ts",
        "file",
        "src/browser/client.ts",
        "export const client = true;",
      );
    }
    return { schema_version: 1, code: "invalid_request", message: "invalid_request", retryable: false };
  };
}
