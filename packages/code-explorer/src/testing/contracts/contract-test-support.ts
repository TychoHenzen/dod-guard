import type { SemanticResult } from "../../semantic/contracts/contract.js";

export const location = {
  path: "src/helper.rs",
  range: {
    start: { line: 1, character: 0 },
    end: { line: 3, character: 1 },
  },
} as const;

export function searchResult(): SemanticResult {
  return {
    operation: "search",
    revision: {
      generation: 2,
      manifest_sha256: "manifest-sha256",
    },
    symbols: [
      {
        id: "rust:helper",
        name: "helper",
        language: "rust",
        kind: "function",
        location,
      },
    ],
  };
}
