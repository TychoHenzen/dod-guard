import { realpath } from "node:fs/promises";
import { normalize, resolve } from "node:path";
import { failure, installationObserved, orUnavailable } from "./failure.mjs";
import { isInside, readRegularFile } from "./paths.mjs";

const MANIFEST_DIRECTORY = { codex: ".codex-plugin", claude: ".claude-plugin" };

function manifestFailure(ctx, installation, details) {
  return failure(
    ctx,
    `Installed plugin manifest could not be read as valid JSON: ${details.error.message}`,
    installationObserved(installation, { pluginRoot: details.pluginRoot, manifestPath: details.manifestPath }),
  );
}

// A manifest that resolves outside its registered root is refused before it is read.
function insideRootOrFailure(ctx, installation, location) {
  if (isInside(location.pluginRoot, location.resolvedManifestPath)) return;
  return failure(
    ctx,
    "Installed plugin manifest path resolves outside the registered plugin root.",
    installationObserved(installation, {
      pluginRoot: location.pluginRoot,
      manifestPath: location.resolvedManifestPath,
    }),
  );
}

async function loadManifest(ctx, installation, pluginRoot) {
  const manifestPath = resolve(pluginRoot, `${MANIFEST_DIRECTORY[ctx.client]}/plugin.json`);
  let resolvedManifestPath;
  try {
    resolvedManifestPath = normalize(await realpath(manifestPath));
    const outside = insideRootOrFailure(ctx, installation, { pluginRoot, resolvedManifestPath });
    if (outside) return outside;
    const manifest = JSON.parse(await readRegularFile(resolvedManifestPath));
    return { manifest, resolvedManifestPath };
  } catch (error) {
    return manifestFailure(ctx, installation, {
      pluginRoot,
      manifestPath: resolvedManifestPath ?? manifestPath,
      error,
    });
  }
}

function validateManifest(ctx, installation, loadedManifest) {
  const { resolvedManifestPath } = loadedManifest;
  const { name, version } = loadedManifest.manifest ?? {};
  if (name === "dod-guard" && version === installation.version) {
    return { manifest: loadedManifest.manifest };
  }
  return failure(
    ctx,
    "The installed plugin manifest name or version disagrees with the registration.",
    installationObserved(installation, {
      manifestName: orUnavailable(name),
      manifestVersion: orUnavailable(version),
      manifestPath: resolvedManifestPath,
    }),
  );
}

export async function readManifest(ctx, installation, pluginRoot) {
  const loadedManifest = await loadManifest(ctx, installation, pluginRoot);
  if (loadedManifest.ok === false) return loadedManifest;
  return validateManifest(ctx, installation, loadedManifest);
}
