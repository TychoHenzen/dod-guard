import { startApplication } from "./application.js";
import { browserRequest, ownership } from "./browser-request.js";
import { BrowserSessionClient } from "./session.js";
const root = document.querySelector("#code-explorer");
if (root) {
    root.textContent = "Loading Code Explorer";
    root.setAttribute("data-state", "loading");
    const storage = {
        get: (key) => sessionStorage.getItem(key),
        set: (key, value) => sessionStorage.setItem(key, value),
        clear: () => {
            sessionStorage.removeItem("browser_session_id");
            sessionStorage.removeItem("tab_instance_id");
        },
    };
    const session = new BrowserSessionClient({
        storage,
        navigationType: () => performance.getEntriesByType("navigation")[0]?.type,
        lock: async (name, action) => await navigator.locks.request(name, { ifAvailable: true }, (lock) => action(lock !== null)),
        randomId: () => crypto.randomUUID(),
        request: async (body, headers) => {
            const response = await fetch("api/session", {
                method: "POST",
                headers: { "content-type": "application/json", ...headers },
                body: JSON.stringify(body),
            });
            const payload = (await response.json());
            return response.ok ? payload : { ...payload, state: payload.code ?? "workspace_unavailable" };
        },
    });
    void session
        .start()
        .then((started) => {
        if (!ownership(storage))
            throw new Error(started.state);
        const visibleState = started.data?.root_access === "root_access_denied" ? "root_access_denied" : started.state;
        root.textContent = `Code Explorer: ${visibleState}`;
        root.setAttribute("data-state", visibleState === "root_access_denied" ? "unavailable" : "ready");
        void browserRequest(storage, "api/status", { action: "status" }).catch(() => undefined);
        startApplication(storage, visibleState, root);
    })
        .catch(() => {
        root.textContent = "Code Explorer: workspace_unavailable";
        root.setAttribute("data-state", "unavailable");
    });
}
//# sourceMappingURL=client.js.map