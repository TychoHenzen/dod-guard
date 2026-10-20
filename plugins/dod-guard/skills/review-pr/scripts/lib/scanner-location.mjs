const SCANNER = "skills/quality-refactor/scripts/quality-scan.mjs";

function claudeRoots(registry) {
  return (Array.isArray(registry) ? registry : [])
    .filter((entry) => String(entry.id).startsWith("quality-guard@") && entry.enabled)
    .map((entry) => entry.installPath);
}

function codexRoots(registry) {
  return (registry?.installed ?? [])
    .filter((entry) => String(entry.pluginId).startsWith("quality-guard@") && entry.enabled)
    .map((entry) => entry.source?.path);
}

function disabledClaudeIds(registry) {
  return (Array.isArray(registry) ? registry : [])
    .filter((entry) => String(entry.id).startsWith("quality-guard@") && !entry.enabled)
    .map((entry) => entry.id);
}

// An installed but disabled plugin needs one enable command, not a reinstall. ASSUMPTION: only the Claude
// list is read for it, because no Codex enable command is verified.
function enableHint(client, registry) {
  const [first] = client === "claude" ? disabledClaudeIds(registry) : [];
  return first ? `. It is installed but disabled; run: claude plugin enable ${first}` : "";
}

// The scanner ships in the quality-guard plugin; the client's own plugin list
// is the only trusted locator.
function scannerPath(client, registry) {
  const roots = (client === "codex" ? codexRoots(registry) : claudeRoots(registry)).filter(Boolean);
  if (roots.length !== 1) {
    const hint = roots.length === 0 ? enableHint(client, registry) : "";
    throw new Error(
      `Expected one enabled quality-guard plugin in the ${client} plugin list, found ${roots.length}${hint}`,
    );
  }
  return `${roots[0].replaceAll("\\", "/")}/${SCANNER}`;
}

export { scannerPath };
