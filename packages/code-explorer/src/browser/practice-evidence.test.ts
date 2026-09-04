import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

type Evidence = {
  schema_version: number;
  language: string;
  backend: { name: string; version: string };
  operation_states: Record<string, string>;
  expected_locations: Record<string, unknown>;
  actual_locations: Record<string, unknown>;
  generations: { start: number; final: number };
  elapsed_ms: number;
  error_code: string | null;
};

function evidence(language: string): Evidence {
  const path = fileURLToPath(new URL(`../../practice/evidence/${language}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Evidence;
}

function assertCompleted(language: string): void {
  const record = evidence(language);
  assert.equal(record.schema_version, 1);
  assert.equal(record.language, language);
  assert.equal(record.error_code, null);
  assert.ok(record.backend.name);
  assert.ok(record.backend.version);
  assert.deepEqual(record.actual_locations, record.expected_locations);
  assert.ok(record.generations.final > record.generations.start);
  assert.ok(record.elapsed_ms > 0 && record.elapsed_ms <= 90_000);
  for (const operation of [
    "session",
    "status",
    "search",
    "focus",
    "follow",
    "back",
    "forward",
    "saved_file",
    "reconciliation",
    "stale",
    "refocus",
    "refresh",
  ])
    assert.equal(typeof record.operation_states[operation], "string", operation);
  assert.equal(JSON.stringify(record).includes("code-explorer-browser-"), false);
}
it("records the completed live Rust browser workflow", () => {
  assertCompleted("rust");
});
it("records the completed live Python browser workflow", () => {
  assertCompleted("python");
});
it("records the completed live C# browser workflow", () => {
  assertCompleted("csharp");
});
