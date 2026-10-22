import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { registryFor } from "./preflight-registry.mjs";

async function linkExternalManifest(fixture) {
  const externalDirectory = join(fixture.pluginRoot, "..", "external-manifest");
  const manifestDirectory = dirname(fixture.manifestPath);
  await mkdir(externalDirectory);
  await writeFile(join(externalDirectory, "plugin.json"), JSON.stringify({ name: "dod-guard", version: "5.4.56" }));
  await rm(manifestDirectory, { recursive: true });
  await symlink(externalDirectory, manifestDirectory, "junction");
}

async function replaceSkillWithDirectory(fixture) {
  await rm(fixture.skillFile);
  await mkdir(fixture.skillFile);
}

export const INSTALL_CASES = [
  { name: "manifest invalid JSON", setup: (fixture) => writeFile(fixture.manifestPath, "{") },
  {
    name: "manifest wrong name",
    setup: (fixture) => writeFile(fixture.manifestPath, JSON.stringify({ name: "other-plugin", version: "5.4.56" })),
  },
  {
    name: "manifest wrong version",
    setup: (fixture) => writeFile(fixture.manifestPath, JSON.stringify({ name: "dod-guard", version: "5.4.57" })),
  },
  { name: "manifest outside the plugin root", setup: linkExternalManifest },
  { name: "publish skill missing", setup: (fixture) => rm(fixture.skillFile) },
  { name: "publish skill is a directory", setup: replaceSkillWithDirectory },
  { name: "version pin stale", pins: ["--version", "5.4.55"] },
  {
    name: "path pin stale",
    pins: (fixture) => ["--skill-path", resolve(fixture.pluginRoot, "old", "skills", "publish", "SKILL.md")],
  },
  { name: "path pin not absolute", pins: ["--skill-path", "SKILL.md"] },
  {
    name: "registered root missing",
    pins: ["--registered-root"],
    registry: (fixture) => registryFor(fixture.client, join(fixture.pluginRoot, "..", "missing")),
  },
];
