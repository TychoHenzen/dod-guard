import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "./config.mjs";
import { csFile, rustFile } from "./rules-file-fixtures.test.mjs";
import { scanFile } from "./rules-file.mjs";

test(
  "a Rust function read only by an inline format capture is not unused",
  () => {
  const code = [
    'fn greeting() -> &\'static str { "hi" }',
    'fn show() { println!("{greeting}"); }',
  ].join("\n");
  const violations = scanFile(
    rustFile("src/lib.rs", code),
    buildConfig("default"),
  ).violations;
  assert.equal(
    violations.some(
      (violation) =>
        violation.rule === "unused-local" &&
        violation.message.includes("greeting"),
    ),
    false,
  );
});

test(
  "a C# method reading a field through interpolation is not stateless",
  () => {
  const code = [
    "public class Thing {",
    "    private readonly string _name;",
    "    public Thing(string name) { _name = name; }",
    '    public string Greet(string who) => $"hello {who} from {_name}";',
    "}",
  ].join("\n");
  const violations = scanFile(
    csFile("src/Thing.cs", code),
    buildConfig("default"),
  ).violations;
  assert.deepEqual(
    violations.filter((violation) => violation.rule === "stateless-method"),
    [],
  );
});
