export type FileAnalysisReason = "invalid_encoding" | "syntax_error" | "unsupported_syntax" | "incomplete_analysis";

export type FileAnalysisStatus =
  | { state: "ready" }
  | { state: "partial"; reason: Exclude<FileAnalysisReason, "invalid_encoding" | "unsupported_syntax"> }
  | { state: "unavailable"; reason: Extract<FileAnalysisReason, "invalid_encoding" | "unsupported_syntax"> };

export type FileAnalysisInput = { path: string; text: string } | { path: string; bytes: Uint8Array };

/**
 * Keeps analysis failures at the source-file boundary. A file must be decoded
 * before it can be offered to a semantic backend, so malformed UTF-8 never
 * disables unrelated source files or the language adapter.
 */
export type FileAnalysisStates = {
  status(path: string): FileAnalysisStatus | undefined;
  queryablePaths(): readonly string[];
  markPartial(path: string, reason: "syntax_error" | "incomplete_analysis"): void;
  markUnavailable(path: string, reason: "unsupported_syntax"): void;
  mayInferMissingRelation(path: string): boolean;
};

export function createFileAnalysisStates(inputs: readonly FileAnalysisInput[]): FileAnalysisStates {
  const states = new Map<string, FileAnalysisStatus>();
  for (const input of inputs) states.set(input.path, initialStatus(input));

  return {
    status: (path) => states.get(path),
    queryablePaths: () => [...states].flatMap(([path, status]) => (status.state === "unavailable" ? [] : [path])),
    markPartial: (path, reason) => setKnownPath(states, path, { state: "partial", reason }),
    markUnavailable: (path, reason) => setKnownPath(states, path, { state: "unavailable", reason }),
    mayInferMissingRelation: (path) => states.get(path)?.state === "ready",
  };
}

function initialStatus(input: FileAnalysisInput): FileAnalysisStatus {
  if ("text" in input) return { state: "ready" };
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(input.bytes);
    return { state: "ready" };
  } catch {
    return { state: "unavailable", reason: "invalid_encoding" };
  }
}

function setKnownPath(states: Map<string, FileAnalysisStatus>, path: string, status: FileAnalysisStatus): void {
  if (!states.has(path)) throw new Error("unknown_analysis_file");
  states.set(path, status);
}
