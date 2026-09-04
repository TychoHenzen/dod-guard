import { startApplication } from "./application.js";
import { browserRequest, ownership } from "./browser-request.js";
import { BrowserSessionClient, type BrowserSessionReply, type BrowserStorage } from "./session.js";

const root = document.querySelector<HTMLDivElement>("#code-explorer");
if (root) {
  root.textContent = "Loading Code Explorer";
  root.setAttribute("data-state", "loading");
  const storage: BrowserStorage = {
    get: (key) => sessionStorage.getItem(key),
    set: (key, value) => sessionStorage.setItem(key, value),
    clear: () => {
      sessionStorage.removeItem("browser_session_id");
      sessionStorage.removeItem("tab_instance_id");
    },
  };
  const session = new BrowserSessionClient({
    storage,
    navigationType: () =>
      (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type,
    lock: async (name, action) =>
      await navigator.locks.request(name, { ifAvailable: true }, (lock) => action(lock !== null)),
    randomId: () => crypto.randomUUID(),
    request: async (body, headers) => {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as BrowserSessionReply & { code?: string };
      return response.ok ? payload : { ...payload, state: payload.code ?? "workspace_unavailable" };
    },
  });
  void session
    .start()
    .then((started) => {
      if (!ownership(storage)) throw new Error(started.state);
      root.textContent = `Code Explorer: ${started.state}`;
      root.setAttribute("data-state", "ready");
      void browserRequest(storage, "/api/status", { action: "status" }).catch(() => undefined);
      startApplication(storage, started.state, root);
    })
    .catch(() => {
      root.textContent = "Code Explorer: workspace_unavailable";
      root.setAttribute("data-state", "unavailable");
    });
}
