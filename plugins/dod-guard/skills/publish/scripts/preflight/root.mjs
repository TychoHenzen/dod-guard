import { realpath } from "node:fs/promises";
import { normalize } from "node:path";
import { failure, installationObserved } from "./failure.mjs";
import { normalizedPath } from "./paths.mjs";

async function resolveLoadedRoot(ctx, installation) {
  try {
    return normalize(await realpath(ctx.scriptRoot));
  } catch (error) {
    return failure(
      ctx,
      `The loaded plugin path is unavailable: ${error.message}`,
      installationObserved(installation, { pluginRoot: ctx.scriptRoot, registeredRoot: installation.registeredRoot }),
    );
  }
}

async function resolveRegisteredRoot(ctx, installation, reportedRoot) {
  try {
    return normalize(await realpath(installation.registeredRoot));
  } catch (error) {
    return failure(
      ctx,
      `The registered plugin path is unavailable: ${error.message}`,
      installationObserved(installation, { pluginRoot: reportedRoot, registeredRoot: installation.registeredRoot }),
    );
  }
}

async function resolveLoadedPluginRoot(ctx, installation) {
  const loadedRoot = await resolveLoadedRoot(ctx, installation);
  if (typeof loadedRoot !== "string") return loadedRoot;

  if (ctx.client === "codex") return loadedRoot;

  const resolvedRegisteredRoot = await resolveRegisteredRoot(ctx, installation, loadedRoot);
  if (typeof resolvedRegisteredRoot !== "string") return resolvedRegisteredRoot;

  if (normalizedPath(loadedRoot) !== normalizedPath(resolvedRegisteredRoot)) {
    return failure(
      ctx,
      "The loaded publish skill is not from the registered dod-guard installation.",
      installationObserved(installation, { pluginRoot: loadedRoot, registeredRoot: resolvedRegisteredRoot }),
    );
  }
  return loadedRoot;
}

// Post-release verification judges the registration the client now reports, not the root this
// helper was loaded from, which still holds the previous release until the session reloads.
export function resolvePluginRoot(ctx, installation) {
  if (ctx.requested.registeredRoot) {
    return resolveRegisteredRoot(ctx, installation, installation.registeredRoot);
  }
  return resolveLoadedPluginRoot(ctx, installation);
}
