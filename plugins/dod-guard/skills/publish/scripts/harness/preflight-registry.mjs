const REPOSITORY_URL = "https://github.com/TychoHenzen/dod-guard.git";

function codexEntry(pluginRoot, overrides) {
  return {
    pluginId: "dod-guard@dod-guard-monorepo",
    name: "dod-guard",
    marketplaceName: "dod-guard-monorepo",
    version: "5.4.56",
    installed: true,
    enabled: true,
    ...overrides,
    source: { source: "local", path: pluginRoot, ...overrides.source },
    marketplaceSource: { sourceType: "git", source: REPOSITORY_URL, ...overrides.marketplaceSource },
  };
}

function claudeEntry(pluginRoot, overrides) {
  return { id: "dod-guard@dod-guard", version: "5.4.56", enabled: true, installPath: pluginRoot, ...overrides };
}

const BUILDERS = {
  codex: (pluginRoot, overrides) => ({ installed: [codexEntry(pluginRoot, overrides)] }),
  claude: (pluginRoot, overrides) => [claudeEntry(pluginRoot, overrides)],
};

const WRAPPERS = {
  codex: (entries) => ({ installed: entries }),
  claude: (entries) => entries,
};

export function registryFor(client, pluginRoot, overrides = {}) {
  return BUILDERS[client](pluginRoot, overrides);
}

export function wrapRegistry(client, entries) {
  return WRAPPERS[client](entries);
}
