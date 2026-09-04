// capability.mjs - read the dashboard-only fragment once, without retaining it in browser history.

const STORAGE_KEY = "openspec_dashboard_capability";

export function takeDashboardCapability(
  location = window.location,
  history = window.history,
  storage = window.sessionStorage,
) {
  const capability = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (/^[0-9a-f]{64}$/.test(capability)) {
    storage.setItem(STORAGE_KEY, capability);
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    return capability;
  }
  return storage.getItem(STORAGE_KEY) ?? "";
}
