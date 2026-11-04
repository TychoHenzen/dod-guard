import assert from "node:assert/strict";
import { test } from "node:test";
import { csFile, scanViolations } from "./rules-file-fixtures.test.mjs";

test("a C# constructor is not stateless-method while an ordinary method is", () => {
  const code = [
    "public class Widget {",
    "    private int _x;",
    "    public Widget() {}",
    "    public int Helper() { return 1; }",
    "}",
  ].join("\n");
  const violations = scanViolations(csFile("src/Widget.cs", code)).filter(
    (violation) => violation.rule === "stateless-method",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /Helper/);
});
