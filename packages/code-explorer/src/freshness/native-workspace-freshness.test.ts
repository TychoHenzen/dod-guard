import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { reconcileNativeManifest } from "./workspace-freshness.js";

it("hashes project files concurrently without traversing dependency or VCS directories", async () => {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-freshness-"));
  try {
    for (const directory of ["src", "node_modules", ".git"]) mkdirSync(join(root, directory));
    writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "src", "b.ts"), "export const b = 2;\n");
    writeFileSync(join(root, "node_modules", "ignored.ts"), "ignored\n");
    writeFileSync(join(root, ".git", "ignored.ts"), "ignored\n");
    const waiting: Array<() => void> = [];
    const result = reconcileNativeManifest({
      root,
      supported: (path) => path.endsWith(".ts"),
      sleep: () => new Promise<void>((resolve) => waiting.push(resolve)),
    });
    for (let index = 0; index < 1_000 && waiting.length < 2; index += 1)
      await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(waiting.length, 2);
    for (const resolve of waiting) resolve();
    const manifest = await result;
    assert.ok("manifest" in manifest);
    if ("manifest" in manifest) assert.deepEqual([...manifest.manifest.keys()], ["src/a.ts", "src/b.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
