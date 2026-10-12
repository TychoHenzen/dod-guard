import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import chokidar from "chokidar";
import {
  chokidarOptionsFor,
  WorkspaceFreshness,
  type WorkspaceWatcher,
} from "../../../../src/freshness/workspace-freshness.js";

it("ignores node_modules writes in a real watcher but reports source writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-watch-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "node_modules", "p"), { recursive: true });
  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
  const watcher = chokidar.watch([root], chokidarOptionsFor([root]));
  const ready = once(watcher, "ready");
  let reconciliations = 0;
  const freshness = new WorkspaceFreshness({
    reconcile: async () => {
      reconciliations += 1;
      return { manifest: new Map<string, string>() };
    },
    createWatcher: () => watcher as unknown as WorkspaceWatcher,
  });
  try {
    await ready;
    await freshness.start();
    assert.equal(freshness.status().mode, "watching");
    await sleep(600);
    const baseline = reconciliations;
    writeFileSync(
      join(root, "node_modules", "p", "index.js"),
      "module.exports = 1;\n",
    );
    await sleep(1200);
    assert.equal(reconciliations, baseline);
    writeFileSync(join(root, "src", "b.ts"), "export const b = 2;\n");
    await waitUntil(() => reconciliations > baseline, 5000);
    assert.equal(reconciliations, baseline + 1);
    await sleep(600);
    assert.equal(reconciliations, baseline + 1);
  } finally {
    await freshness.close();
    rmSync(root, { recursive: true, force: true });
  }
});

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntil(
  condition: () => boolean,
  milliseconds: number,
): Promise<void> {
  for (let waited = 0; !condition() && waited < milliseconds; waited += 50)
    await sleep(50);
}
