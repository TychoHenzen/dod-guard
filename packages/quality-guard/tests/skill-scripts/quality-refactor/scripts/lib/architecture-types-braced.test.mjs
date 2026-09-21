import assert from "node:assert/strict";
import { test } from "node:test";
import { extractArchitectureFacts } from "../../../../../skills/quality-refactor/scripts/lib/architecture-facts.mjs";

test("C# positional record parsing preserves malformed and braced behavior", () => {
  const malformed = extractArchitectureFacts({
    path: "malformed.cs",
    content: "public record Broken(string Name;",
  });
  const braced = extractArchitectureFacts({
    path: "braced.cs",
    content:
      "public record User(string Name) { public void Run() { } }\n" +
      "public record struct Point(int X, int Y) { public void Plot() { } }",
  });
  assert.deepEqual(malformed.errors, [
    "cannot extract required architecture facts: Broken has no closed body",
  ]);
  assert.deepEqual(braced.errors, []);
  assert.deepEqual(
    braced.facts.types.map((type) => type.name),
    ["Point", "User"],
  );
  assert.equal(
    braced.facts.types.find((type) => type.name === "Point")?.kind,
    "struct",
  );
  assert.deepEqual(
    braced.facts.types.find((type) => type.name === "Point")?.members,
    [{ name: "Plot", kind: "method", visibility: "public" }],
  );
  assert.equal(
    braced.facts.types.find((type) => type.name === "User")?.kind,
    "record",
  );
  assert.deepEqual(
    braced.facts.types.find((type) => type.name === "User")?.members,
    [{ name: "Run", kind: "method", visibility: "public" }],
  );
  const unclosed = extractArchitectureFacts({
    path: "unclosed.cs",
    content:
      "public record Broken(string Name)\n" +
      "public class Service { public void Run() { } }",
  });
  assert.deepEqual(unclosed.errors, [
    "cannot extract required architecture facts: Broken has no closed body",
  ]);
});
