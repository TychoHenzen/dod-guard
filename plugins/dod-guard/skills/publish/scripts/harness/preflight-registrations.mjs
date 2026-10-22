import { join } from "node:path";
import { registryFor, wrapRegistry } from "./preflight-registry.mjs";

const IDENTITY_REASON = /expected plugin and marketplace identity/;
const CODEX_PLUGIN_ID = "dod-guard@dod-guard-monorepo";

const WRONG_MARKETPLACE = {
  codex: { marketplaceName: "other-marketplace" },
  claude: { id: "dod-guard@other-marketplace" },
};

const ENTRIES = {
  codex: (registry) => registry.installed,
  claude: (registry) => registry,
};

const CODEX_IDENTITY_VARIANTS = [
  { name: "wrong plugin id", overrides: { pluginId: "dod-guard@other-marketplace" } },
  { name: "wrong plugin name", overrides: { name: "other-plugin" } },
  {
    name: "wrong marketplace source",
    overrides: { marketplaceSource: { source: "https://example.com/dod-guard.git" } },
  },
];

function commonCases(client, pluginRoot) {
  const [entry] = ENTRIES[client](registryFor(client, pluginRoot));
  return [
    { name: "missing registration", registry: wrapRegistry(client, []), reason: /found 0/ },
    {
      name: "ambiguous enabled registrations",
      registry: wrapRegistry(client, [entry, structuredClone(entry)]),
      reason: /found 2/,
    },
    { name: "disabled registration", registry: registryFor(client, pluginRoot, { enabled: false }), reason: /found 0/ },
    {
      name: "wrong marketplace identity",
      registry: registryFor(client, pluginRoot, WRONG_MARKETPLACE[client]),
      reason: IDENTITY_REASON,
    },
  ];
}

function claudeCases(pluginRoot) {
  return [
    {
      name: "registration path differs from loaded skill",
      registry: registryFor("claude", join(pluginRoot, "..")),
      reason: /loaded publish skill is not from the registered/,
    },
  ];
}

function codexCases(pluginRoot) {
  const identityCases = CODEX_IDENTITY_VARIANTS.map(({ name, overrides }) => ({
    name,
    registry: registryFor("codex", pluginRoot, overrides),
    reason: IDENTITY_REASON,
    expectedPluginId: CODEX_PLUGIN_ID,
  }));
  return [
    {
      name: "uninstalled registration",
      registry: registryFor("codex", pluginRoot, { installed: false }),
      reason: /found 0/,
    },
    ...identityCases,
  ];
}

const CLIENT_CASES = { codex: codexCases, claude: claudeCases };

export function registrationCases(client, pluginRoot) {
  return [...commonCases(client, pluginRoot), ...CLIENT_CASES[client](pluginRoot)];
}
