// src/browser/client.ts
var root = document.querySelector("#code-explorer");
if (root) {
  root.textContent = "Loading Code Explorer";
  root.setAttribute("data-state", "loading");
  void fetch("/api/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "status" })
  }).then(async (response) => ({ response, payload: await response.json() })).then(({ response, payload }) => {
    root.textContent = response.ok ? `Code Explorer: ${payload.state ?? "ready"}` : `Code Explorer: ${payload.code ?? "unavailable"}`;
    root.setAttribute("data-state", response.ok ? "ready" : "unavailable");
  }).catch(() => {
    root.textContent = "Code Explorer: workspace_unavailable";
    root.setAttribute("data-state", "unavailable");
  });
}
