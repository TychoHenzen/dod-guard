const SCANNER = "skills/quality-refactor/scripts/quality-scan.mjs";

function claudeRoots(registry) {
  return (Array.isArray(registry) ? registry : [])
    .filter(
      (entry) => String(entry.id).startsWith("quality-guard@") && entry.enabled,
    )
    .map((entry) => entry.installPath);
}

function codexRoots(registry) {
  return (registry?.installed ?? [])
    .filter(
      (entry) =>
        String(entry.pluginId).startsWith("quality-guard@") && entry.enabled,
    )
    .map((entry) => entry.source?.path);
}

// The scanner ships in the quality-guard plugin; the client's own plugin list
// is the only trusted locator.
function scannerPath(client, registry) {
  const roots = (
    client === "codex" ? codexRoots(registry) : claudeRoots(registry)
  ).filter(Boolean);
  if (roots.length !== 1) {
    throw new Error(
      `Expected one enabled quality-guard plugin in the ${client} plugin list, found ${roots.length}`,
    );
  }
  return `${roots[0].replaceAll("\\", "/")}/${SCANNER}`;
}

export { scannerPath };
