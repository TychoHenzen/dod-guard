// src/browser/session.ts
var BrowserSessionClient = class {
  constructor(options) {
    this.options = options;
  }
  options;
  async start() {
    const navigation = this.options.navigationType();
    if (!navigation) return { state: "browser_capability_unavailable" };
    const storedSession = this.options.storage.get("browser_session_id");
    const storedTab = this.options.storage.get("tab_instance_id");
    const restore = navigation === "reload" && !!storedSession && !!storedTab;
    if (!restore) this.options.storage.clear();
    const tabId = restore ? storedTab ?? this.options.randomId() : this.options.randomId();
    return this.options.lock(`code-explorer-tab:${tabId}`, async (available) => {
      if (!available) {
        if (!restore) return { state: "browser_capability_unavailable" };
        this.options.storage.clear();
        return this.create(this.options.randomId(), "browser_session_replaced");
      }
      if (restore) {
        const reply = await this.options.request(
          { action: "restore", tab_instance_id: tabId, document_start: "reload" },
          { "x-code-explorer-session": storedSession ?? "", "x-code-explorer-tab": tabId }
        );
        if (reply.state !== "browser_session_expired") return reply;
        return this.recoverExpired();
      }
      return this.create(tabId);
    });
  }
  async recoverExpired() {
    this.options.storage.clear();
    return this.create(this.options.randomId(), "browser_session_expired");
  }
  async create(tabId, prior) {
    const reply = await this.options.request(
      { action: "create", tab_instance_id: tabId, document_start: "new" },
      { "x-code-explorer-tab": tabId }
    );
    const sessionId = reply.data?.browser_session_id;
    if (sessionId) {
      this.options.storage.set("tab_instance_id", tabId);
      this.options.storage.set("browser_session_id", sessionId);
    }
    return prior ? { ...reply, state: prior } : reply;
  }
};

// src/browser/client.ts
var root = document.querySelector("#code-explorer");
if (root) {
  root.textContent = "Loading Code Explorer";
  root.setAttribute("data-state", "loading");
  const storage = {
    get: (key) => sessionStorage.getItem(key),
    set: (key, value) => sessionStorage.setItem(key, value),
    clear: () => {
      sessionStorage.removeItem("browser_session_id");
      sessionStorage.removeItem("tab_instance_id");
    }
  };
  const session = new BrowserSessionClient({
    storage,
    navigationType: () => performance.getEntriesByType("navigation")[0]?.type,
    lock: async (name, action) => await navigator.locks.request(name, { ifAvailable: true }, (lock) => action(lock !== null)),
    randomId: () => crypto.randomUUID(),
    request: async (body, headers) => {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      return response.ok ? payload : { ...payload, state: payload.code ?? "workspace_unavailable" };
    }
  });
  void session.start().then(async (started) => {
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
        "x-code-explorer-tab": tabId
      },
      body: JSON.stringify({ action: "status" })
    });
    return { ok: response.ok, payload: await response.json() };
  }).then(({ ok, payload }) => {
    root.textContent = ok ? `Code Explorer: ${payload.state ?? "ready"}` : `Code Explorer: ${payload.code ?? "unavailable"}`;
    root.setAttribute("data-state", ok ? "ready" : "unavailable");
  }).catch(() => {
    root.textContent = "Code Explorer: workspace_unavailable";
    root.setAttribute("data-state", "unavailable");
  });
}
