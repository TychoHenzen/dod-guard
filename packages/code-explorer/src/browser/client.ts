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
    .then(async (started) => {
      const browserSessionId = storage.get("browser_session_id");
      const tabId = storage.get("tab_instance_id");
      if (!(browserSessionId && tabId)) return { ok: false, payload: { code: started.state } };
      root.textContent = `Code Explorer: ${started.state}`;
      root.setAttribute("data-state", "ready");
      const response = await fetch("/api/status", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-code-explorer-session": browserSessionId,
          "x-code-explorer-tab": tabId,
        },
        body: JSON.stringify({ action: "status" }),
      });
      return { ok: response.ok, payload: (await response.json()) as { code?: string; state?: string } };
    })
    .then(({ ok, payload }) => {
      root.textContent = ok
        ? `Code Explorer: ${payload.state ?? "ready"}`
        : `Code Explorer: ${payload.code ?? "unavailable"}`;
      root.setAttribute("data-state", ok ? "ready" : "unavailable");
    })
    .catch(() => {
      root.textContent = "Code Explorer: workspace_unavailable";
      root.setAttribute("data-state", "unavailable");
    });
}
