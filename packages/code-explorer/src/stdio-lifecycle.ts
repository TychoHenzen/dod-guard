export const STDIO_CLOSE_BUDGET_MS = 1_500;

export type StdioCloseReason = "signal" | "stdin_end" | "transport_close";

export type StdioCloseDeps = {
  closeCore: () => Promise<void>;
  releaseResources: () => void;
  exit: (code: number) => void;
  writeError: (line: string) => void;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
  budgetMs?: number;
};

export type StdioCloseController = {
  readonly closing: boolean;
  close(reason: StdioCloseReason): void;
};

export function createStdioCloseController(deps: StdioCloseDeps): StdioCloseController {
  const budgetMs = deps.budgetMs ?? STDIO_CLOSE_BUDGET_MS;
  let closing = false;
  let exited = false;
  let timer: unknown;
  const finish = (code: number, line?: string): void => {
    if (exited) return;
    exited = true;
    if (timer !== undefined) deps.clearTimer(timer);
    // Released again so a backend started while closing cannot outlive exit.
    deps.releaseResources();
    if (line !== undefined) deps.writeError(line);
    deps.exit(code);
  };
  return {
    get closing() {
      return closing;
    },
    close(reason) {
      if (closing) {
        // A second signal is an explicit request to stop now, not to wait out the budget.
        if (reason === "signal") finish(1);
        return;
      }
      closing = true;
      deps.releaseResources();
      timer = deps.setTimer(
        () => finish(1, `code-explorer: stdio close exceeded ${budgetMs} ms; backends were force-killed`),
        budgetMs,
      );
      deps.closeCore().then(
        () => finish(0),
        (error: unknown) =>
          finish(1, `code-explorer: stdio close failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    },
  };
}

type Emitter = { on(event: string, listener: () => void): unknown };

/** `on` rather than `once` for signals, so a second signal still reaches the closer. */
export function installStdioCloseTriggers(input: {
  signals: Emitter;
  stdin: { once(event: "end", listener: () => void): unknown };
  close: (reason: StdioCloseReason) => void;
}): void {
  input.signals.on("SIGINT", () => input.close("signal"));
  input.signals.on("SIGTERM", () => input.close("signal"));
  input.stdin.once("end", () => input.close("stdin_end"));
}
