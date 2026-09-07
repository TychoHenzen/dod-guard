import assert from "node:assert/strict";
import { it } from "node:test";
import { assertHelperOracle, loadFixture } from "../testing/language-fixture-oracle-support.js";

it("keeps the Rust helper definition and call hierarchy ranges", async () => {
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

it("keeps the Python helper definition and call hierarchy ranges", async () => {
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

it("keeps the C# Helper definition and call hierarchy ranges exactly", async () => {
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
