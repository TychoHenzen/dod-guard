import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const CLIENTS = ["codex", "claude"];

const MANIFEST_DIRECTORY = { codex: ".codex-plugin", claude: ".claude-plugin" };

const COPIED_ENTRIES = [
  // Every file the helper imports at run time. The helper derives its plugin root
  // from where it sits, so a fixture must hold a full copy of each one.
  "preflight-installation.mjs",
  "preflight-arguments.mjs",
  "preflight",
];

const sourceDirectory = fileURLToPath(new URL("../", import.meta.url));
const SHARED_READER = fileURLToPath(new URL("../../../../lib/read-text.mjs", import.meta.url));

export async function copyPreflightHelper(destinationDirectory) {
  for (const name of COPIED_ENTRIES) {
    await cp(join(sourceDirectory, name), join(destinationDirectory, name), { recursive: true });
  }
  // registry-input.mjs imports the shared reader from <plugin root>/lib, three levels above scripts/.
  const libDirectory = join(destinationDirectory, "..", "..", "..", "lib");
  await mkdir(libDirectory, { recursive: true });
  await cp(SHARED_READER, join(libDirectory, "read-text.mjs"));
}

export async function createInstall(t, client) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "dod-guard-publish-preflight-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  const pluginRoot = join(temporaryRoot, "plugin");
  const scriptsDirectory = join(pluginRoot, "skills", "publish", "scripts");
  const helperPath = join(scriptsDirectory, "preflight-installation.mjs");
  const skillFile = join(pluginRoot, "skills", "publish", "SKILL.md");
  const manifestPath = join(pluginRoot, MANIFEST_DIRECTORY[client], "plugin.json");
  await mkdir(scriptsDirectory, { recursive: true });
  await mkdir(join(pluginRoot, MANIFEST_DIRECTORY[client]), { recursive: true });
  await copyPreflightHelper(scriptsDirectory);
  await writeFile(skillFile, "# publish fixture\n");
  await writeFile(manifestPath, JSON.stringify({ name: "dod-guard", version: "5.4.56" }));
  return { client, pluginRoot, helperPath, skillFile, manifestPath };
}

export function runPreflight(fixture, registry, options = {}) {
  const { pins = [], rawInput } = options;
  const result = spawnSync(process.execPath, [fixture.helperPath, fixture.client, ...pins], {
    input: rawInput ?? JSON.stringify(registry),
    encoding: "utf8",
  });
  const output = result.status === 0 ? result.stdout : result.stderr;
  return { ...result, response: JSON.parse(output) };
}

export function assertRejected(result, reason, message = "preflight should reject this input") {
  assert.equal(result.status, 1, message);
  assert.equal(result.response.ok, false);
  assert.match(result.response.reason, reason, message);
  assert.match(result.response.nextStep, /Refresh or correct this client installation/);
}
