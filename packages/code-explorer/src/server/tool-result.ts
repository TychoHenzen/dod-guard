import type { CodeExplorerError } from "../navigation/error.js";
import type { CodeExplorerEnvelope } from "./envelope.js";

export function toMcpToolResult(
  result: CodeExplorerEnvelope | CodeExplorerError,
  isError = false,
) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    ...(isError ? { isError: true } : {}),
  };
}
