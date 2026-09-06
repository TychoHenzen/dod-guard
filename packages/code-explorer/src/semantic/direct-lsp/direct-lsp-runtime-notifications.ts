import { PERMITTED_NOTIFICATIONS } from "./direct-lsp-protocol.js";
import { fail } from "./direct-lsp-runtime-failure.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";

export function handleNotification(
  input: {
    state: DirectLspRuntimeState;
    expectedEpoch: number;
  },
  message: Record<string, unknown>,
): void {
  const method = message.method as string;
  if (!PERMITTED_NOTIFICATIONS.has(method)) {
    fail({
      state: input.state,
      code: "backend_failed",
      restart: false,
      expectedEpoch: input.expectedEpoch,
    });
    return;
  }
  input.state.recordEvent("backend_notification");
}
