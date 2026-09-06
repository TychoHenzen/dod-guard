import type { LspProcess } from "./direct-lsp-process.js";

export type RestartProcess = (process: LspProcess) => Promise<void>;
