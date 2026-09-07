import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, type TestContext } from "node:test";
import { readAssetFile } from "../../browser-server/router-asset-file.js";

async function assetFixture(t: TestContext) {
  const root = await fs.mkdtemp(join(tmpdir(), "explorer-asset-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const path = join(root, "asset.js");
  await fs.writeFile(path, "original asset");
  return { root, path };
}

it("reads the checked file even when its path is replaced", async (t) => {
  const { path } = await assetFixture(t);
  replaceAfterStat(t, path);

  assert.equal(await readAssetFile(path, false), "original asset");
  assert.equal(await fs.readFile(path, "utf8"), "replacement");
});

function replaceAfterStat(t: TestContext, path: string): void {
  const open = fs.open;
  t.mock.method(fs, "open", async () => {
    const file = await open(path, "r");
    const stat = file.stat.bind(file);
    t.mock.method(file, "stat", async () => {
      const checked = await stat();
      await fs.rename(path, `${path}.old`);
      await fs.writeFile(path, "replacement");
      return checked;
    });
    return file;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
}

it("returns no content for HEAD and rejects directories", async (t) => {
  const { root, path } = await assetFixture(t);
  assert.equal(await readAssetFile(path, true), "");
  assert.equal(await readAssetFile(root, false), undefined);
});
