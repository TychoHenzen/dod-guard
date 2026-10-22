import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyPreflightHelper } from "./preflight-fixture.mjs";

// A throwaway registered plugin root (the released version) plus a separate loaded root holding
// the real preflight helper and the previous release, so neither the inventory-status rule nor
// the registered-root rule under test is re-implemented in the PowerShell stub.
export async function createRealHelperFixture(t) {
  const parent = await mkdtemp(join(tmpdir(), "dod-guard-release-helper-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "registered");
  const loaded = join(parent, "loaded");
  const scriptsDirectory = join(loaded, "skills", "publish", "scripts");
  const helper = join(scriptsDirectory, "preflight-installation.mjs");
  const manifest = JSON.stringify({ name: "dod-guard", version: "5.4.56" });
  await mkdir(scriptsDirectory, { recursive: true });
  await mkdir(join(loaded, ".claude-plugin"), { recursive: true });
  const previous = JSON.stringify({ name: "dod-guard", version: "5.4.55" });
  await writeFile(join(loaded, ".claude-plugin", "plugin.json"), previous);
  await mkdir(join(root, "skills", "publish"), { recursive: true });
  await mkdir(join(root, ".codex-plugin"), { recursive: true });
  await mkdir(join(root, ".claude-plugin"), { recursive: true });
  await copyPreflightHelper(scriptsDirectory);
  await Promise.all([
    writeFile(join(root, "skills", "publish", "SKILL.md"), "# publish fixture\n"),
    writeFile(join(root, ".codex-plugin", "plugin.json"), manifest),
    writeFile(join(root, ".claude-plugin", "plugin.json"), manifest),
  ]);
  return { root, helper };
}
