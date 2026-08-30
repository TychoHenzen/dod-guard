import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

type Position = { line: number; character: number };
type Range = { start: Position; end: Position };
type FixtureManifest = {
  schema_version: 1;
  language: "rust" | "python" | "csharp";
  source_file: string;
  symbols: {
    entry: { identity: string; name: string; declaration: Range };
    helper: { identity: string; name: string; declaration: Range; body: string };
  };
  relations: {
    definition: { from_call: Range; target: Range };
    callers: { target: string; callers: Array<{ identity: string; call_site: Range }> };
    callees: { source: string; callees: Array<{ identity: string; call_site: Range }> };
  };
  unavailable_relations: Array<{ relation: string; reason: string }>;
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function loadFixture(
  language: FixtureManifest["language"],
): Promise<{ manifest: FixtureManifest; source: string }> {
  const fixtureRoot = resolve(packageRoot, "fixtures", language);
  const manifest = JSON.parse(await readFile(resolve(fixtureRoot, "semantic-oracle.json"), "utf8")) as FixtureManifest;
  const source = await readFile(resolve(fixtureRoot, manifest.source_file), "utf8");
  return { manifest, source };
}

function rangeText(source: string, range: Range): string {
  const lines = source.split("\n");
  assert.equal(range.start.line, range.end.line, "fixture ranges must stay on one source line");
  return lines[range.start.line]?.slice(range.start.character, range.end.character) ?? "";
}

function assertHelperOracle({ manifest, source }: { manifest: FixtureManifest; source: string }): void {
  const definition = manifest.relations.definition;
  const caller = manifest.relations.callers.callers[0];
  const callee = manifest.relations.callees.callees[0];

  assert.equal(rangeText(source, definition.from_call), manifest.symbols.helper.name);
  assert.equal(rangeText(source, definition.target), manifest.symbols.helper.name);
  assert.equal(rangeText(source, caller.call_site), rangeText(source, definition.from_call));
  assert.equal(rangeText(source, callee.call_site), rangeText(source, definition.from_call));
  assert.equal(manifest.relations.callers.target, manifest.symbols.helper.identity);
  assert.equal(manifest.relations.callees.source, manifest.symbols.entry.identity);
  assert.equal(caller.identity, manifest.symbols.entry.identity);
  assert.equal(callee.identity, manifest.symbols.helper.identity);
  assert.ok(source.includes(manifest.symbols.helper.body));
  assert.ok(manifest.unavailable_relations.length > 0);
}

// covers: code-explorer/language-adapters :: Language fixtures define one exact semantic oracle :: Rust helper oracle
it("keeps the Rust helper definition and call hierarchy ranges exact", async () => {
  const fixture = await loadFixture("rust");
  assert.equal(fixture.manifest.source_file, "src/lib.rs");
  assert.deepEqual(fixture.manifest.relations.definition.from_call, {
    start: { line: 1, character: 4 },
    end: { line: 1, character: 10 },
  });
  assert.deepEqual(fixture.manifest.relations.definition.target, {
    start: { line: 4, character: 3 },
    end: { line: 4, character: 9 },
  });
  assertHelperOracle(fixture);
});

// covers: code-explorer/language-adapters :: Language fixtures define one exact semantic oracle :: Python helper oracle
it("keeps the Python helper definition and call hierarchy ranges exact", async () => {
  const fixture = await loadFixture("python");
  assert.equal(fixture.manifest.source_file, "src/sample.py");
  assert.deepEqual(fixture.manifest.relations.definition.from_call, {
    start: { line: 1, character: 4 },
    end: { line: 1, character: 10 },
  });
  assert.deepEqual(fixture.manifest.relations.definition.target, {
    start: { line: 3, character: 4 },
    end: { line: 3, character: 10 },
  });
  assertHelperOracle(fixture);
});

// covers: code-explorer/language-adapters :: Language fixtures define one exact semantic oracle :: C# helper oracle
it("keeps the C# Helper definition and call hierarchy ranges exact", async () => {
  const fixture = await loadFixture("csharp");
  assert.equal(fixture.manifest.source_file, "src/Demo.cs");
  assert.deepEqual(fixture.manifest.relations.definition.from_call, {
    start: { line: 1, character: 33 },
    end: { line: 1, character: 39 },
  });
  assert.deepEqual(fixture.manifest.relations.definition.target, {
    start: { line: 2, character: 24 },
    end: { line: 2, character: 30 },
  });
  assertHelperOracle(fixture);
});
