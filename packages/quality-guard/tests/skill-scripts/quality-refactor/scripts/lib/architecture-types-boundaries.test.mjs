import assert from "node:assert/strict";
import { test } from "node:test";
import { extractArchitectureFacts } from "../../../../../skills/quality-refactor/scripts/lib/architecture-facts.mjs";

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
