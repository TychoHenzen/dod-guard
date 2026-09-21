import assert from "node:assert/strict";
import { test } from "node:test";
import { extractArchitectureFacts } from "../../../../../skills/quality-refactor/scripts/lib/architecture-facts.mjs";

test("C# positional record tails preserve generic and default-value members", () => {
  const result = extractArchitectureFacts({
    path: "advanced-records.cs",
    content:
      "public record User<T>(Dictionary<string, int> Map) : Base<T> where T : class;\n" +
      'public record Config(string Value = ") ; {", int Count);\n' +
      "public class Service { public void Run() { } }",
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.facts.types.map((type) => type.name),
    ["Config", "Service", "User"],
  );
  assert.deepEqual(
    result.facts.types
      .find((type) => type.name === "User")
      ?.members.map((member) => member.name),
    ["Map"],
  );
  assert.deepEqual(
    result.facts.types
      .find((type) => type.name === "Config")
      ?.members.map((member) => member.name),
    ["Count", "Value"],
  );
  assert.deepEqual(
    result.facts.types.find((type) => type.name === "Service")?.members,
    [{ name: "Run", kind: "method", visibility: "public" }],
  );
});

test("C# positional record fields preserve tuple types", () => {
  const result = extractArchitectureFacts({
    path: "tuple-records.cs",
    content:
      "public record Nested(Dictionary<string, List<(int, int)>> Map, " +
      "Func<(int, int), T> Fn);",
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.facts.types[0]?.members.map((member) => member.name),
    ["Fn", "Map"],
  );
});

test("C# positional record defaults ignore comparison and lambda operators", () => {
  const result = extractArchitectureFacts({
    path: "operators.cs",
    content:
      "public record Operators(int Count = 1 > 0, int Shift = 1 >> 2, " +
      "bool Valid = value < limit && (x => x) != null, string Name);",
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.facts.types[0]?.members.map((member) => member.name),
    ["Count", "Name", "Shift", "Valid"],
  );
});
