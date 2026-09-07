import assert from "node:assert/strict";
import type { FixtureManifest } from "./language-fixture-support.js";

export function assertIdentityOracle(
  manifest: FixtureManifest,
  caller: FixtureManifest["relations"]["callers"]["callers"][number],
  callee: FixtureManifest["relations"]["callees"]["callees"][number],
): void {
  assert.equal(manifest.relations.callers.target, manifest.symbols.helper.identity);
  assert.equal(manifest.relations.callees.source, manifest.symbols.entry.identity);
  assert.equal(caller.identity, manifest.symbols.entry.identity);
  assert.equal(callee.identity, manifest.symbols.helper.identity);
}
