import assert from "node:assert/strict";
import { chmod, copyFile, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const sourceHelper = fileURLToPath(new URL("./preflight-installation.mjs", import.meta.url));
const skillPath = new URL("../SKILL.md", import.meta.url);
const usagePath = new URL("../../../USAGE.md", import.meta.url);

async function createInstall(t, client) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "dod-guard-publish-preflight-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  const pluginRoot = join(temporaryRoot, "plugin");
  const helperPath = join(pluginRoot, "skills", "publish", "scripts", "preflight-installation.mjs");
  const skillFile = join(pluginRoot, "skills", "publish", "SKILL.md");
  const manifestPath = join(
    pluginRoot,
    client === "codex" ? ".codex-plugin" : ".claude-plugin",
    "plugin.json",
  );
  await Promise.all([
    mkdir(join(pluginRoot, "skills", "publish", "scripts"), { recursive: true }),
    mkdir(join(pluginRoot, client === "codex" ? ".codex-plugin" : ".claude-plugin"), {
      recursive: true,
    }),
  ]);
  await Promise.all([
    copyFile(sourceHelper, helperPath),
    writeFile(skillFile, "# publish fixture\n"),
    writeFile(manifestPath, JSON.stringify({ name: "dod-guard", version: "5.4.56" })),
  ]);
  return { pluginRoot, helperPath, skillFile, manifestPath };
}

function registryFor(client, pluginRoot, overrides = {}) {
  if (client === "codex") {
    const entry = {
      pluginId: "dod-guard@dod-guard-monorepo",
      name: "dod-guard",
      marketplaceName: "dod-guard-monorepo",
      version: "5.4.56",
      installed: true,
      enabled: true,
      source: { source: "local", path: pluginRoot },
      marketplaceSource: {
        sourceType: "git",
        source: "https://github.com/TychoHenzen/dod-guard.git",
      },
      ...overrides,
      source: { source: "local", path: pluginRoot, ...overrides.source },
      marketplaceSource: {
        sourceType: "git",
        source: "https://github.com/TychoHenzen/dod-guard.git",
        ...overrides.marketplaceSource,
      },
    };
    return { installed: [entry] };
  }

  return [
    {
      id: "dod-guard@dod-guard",
      version: "5.4.56",
      enabled: true,
      installPath: pluginRoot,
      ...overrides,
    },
  ];
}

function runPreflight(fixture, client, registry, pins = [], rawInput) {
  const result = spawnSync(
    process.execPath,
    [fixture.helperPath, client, ...pins],
    { input: rawInput ?? JSON.stringify(registry), encoding: "utf8" },
  );
  const output = result.status === 0 ? result.stdout : result.stderr;
  return { ...result, response: JSON.parse(output) };
}

function assertRejected(result, reason, message = "preflight should reject this input") {
  assert.equal(result.status, 1, message);
  assert.equal(result.response.ok, false);
  assert.match(result.response.reason, reason, message);
  assert.match(result.response.nextStep, /Refresh or correct this client installation/);
}

test("resolves and pins the exact Codex and Claude installations", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createInstall(t, client);
    const registry = registryFor(client, fixture.pluginRoot);
    const unpinned = runPreflight(fixture, client, registry);

    assert.equal(unpinned.status, 0, unpinned.stderr);
    assert.equal(unpinned.response.ok, true);
    assert.equal(unpinned.response.client, client);
    assert.equal(unpinned.response.version, "5.4.56");
    assert.equal(unpinned.response.pluginRoot, await realpath(fixture.pluginRoot));
    assert.equal(unpinned.response.skillPath, await realpath(fixture.skillFile));

    const pinned = runPreflight(fixture, client, registry, [
      "--version",
      "5.4.56",
      "--skill-path",
      fixture.skillFile,
    ]);
    assert.equal(pinned.status, 0, pinned.stderr);
    assert.equal(pinned.response.requested.version, "5.4.56");
    assert.equal(pinned.response.requested.path, fixture.skillFile);
  }
});

test("rejects absent, ambiguous, disabled, wrong-marketplace, and wrong-path registrations", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createInstall(t, client);
    const valid = registryFor(client, fixture.pluginRoot);
    const entry = client === "codex" ? valid.installed[0] : valid[0];
    const cases = [
      {
        name: "missing registration",
        registry: client === "codex" ? { installed: [] } : [],
        reason: /found 0/,
      },
      {
        name: "ambiguous enabled registrations",
        registry: client === "codex"
          ? { installed: [entry, structuredClone(entry)] }
          : [entry, structuredClone(entry)],
        reason: /found 2/,
      },
      {
        name: "disabled registration",
        registry: registryFor(client, fixture.pluginRoot, { enabled: false }),
        reason: /found 0/,
      },
      {
        name: "wrong marketplace identity",
        registry: registryFor(
          client,
          fixture.pluginRoot,
          client === "codex"
            ? { marketplaceName: "other-marketplace" }
            : { id: "dod-guard@other-marketplace" },
        ),
        reason: /expected plugin and marketplace identity/,
      },
    ];

    if (client === "claude") {
      cases.push({
        name: "registration path differs from loaded skill",
        registry: registryFor(client, join(fixture.pluginRoot, "..")),
        reason: /loaded publish skill is not from the registered/,
      });
    }

    for (const item of cases) {
      const result = runPreflight(fixture, client, item.registry);
      assertRejected(result, item.reason, `${client}: ${item.name}`);
    }

    if (client === "codex") {
      for (const changes of [
        { pluginId: "dod-guard@other-marketplace" },
        { name: "other-plugin" },
        { marketplaceSource: { source: "https://example.com/dod-guard.git" } },
      ]) {
        const result = runPreflight(fixture, client, registryFor(client, fixture.pluginRoot, changes));
        assertRejected(result, /expected plugin and marketplace identity/);
        assert.equal(result.response.observed.expectedIdentity.pluginId, "dod-guard@dod-guard-monorepo");
      }
    }
  }
});

test("Codex accepts a marketplace source path separate from the loaded plugin root", async (t) => {
  const fixture = await createInstall(t, "codex");
  const marketplaceRoot = join(fixture.pluginRoot, "..", "marketplace");
  await mkdir(marketplaceRoot);

  const result = runPreflight(fixture, "codex", registryFor("codex", marketplaceRoot));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.version, "5.4.56");
  assert.equal(result.response.pluginRoot, await realpath(fixture.pluginRoot));
  assert.equal(result.response.skillPath, await realpath(fixture.skillFile));
});

test("rejects malformed or contradictory manifests and missing publish skills", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createInstall(t, client);
    const registry = registryFor(client, fixture.pluginRoot);
    const originalManifest = await readFile(fixture.manifestPath, "utf8");

    await writeFile(fixture.manifestPath, "{");
    assertRejected(
      runPreflight(fixture, client, registry),
      /Installed plugin manifest could not be read as valid JSON/,
    );

    await writeFile(fixture.manifestPath, JSON.stringify({ name: "other-plugin", version: "5.4.56" }));
    assertRejected(
      runPreflight(fixture, client, registry),
      /manifest name or version disagrees/,
    );

    await writeFile(fixture.manifestPath, JSON.stringify({ name: "dod-guard", version: "5.4.57" }));
    assertRejected(
      runPreflight(fixture, client, registry),
      /manifest name or version disagrees/,
    );

    await writeFile(fixture.manifestPath, originalManifest);
    await rm(fixture.skillFile);
    assertRejected(runPreflight(fixture, client, registry), /missing its publish skill/);
  }
});

test("rejects manifests that resolve outside the registered installation", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createInstall(t, client);
    const externalDirectory = join(fixture.pluginRoot, "..", "external-manifest");
    const manifestDirectory = join(fixture.pluginRoot, client === "codex" ? ".codex-plugin" : ".claude-plugin");
    await mkdir(externalDirectory);
    await writeFile(join(externalDirectory, "plugin.json"), JSON.stringify({ name: "dod-guard", version: "5.4.56" }));
    await rm(manifestDirectory, { recursive: true });
    await symlink(externalDirectory, manifestDirectory, "junction");

    const result = runPreflight(fixture, client, registryFor(client, fixture.pluginRoot));
    assertRejected(result, /manifest path resolves outside the registered plugin root/);
  }
});

test("rejects a publish skill path that is not a readable regular file", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createInstall(t, client);
    await rm(fixture.skillFile);
    await mkdir(fixture.skillFile);

    const result = runPreflight(fixture, client, registryFor(client, fixture.pluginRoot));
    assertRejected(result, /not a readable regular file/);
  }
});

test("rejects an unreadable publish skill on POSIX", async (t) => {
  if (process.platform === "win32" || (typeof process.getuid === "function" && process.getuid() === 0)) {
    t.skip("POSIX permission bits are not enforced for this test process");
    return;
  }

  const fixture = await createInstall(t, "claude");
  await chmod(fixture.skillFile, 0);
  const result = runPreflight(fixture, "claude", registryFor("claude", fixture.pluginRoot));
  assertRejected(result, /not a readable regular file/);
});

test("reports stale pins and malformed inventories without changing the installation", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createInstall(t, client);
    const registry = registryFor(client, fixture.pluginRoot);
    const manifestBefore = await readFile(fixture.manifestPath, "utf8");
    const skillBefore = await readFile(fixture.skillFile, "utf8");

    const staleVersion = runPreflight(fixture, client, registry, ["--version", "5.4.55"]);
    assertRejected(staleVersion, /requested version does not exactly match/);
    assert.equal(staleVersion.response.requested.version, "5.4.55");
    assert.equal(staleVersion.response.observed.registry, "parsed");

    const stalePath = runPreflight(fixture, client, registry, [
      "--skill-path",
      resolve(fixture.pluginRoot, "old", "skills", "publish", "SKILL.md"),
    ]);
    assertRejected(stalePath, /requested path must exactly match/);
    assert.match(stalePath.response.observed.skillPath, /skills[\\/]publish[\\/]SKILL\.md$/i);

    const malformed = runPreflight(fixture, client, null, [], "{");
    assertRejected(malformed, /Registry input is missing or malformed/);
    assert.equal(malformed.response.observed.registry, "unavailable");
    assert.equal(malformed.response.observed.pluginIdentity, "unavailable");
    assertRejected(runPreflight(fixture, client, null, [], "{}"), /expected .* plugin list/);
    assert.equal(await readFile(fixture.manifestPath, "utf8"), manifestBefore);
    assert.equal(await readFile(fixture.skillFile, "utf8"), skillBefore);
  }
});

test("the skill blocks release work on preflight failure and documents exact caller pins", async () => {
  const [skill, usage] = await Promise.all([
    readFile(skillPath, "utf8"),
    readFile(usagePath, "utf8"),
  ]);
  const procedureOffset = skill.indexOf("## Procedure");
  const preflightOffset = skill.indexOf("## Installation identity preflight");
  const preflight = skill.slice(preflightOffset, procedureOffset);

  assert.ok(preflightOffset >= 0 && procedureOffset > preflightOffset);
  assert.match(preflight, /preflight-installation\.mjs/);
  assert.match(preflight, /If the helper exits non-zero[\s\S]+then stop/);
  assert.match(preflight, /Do not run the procedure or any Git,[\s\S]+client-cache mutation/);
  assert.match(preflight, /use the\s+returned `pluginRoot` for every later `<plugin-root>` path/);
  assert.match(usage, /version=<exact-version>/);
  assert.match(usage, /path=<absolute-path-to-skills\/publish\/SKILL\.md>/);
  assert.match(usage, /The path\s+pin is the skill file, not its plugin root/);
});
