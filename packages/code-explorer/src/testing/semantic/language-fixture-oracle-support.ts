import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FixtureManifest } from "./language-fixture-support.js";
import { assertIdentityOracle } from "./language-fixture-oracle-identity.js";

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
type FixtureRange = FixtureManifest["symbols"]["entry"]["declaration"];

export async function loadFixture(
  language: FixtureManifest["language"],
): Promise<{ manifest: FixtureManifest; source: string }> {
  const fixtureRoot = resolve(packageRoot, "fixtures", language);
  const manifest = JSON.parse(
    await readFile(resolve(fixtureRoot, "semantic-oracle.json"), "utf8"),
  ) as FixtureManifest;
  const source = await readFile(
    resolve(fixtureRoot, manifest.source_file),
    "utf8",
  );
  return { manifest, source };
}

export function assertHelperOracle(input: {
  manifest: FixtureManifest;
  source: string;
}): void {
  const definition = input.manifest.relations.definition;
  const caller = input.manifest.relations.callers.callers[0];
  const callee = input.manifest.relations.callees.callees[0];
  assertDefinitionOracle(input.source, input.manifest, definition);
  assertCallSites({
    source: input.source,
    definition,
    caller,
    callee,
  });
  assertIdentityOracle(input.manifest, caller, callee);
  assert.ok(input.source.includes(input.manifest.symbols.helper.body));
  assert.ok(input.manifest.unavailable_relations.length > 0);
}

function rangeText(source: string, range: FixtureRange): string {
  const lines = source.split("\n");
  assert.equal(
    range.start.line,
    range.end.line,
    "fixture ranges must stay on one source line",
  );
  return (
    lines[range.start.line]?.slice(
      range.start.character,
      range.end.character,
    ) ?? ""
  );
}

function assertDefinitionOracle(
  source: string,
  manifest: FixtureManifest,
  definition: FixtureManifest["relations"]["definition"],
): void {
  assert.equal(
    rangeText(source, definition.from_call),
    manifest.symbols.helper.name,
  );
  assert.equal(
    rangeText(source, definition.target),
    manifest.symbols.helper.name,
  );
}

function assertCallSites(input: {
  source: string;
  definition: FixtureManifest["relations"]["definition"];
  caller: FixtureManifest["relations"]["callers"]["callers"][number];
  callee: FixtureManifest["relations"]["callees"]["callees"][number];
}): void {
  assert.equal(
    rangeText(input.source, input.caller.call_site),
    rangeText(input.source, input.definition.from_call),
  );
  assert.equal(
    rangeText(input.source, input.callee.call_site),
    rangeText(input.source, input.definition.from_call),
  );
}
