// Compares the dod-guard version a run loaded with the version published on the default branch. Pure: the
// readers live in plugin-version-check.mjs. Versions are compared by number, because as text "5.4.61"
// sorts above "5.13.4" and that is the stale cache this check exists to catch.
const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/u;

// A prerelease or any other shape is refused rather than ranked, because the manifests hold plain x.y.z.
function parts(version) {
  const match = RELEASE.exec(String(version ?? ""));
  if (!match) {
    return null;
  }
  return match.slice(1).map(Number);
}

function firstDifference(loaded, latest) {
  return loaded.map((value, index) => value - latest[index]).find((delta) => delta !== 0) ?? 0;
}

function classifyVersions(installed, published) {
  const loaded = parts(installed);
  const latest = parts(published);
  if (!(loaded && latest)) {
    return "unreadable";
  }
  const delta = firstDifference(loaded, latest);
  if (delta === 0) {
    return "current";
  }
  if (delta < 0) {
    return "stale";
  }
  return "ahead";
}

const REFRESH = {
  claude: ["/plugin marketplace update dod-guard", "/reload-plugins"],
  codex: ["codex plugin marketplace upgrade dod-guard-monorepo", "codex plugin add dod-guard@dod-guard-monorepo"],
};

// These are shown to the user, never run: only the user refreshes a client's plugin cache.
function refreshCommands(client) {
  return REFRESH[client] ?? [];
}

export { classifyVersions, refreshCommands };
