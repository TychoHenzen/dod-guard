import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const sourceHelper = fileURLToPath(new URL("./preflight-installation.mjs", import.meta.url));
const sourceArguments = fileURLToPath(new URL("./preflight-arguments.mjs", import.meta.url));
const loadedVersion = "5.4.56";
const releasedVersion = "5.4.57";
const manifestDirectory = { codex: ".codex-plugin", claude: ".claude-plugin" };

async function createRoot(parent, name, client, version) {
  const root = join(parent, name);
  await mkdir(join(root, "skills", "publish", "scripts"), { recursive: true });
  await mkdir(join(root, manifestDirectory[client]), { recursive: true });
  await writeFile(join(root, "skills", "publish", "SKILL.md"), "# publish fixture\n");
  await writeFile(join(root, manifestDirectory[client], "plugin.json"), JSON.stringify({ name: "dod-guard", version }));
  return root;
}

// The loaded root holds the helper and the previous release; the registered root holds the new one.
async function createReleaseFixture(t, client) {
  const parent = await mkdtemp(join(tmpdir(), "dod-guard-registered-root-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const loadedRoot = await createRoot(parent, "loaded", client, loadedVersion);
  const registeredRoot = await createRoot(parent, "registered", client, releasedVersion);
  const helperPath = join(loadedRoot, "skills", "publish", "scripts", "preflight-installation.mjs");
  await copyFile(sourceHelper, helperPath);
  await copyFile(sourceArguments, join(dirname(helperPath), "preflight-arguments.mjs"));
  return { parent, loadedRoot, registeredRoot, helperPath };
}

function registryFor(client, root, overrides = {}) {
  if (client === "codex") {
    return {
      installed: [
        {
          pluginId: "dod-guard@dod-guard-monorepo",
          name: "dod-guard",
          marketplaceName: "dod-guard-monorepo",
          version: releasedVersion,
          installed: true,
          enabled: true,
          source: { source: "local", path: root },
          marketplaceSource: { sourceType: "git", source: "https://github.com/TychoHenzen/dod-guard.git" },
          ...overrides,
        },
      ],
    };
  }
  return [{ id: "dod-guard@dod-guard", version: releasedVersion, enabled: true, installPath: root, ...overrides }];
}

function run(fixture, client, registry, options = ["--registered-root"]) {
  const result = spawnSync(process.execPath, [fixture.helperPath, client, ...options], {
    input: JSON.stringify(registry),
    encoding: "utf8",
  });
  return { ...result, response: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
}

function assertRejected(result, reason, label) {
  assert.equal(result.status, 1, label);
  assert.equal(result.response.ok, false, label);
  assert.match(result.response.reason, reason, label);
}

test("post-release mode verifies the registered root, not the loaded one", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createReleaseFixture(t, client);
    const result = run(fixture, client, registryFor(client, fixture.registeredRoot));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.response.ok, true);
    assert.equal(result.response.version, releasedVersion);
    assert.equal(result.response.pluginRoot, await realpath(fixture.registeredRoot));
    assert.equal(result.response.skillPath, await realpath(join(fixture.registeredRoot, "skills/publish/SKILL.md")));
    assert.equal(result.response.requested.registeredRoot, true);
  }
});

test("without the option the loaded root is still judged against the registration", async (t) => {
  const claude = await createReleaseFixture(t, "claude");
  const mismatch = run(claude, "claude", registryFor("claude", claude.registeredRoot), []);
  assertRejected(mismatch, /loaded publish skill is not from the registered dod-guard installation/, "claude");

  const codex = await createReleaseFixture(t, "codex");
  const stale = run(codex, "codex", registryFor("codex", codex.registeredRoot), []);
  assertRejected(stale, /manifest name or version disagrees with the registration/, "codex");
});

test("post-release mode fails closed on a missing or contradictory registered root", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createReleaseFixture(t, client);
    const manifest = join(fixture.registeredRoot, manifestDirectory[client], "plugin.json");
    const skill = join(fixture.registeredRoot, "skills/publish/SKILL.md");

    const missing = registryFor(client, join(fixture.parent, "absent"));
    assertRejected(run(fixture, client, missing), /registered plugin path is unavailable/, `${client} missing root`);

    await writeFile(manifest, JSON.stringify({ name: "dod-guard", version: loadedVersion }));
    const stale = run(fixture, client, registryFor(client, fixture.registeredRoot));
    assertRejected(stale, /manifest name or version disagrees/, `${client} stale manifest`);

    await writeFile(manifest, JSON.stringify({ name: "other", version: releasedVersion }));
    const renamed = run(fixture, client, registryFor(client, fixture.registeredRoot));
    assertRejected(renamed, /manifest name or version disagrees/, `${client} wrong name`);

    await writeFile(manifest, JSON.stringify({ name: "dod-guard", version: releasedVersion }));
    await rm(skill);
    const noSkill = run(fixture, client, registryFor(client, fixture.registeredRoot));
    assertRejected(noSkill, /missing its publish skill/, `${client} missing skill`);
  }
});

test("post-release mode fails closed on an unreadable publish skill", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createReleaseFixture(t, client);
    const skill = join(fixture.registeredRoot, "skills/publish/SKILL.md");
    await rm(skill);
    await mkdir(skill);

    const result = run(fixture, client, registryFor(client, fixture.registeredRoot));
    assertRejected(result, /publish skill is not a readable regular file/, client);
  }
});

test("post-release mode rejects a manifest that resolves outside the registered root", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createReleaseFixture(t, client);
    const external = await createRoot(fixture.parent, "external", client, releasedVersion);
    const directory = join(fixture.registeredRoot, manifestDirectory[client]);
    await rm(directory, { recursive: true });
    await symlink(join(external, manifestDirectory[client]), directory, "junction");

    const result = run(fixture, client, registryFor(client, fixture.registeredRoot));
    assertRejected(result, /manifest path resolves outside the registered plugin root/, client);
  }
});

test("post-release mode keeps the registration and identity checks", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createReleaseFixture(t, client);
    const valid = registryFor(client, fixture.registeredRoot);
    const entry = client === "codex" ? valid.installed[0] : valid[0];
    const wrapped = (entries) => (client === "codex" ? { installed: entries } : entries);
    const identity = client === "codex" ? { marketplaceName: "other" } : { id: "dod-guard@other" };
    const cases = [
      ["missing", wrapped([]), /found 0/],
      ["duplicate", wrapped([entry, structuredClone(entry)]), /found 2/],
      [
        "wrong identity",
        registryFor(client, fixture.registeredRoot, identity),
        /does not match the expected plugin and marketplace identity/,
      ],
    ];
    for (const [label, registry, reason] of cases) {
      assertRejected(run(fixture, client, registry), reason, `${client} ${label}`);
    }
  }
});

test("the registered-root option cannot be repeated", async (t) => {
  const fixture = await createReleaseFixture(t, "claude");
  const result = run(fixture, "claude", registryFor("claude", fixture.registeredRoot), [
    "--registered-root",
    "--registered-root",
  ]);
  assertRejected(result, /Invalid or duplicate argument: --registered-root/, "duplicate");
});
