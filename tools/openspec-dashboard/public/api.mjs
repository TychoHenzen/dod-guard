// api.mjs - talk to the dashboard's own read-only API.

async function request(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

let dashboardCapability = "";

export function setDashboardCapability(capability) {
  dashboardCapability = capability;
}

const post = (path, body) =>
  request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const suffix = (refresh) => (refresh ? "?refresh=1" : "");

export const listProjects = () => request("/api/projects");
export const scanForProjects = () => post("/api/scan", {});
export const addProjects = (paths) => post("/api/projects", { add: paths });
export const removeProject = (path) => post("/api/projects", { remove: path });

export const getOverview = (id, refresh) => request(`/api/project/${id}/overview${suffix(refresh)}`);
export const getSpec = (id, specId) => request(`/api/project/${id}/spec/${encodeURIComponent(specId)}`);
export const getChange = (id, changeId) =>
  request(`/api/project/${id}/change/${encodeURIComponent(changeId)}`);

export const launchCodeExplorer = ({ index, registryRevision }) =>
  request(`/api/project/${index}/code-explorer`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-openspec-dashboard-capability": dashboardCapability,
    },
    body: JSON.stringify({ registry_revision: registryRevision }),
  });
