import type { LspProcess } from "./direct-lsp-process.js";
import type { DirectLspScheduler } from "./direct-lsp-scheduler.js";

export type DirectLspOptions = {
  language?: "rust" | "python" | "csharp";
  root_uri: string;
  capabilities: Record<string, unknown>;
  safe_initialization_options: Readonly<Record<string, unknown>>;
  request_timeout_ms?: number;
  scheduler?: DirectLspScheduler;
  restart?: () => LspProcess | undefined;
  afterInitialize?: () =>
    | { status: "ready" }
    | { status: "unavailable"; code: string };
};
