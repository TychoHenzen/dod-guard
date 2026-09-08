import type { LanguageAdapter } from "../../../semantic/api/public-api.js";
import { readyAdapterStatus } from "../support/adapter-status.js";
import { focusReply, relationReply } from "./relation-replies.js";
export function relationAdapter(
  relation: "definition" | "references" | "callers" | "callees",
  overrides: Record<string, unknown> = {},
  count = 1,
): LanguageAdapter {
  return {
    status: () =>
      readyAdapterStatus({
        name: "fixture-lsp",
        version: "1.0.0",
        capabilities: overrides,
      }),
    request: async (request) => {
      if (request.operation === "focus") return focusReply();
      if (request.operation === relation) return relationReply(relation, count);
      throw new Error("unexpected relation");
    },
  };
}
