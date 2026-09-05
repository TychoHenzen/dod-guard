// api.mjs - talk to the dashboard's own read-only API.

async function request(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new Error(data.code ?? data.error ?? res.statusText);
  return data;
}

let dashboardCapability = "";

export function setDashboardCapability(capability) {
  dashboardCapability = capability;
}

export async function refreshDashboardCapability() {
  const result = await request("/api/browser-capability", { cache: "no-store" });
  if (typeof result.capability !== "string" || !/^[0-9a-f]{64}$/.test(result.capability)) {
    throw new Error("invalid_dashboard_capability");
  }
  dashboardCapability = result.capability;
  return result.capability;
}

const post = (path, body) =>
  request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export const listProjects = () => request("/api/projects");
export const scanForProjects = () => post("/api/scan", {});
export const addProjects = (paths) => post("/api/projects", { add: paths });
export const removeProject = (path) => post("/api/projects", { remove: path });

export const getQuality = (id) => request(`/api/project/${id}/quality`);
export const refreshQuality = (id) => post(`/api/project/${id}/quality/refresh`, {});

async function postCodeExplorerLaunch({ index, registryRevision }) {
  return request(`/api/project/${index}/code-explorer`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-openspec-dashboard-capability": dashboardCapability,
    },
    body: JSON.stringify({ registry_revision: registryRevision }),
  });
}

export const launchCodeExplorer = async (snapshot) => {
  await refreshDashboardCapability();
  try {
    return await postCodeExplorerLaunch(snapshot);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_dashboard_capability") {
      await refreshDashboardCapability();
      return postCodeExplorerLaunch(snapshot);
    }
    throw error;
  }
};
