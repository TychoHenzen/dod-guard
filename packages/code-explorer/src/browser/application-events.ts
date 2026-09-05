import type { BrowserReply } from "./browser-reply.js";
import { browserRequest } from "./browser-request.js";
import type { BrowserStorage } from "./session.js";

export function showActionError(error: unknown): void {
  showActionStatus(error instanceof Error ? error.message : "backend_unavailable");
}

export function showActionStatus(value: string): void {
  const status = document.querySelector<HTMLElement>('[data-area="status"]');
  if (status) status.textContent = value;
}

export function bindHistory(
  storage: BrowserStorage,
  navigate: (request: () => Promise<BrowserReply>) => Promise<void>,
): void {
  for (const operation of ["back", "forward"] as const) {
    document.querySelector<HTMLElement>(`[data-operation="${operation}"]`)?.addEventListener("click", () => {
      void navigate(() =>
        browserRequest(storage, "api/history", { request_id: crypto.randomUUID(), action: operation }),
      );
    });
  }
}

export function bindRefresh(storage: BrowserStorage): void {
  document.querySelector<HTMLElement>('[data-operation="refresh"]')?.addEventListener("click", async () => {
    try {
      const reply = await browserRequest(storage, "api/status", { action: "refresh", request_id: crypto.randomUUID() });
      const status = document.querySelector<HTMLElement>('[data-area="status"]');
      if (status) status.textContent = reply.state ?? "ready";
    } catch (error) {
      showActionError(error);
    }
  });
}
