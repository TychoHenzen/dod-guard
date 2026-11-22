import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { copyPreflightHelper, MANIFEST_DIRECTORY, runPreflight } from "./preflight-fixture.mjs";
import { registryFor, wrapRegistry } from "./preflight-registry.mjs";

export const LOADED_VERSION = "5.4.56";
export const RELEASED_VERSION = "5.4.57";

const ENTRY_OF = {
  codex: (registry) => registry.installed[0],
  claude: (registry) => registry[0],
};

const IDENTITY_OF = {
  codex: { marketplaceName: "other" },
  claude: { id: "dod-guard@other" },
};

export async function createRoot(parent, name, spec) {
  const root = join(parent, name);
  await mkdir(join(root, "skills", "publish", "scripts"), { recursive: true });
  await mkdir(join(root, MANIFEST_DIRECTORY[spec.client]), { recursive: true });
  await writeFile(join(root, "skills", "publish", "SKILL.md"), "# publish fixture\n");
  await writeFile(
    join(root, MANIFEST_DIRECTORY[spec.client], "plugin.json"),
    JSON.stringify({ name: "dod-guard", version: spec.version }),
  );
  return root;
}

// The loaded root holds the helper and the previous release; the registered root holds the new one.
export async function createReleaseFixture(t, client) {
  const parent = await mkdtemp(join(tmpdir(), "dod-guard-registered-root-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const loadedRoot = await createRoot(parent, "loaded", { client, version: LOADED_VERSION });
  const registeredRoot = await createRoot(parent, "registered", { client, version: RELEASED_VERSION });
  const helperPath = join(loadedRoot, "skills", "publish", "scripts", "preflight-installation.mjs");
  await copyPreflightHelper(dirname(helperPath));
  return { client, parent, loadedRoot, registeredRoot, helperPath };
}

export function registeredRegistry(client, root, overrides = {}) {
  return registryFor(client, root, { version: RELEASED_VERSION, ...overrides });
}

export function runRegistered(fixture, registry, pins = ["--registered-root"]) {
  return runPreflight(fixture, registry, { pins });
}

export function identityCases(fixture) {
  const { client, registeredRoot } = fixture;
  const entry = ENTRY_OF[client](registeredRegistry(client, registeredRoot));
  return [
    ["missing", wrapRegistry(client, []), /found 0/],
    ["duplicate", wrapRegistry(client, [entry, structuredClone(entry)]), /found 2/],
    [
      "wrong identity",
      wrapRegistry(client, [{ ...entry, ...IDENTITY_OF[client] }]),
      /does not match the expected plugin and marketplace identity/,
    ],
  ];
}
