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

const DEFAULT_MARKETPLACE = "dod-guard";

function hasQualityGuardEntry(registry) {
  return (Array.isArray(registry) ? registry : []).some((entry) => String(entry?.id).startsWith("quality-guard@"));
}

// ASSUMPTION: quality-guard ships from the marketplace the dod-guard plugin came from, because both live in one
// repository. A list with no usable dod-guard entry falls back to the marketplace name the repository documents.
function marketplaceOf(registry) {
  const sibling = (Array.isArray(registry) ? registry : [])
    .map((entry) => String(entry?.id))
    .find((id) => id.startsWith("dod-guard@"));
  return sibling?.slice("dod-guard@".length) || DEFAULT_MARKETPLACE;
}

// A disabled install needs one enable command, and an absent one needs one install command. ASSUMPTION: only the
// Claude list is read for these, because no Codex enable or install command is verified.
function nextStepHint(client, registry) {
  if (client !== "claude") {
    return "";
  }
  const [first] = disabledClaudeIds(registry);
  if (first) {
    return `. It is installed but disabled; run: claude plugin enable ${first}`;
  }
  if (hasQualityGuardEntry(registry)) {
    return "";
  }
  return `. It is not installed; run: claude plugin install quality-guard@${marketplaceOf(registry)}`;
}

// The scanner ships in the quality-guard plugin; the client's own plugin list
// is the only trusted locator.
function scannerPath(client, registry) {
  const roots = (client === "codex" ? codexRoots(registry) : claudeRoots(registry)).filter(Boolean);
  if (roots.length !== 1) {
    const hint = roots.length === 0 ? nextStepHint(client, registry) : "";
    throw new Error(
      `Expected one enabled quality-guard plugin in the ${client} plugin list, found ${roots.length}${hint}`,
    );
  }
  return `${roots[0].replaceAll("\\", "/")}/${SCANNER}`;
}

export { scannerPath };
