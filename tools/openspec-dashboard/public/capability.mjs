// capability.mjs - read the dashboard-only fragment once, without retaining it in browser history.

export function takeDashboardCapability(location = window.location, history = window.history) {
  const capability = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (/^[0-9a-f]{64}$/.test(capability)) history.replaceState(null, "", `${location.pathname}${location.search}`);
  return capability;
}
