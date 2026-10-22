// Every helper reports failures through this shape so the golden snapshot keeps one key order.
export function failure(ctx, reason, observed = {}) {
  return {
    ok: false,
    client: ctx.client,
    requested: ctx.requested,
    observed: {
      registry: "parsed",
      pluginIdentity: "unavailable",
      version: "unavailable",
      pluginRoot: "unavailable",
      skillPath: "unavailable",
      ...observed,
    },
    reason,
    nextStep:
      "Refresh or correct this client installation and rerun /dod-guard:publish; do not use another cache or checkout.",
  };
}

// Most failures after identity selection report the same two keys first, in this order.
export function installationObserved(installation, extra = {}) {
  return { pluginIdentity: installation.identity, version: installation.version, ...extra };
}

export function orUnavailable(value) {
  return value ?? "unavailable";
}
