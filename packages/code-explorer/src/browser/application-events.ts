import { browserRequest } from "./browser-request.js";
import type { BrowserStorage } from "./session.js";

export function showActionError(error: unknown): void {
  showActionStatus(error instanceof Error ? error.message : "backend_unavailable");
}

export function showActionStatus(value: string): void {
  const status = document.querySelector<HTMLElement>('[data-area="status"]');
  if (status) status.textContent = value;
}

export function bindHistory(navigate: (action: "back" | "forward") => Promise<void>): void {
  for (const operation of ["back", "forward"] as const) {
    document.querySelector<HTMLElement>(`[data-operation="${operation}"]`)?.addEventListener("click", () => {
      void navigate(operation);
    });
  }
}

export function bindRefresh(storage: BrowserStorage, onSuccess?: () => void): void {
  document.querySelector<HTMLElement>('[data-operation="refresh"]')?.addEventListener("click", async () => {
    try {
      const reply = await browserRequest(storage, "api/status", { action: "refresh", request_id: crypto.randomUUID() });
      showActionStatus(reply.state ?? "ready");
      onSuccess?.();
    } catch (error) {
      showActionError(error);
    }
  });
}
