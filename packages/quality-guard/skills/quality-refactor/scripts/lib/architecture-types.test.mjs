import assert from "node:assert/strict";
import { test } from "node:test";
import { extractArchitectureFacts } from "./architecture-facts.mjs";

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

test("C# positional record boundaries ignore comments and flexible whitespace", () => {
  const commented = extractArchitectureFacts({
    path: "commented.cs",
    content:
      "public record User(string Name) /* block comment */;\n" +
      "public record UserLine(string Name) // line comment\n;\n" +
      "public class Service { public void Run() { } }",
  });

  assert.deepEqual(commented.errors, []);
  assert.deepEqual(
    commented.facts.types.map((type) => type.name),
    ["Service", "User", "UserLine"],
  );
  assert.deepEqual(
    commented.facts.types
      .find((type) => type.name === "Service")
      ?.members.map((member) => member.name),
    ["Run"],
  );

  for (const declaration of [
    "public record\tstruct Point(int X, int Y);",
    "public record  struct Point(int X, int Y);",
    "public record\nstruct Point(int X, int Y);",
  ]) {
    const result = extractArchitectureFacts({
      path: "whitespace.cs",
      content: declaration,
    });
    assert.deepEqual(result.errors, [], declaration);
    assert.equal(result.facts.types[0]?.kind, "struct", declaration);
    assert.deepEqual(
      result.facts.types[0]?.members.map((member) => member.name),
      ["X", "Y"],
      declaration,
    );
  }
});

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
  assert.equal(braced.facts.types.find((type) => type.name === "Point")?.kind, "struct");
  assert.deepEqual(
    braced.facts.types.find((type) => type.name === "Point")?.members,
    [{ name: "Plot", kind: "method", visibility: "public" }],
  );
  assert.equal(braced.facts.types.find((type) => type.name === "User")?.kind, "record");
  assert.deepEqual(
    braced.facts.types.find((type) => type.name === "User")?.members,
    [{ name: "Run", kind: "method", visibility: "public" }],
  );

  const unclosed = extractArchitectureFacts({
    path: "unclosed.cs",
    content: "public record Broken(string Name)\n" +
      "public class Service { public void Run() { } }",
  });
  assert.deepEqual(unclosed.errors, [
    "cannot extract required architecture facts: Broken has no closed body",
  ]);
});

test("C# positional record tails preserve generic and default-value members", () => {
  const result = extractArchitectureFacts({
    path: "advanced-records.cs",
    content:
      "public record User<T>(Dictionary<string, int> Map) : Base<T> where T : class;\n" +
      "public record Config(string Value = \") ; {\", int Count);\n" +
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
