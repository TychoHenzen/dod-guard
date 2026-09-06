import type { DirectLspOptions } from "./direct-lsp-options.js";
import { boundedTimeout } from "./direct-lsp-protocol.js";
import { defaultDirectLspScheduler } from "./direct-lsp-runtime-scheduler.js";
import { DirectLspRuntimeStateCore } from "./direct-lsp-runtime-state-core.js";
import { clone, deepFreeze } from "./direct-lsp-values.js";

export class DirectLspRuntimeState extends DirectLspRuntimeStateCore {
  readonly options: DirectLspOptions;
  readonly capabilities: Record<string, unknown>;
  readonly initializationOptions: Readonly<Record<string, unknown>>;
  readonly timeoutMs: number;

  constructor(options: DirectLspOptions) {
    super(options.scheduler ?? defaultDirectLspScheduler);
    this.options = options;
    this.capabilities = deepFreeze(clone(options.capabilities));
    this.initializationOptions = deepFreeze(
      clone(options.safe_initialization_options),
    );
    this.timeoutMs = boundedTimeout(options.request_timeout_ms ?? 10_000);
  }
}
