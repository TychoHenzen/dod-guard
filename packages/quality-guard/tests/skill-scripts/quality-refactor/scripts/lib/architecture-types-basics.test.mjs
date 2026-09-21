import assert from "node:assert/strict";
import { test } from "node:test";
import { extractArchitectureFacts } from "../../../../../skills/quality-refactor/scripts/lib/architecture-facts.mjs";

test("C# positional records preserve members and following methods", () => {
  const result = extractArchitectureFacts({
    path: "records.cs",
    content:
      "public record User(string Name, int Age);\n" +
      "public record struct Point(int X, int Y);\n" +
      "public class Service { public void Run() { } }",
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.facts.types.map((type) => type.name),
    ["Point", "Service", "User"],
  );
  assert.deepEqual(
    result.facts.types
      .find((type) => type.name === "User")
      ?.members.map((member) => member.name),
    ["Age", "Name"],
  );
  assert.deepEqual(
    result.facts.types
      .find((type) => type.name === "Point")
      ?.members.map((member) => member.name),
    ["X", "Y"],
  );
  assert.deepEqual(
    result.facts.types.find((type) => type.name === "Service")?.members,
    [{ name: "Run", kind: "method", visibility: "public" }],
  );
});

test("C# type extraction resets after a malformed declaration", () => {
  const malformed = extractArchitectureFacts({
    path: "broken.cs",
    content: "public class Broken {",
  });
  const valid = extractArchitectureFacts({
    path: "valid.cs",
    content: "public record User(string Name);",
  });
  assert.equal(malformed.facts, null);
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.facts.types[0]?.name, "User");
});
