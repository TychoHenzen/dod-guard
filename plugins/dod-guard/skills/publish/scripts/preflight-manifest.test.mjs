import { chmod, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { CLIENTS, assertRejected, createInstall, runPreflight } from "./harness/preflight-fixture.mjs";
import { registryFor } from "./harness/preflight-registry.mjs";

test("rejects malformed or contradictory manifests and missing publish skills", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    const registry = registryFor(client, fixture.pluginRoot);
    const originalManifest = await readFile(fixture.manifestPath, "utf8");

    await writeFile(fixture.manifestPath, "{");
    assertRejected(runPreflight(fixture, registry), /Installed plugin manifest could not be read as valid JSON/);

    await writeFile(fixture.manifestPath, JSON.stringify({ name: "other-plugin", version: "5.4.56" }));
    assertRejected(runPreflight(fixture, registry), /manifest name or version disagrees/);

    await writeFile(fixture.manifestPath, JSON.stringify({ name: "dod-guard", version: "5.4.57" }));
    assertRejected(runPreflight(fixture, registry), /manifest name or version disagrees/);

    await writeFile(fixture.manifestPath, originalManifest);
    await rm(fixture.skillFile);
    assertRejected(runPreflight(fixture, registry), /missing its publish skill/);
  }
});

test("rejects manifests that resolve outside the registered installation", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    const externalDirectory = join(fixture.pluginRoot, "..", "external-manifest");
    const manifestDirectory = join(fixture.pluginRoot, client === "codex" ? ".codex-plugin" : ".claude-plugin");
    await mkdir(externalDirectory);
    await writeFile(join(externalDirectory, "plugin.json"), JSON.stringify({ name: "dod-guard", version: "5.4.56" }));
    await rm(manifestDirectory, { recursive: true });
    await symlink(externalDirectory, manifestDirectory, "junction");

    const result = runPreflight(fixture, registryFor(client, fixture.pluginRoot));
    assertRejected(result, /manifest path resolves outside the registered plugin root/);
  }
});

test("rejects a publish skill path that is not a readable regular file", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    await rm(fixture.skillFile);
    await mkdir(fixture.skillFile);

    const result = runPreflight(fixture, registryFor(client, fixture.pluginRoot));
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
  const result = runPreflight(fixture, registryFor("claude", fixture.pluginRoot));
  assertRejected(result, /not a readable regular file/);
});
