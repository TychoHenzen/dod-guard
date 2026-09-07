import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import * as native from "../../freshness/workspace-native.js";

it(
  "hashes project files concurrently without traversing " +
    "dependency or VCS directories",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "code-explorer-freshness-"));
    try {
      for (const directory of ["src", "node_modules", ".git"])
        mkdirSync(join(root, directory));
      writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
      writeFileSync(join(root, "src", "b.ts"), "export const b = 2;\n");
      writeFileSync(join(root, "node_modules", "ignored.ts"), "ignored\n");
      writeFileSync(join(root, ".git", "ignored.ts"), "ignored\n");
      const waiting: Array<() => void> = [];
      const freshness = native.createNativeWorkspaceFreshness({
        root,
        supported: (path) => path.endsWith(".ts"),
        sleep: () => new Promise<void>((resolve) => waiting.push(resolve)),
      });
      const result = freshness.reconcile();
      await waitForSamples(waiting, 2);
      assert.equal(waiting.length, 2);
      for (const resolve of waiting) resolve();
      await waitForSamples(waiting, 4);
      assert.equal(waiting.length, 4);
      for (const resolve of waiting.slice(2)) resolve();
      await result;
      assert.equal(freshness.status().state, "ready");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

async function waitForSamples(waiting: Array<() => void>, count: number) {
  for (let attempt = 0; attempt < 1000 && waiting.length < count; attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 1));
}
