const repository = "https://github.com/TychoHenzen/dod-guard.git";

const EXPECTED_CODEX = {
  pluginId: "dod-guard@dod-guard-monorepo",
  name: "dod-guard",
  marketplaceName: "dod-guard-monorepo",
};

export function summary(client, entry) {
  if (client === "codex") {
    return {
      pluginId: entry?.pluginId,
      name: entry?.name,
      marketplaceName: entry?.marketplaceName,
      version: entry?.version,
      installed: entry?.installed,
      enabled: entry?.enabled,
      sourcePath: entry?.source?.path,
      marketplaceSource: entry?.marketplaceSource,
    };
  }
  return { id: entry?.id, version: entry?.version, enabled: entry?.enabled, installPath: entry?.installPath };
}

export function isDodGuardEntry(client, entry) {
  if (client === "codex") {
    const id = typeof entry?.pluginId === "string" ? entry.pluginId : "";
    return entry?.name === "dod-guard" || id.split("@")[0] === "dod-guard";
  }
  const id = typeof entry?.id === "string" ? entry.id : "";
  return id.split("@")[0] === "dod-guard";
}

function marketplaceSourceIsExpected(source) {
  return source?.sourceType === "git" && source?.source === repository;
}

function codexIdentityIsExpected(entry) {
  return (
    Object.entries(EXPECTED_CODEX).every(([key, value]) => entry[key] === value) &&
    marketplaceSourceIsExpected(entry.marketplaceSource)
  );
}

export function identityIsExpected(client, entry) {
  if (client === "codex") return codexIdentityIsExpected(entry);
  return entry.id === "dod-guard@dod-guard";
}

export function expectedIdentity(client) {
  if (client === "codex") {
    return { ...EXPECTED_CODEX, marketplaceSource: { sourceType: "git", source: repository } };
  }
  return { id: "dod-guard@dod-guard" };
}
