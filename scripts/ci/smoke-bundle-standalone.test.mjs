import { strictEqual } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { buildUnbundledBundle } from "./fixtures/standalone-unbundled.mjs";
import { discoverBundles, runBundles } from "./smoke-bundle-standalone.mjs";

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("smoke-bundle-standalone", () => {
  it("passes real bundles and fails an unbundled dependency fixture", async () => {
    const realCode = await runBundles(await discoverBundles());
    strictEqual(realCode, 0, "real packaged bundles must pass the standalone gate");

    const fixtureRoot = mkdtempSync(join(tmpdir(), "standalone-fixture-"));
    temps.push(fixtureRoot);
    const fixtureCode = await runBundles([buildUnbundledBundle(fixtureRoot)]);
    strictEqual(fixtureCode, 1, "an unbundled dependency must fail the standalone gate");
  });
});
