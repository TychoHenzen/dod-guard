import assert from "node:assert/strict";
import { test } from "node:test";
import { strip } from "./strip.mjs";

test("a Rust named format capture yields its identifier", () => {
  const { interpolations } = strip('let msg = format!("{count} items");', "rs");
  assert.deepEqual(interpolations, [{ name: "count", line: 1 }]);
});

test("a Rust positional format capture yields no identifier", () => {
  const { interpolations } = strip('let msg = format!("{}", total);', "rs");
  assert.deepEqual(interpolations, []);
});

test("a Rust format specifier is not a second identifier", () => {
  const { interpolations } = strip('let msg = format!("{ptr:p}");', "rs");
  assert.deepEqual(interpolations, [{ name: "ptr", line: 1 }]);
});

test("escaped Rust double braces are not captures", () => {
  const { interpolations } = strip(
    'let msg = format!("{{count}} items");',
    "rs",
  );
  assert.deepEqual(interpolations, []);
});

test("a C# interpolated string yields every identifier it reads", () => {
  const { interpolations } = strip(
    'var s = $"hello {who} from {_name}";',
    "cs",
  );
  assert.deepEqual(interpolations, [
    { name: "who", line: 1 },
    { name: "_name", line: 1 },
  ]);
});
