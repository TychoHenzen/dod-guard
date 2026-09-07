import type { LanguageAdapter } from "../../../semantic/api/public-api.js";
import { readyAdapterStatus } from "../support/adapter-status.js";
import { practiceReply } from "./practice-reply.js";

const unavailable = { state: "unavailable" };
export function practiceAdapter(): LanguageAdapter {
  return {
    status: () =>
      readyAdapterStatus({
        name: "practice-fixture",
        version: "1.0.0",
        capabilities: {
          references: unavailable,
          type_definition: unavailable,
          implementation: unavailable,
          callers: unavailable,
          callees: unavailable,
        },
      }),
    request: async (request) => practiceReply(request.operation),
  };
}
