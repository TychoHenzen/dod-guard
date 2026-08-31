import assert from "node:assert/strict";
import { test } from "node:test";
import { extractFactInventory } from "./facts.js";

test("extracts architecture facts in stable path order", () => {
  const inventory = extractFactInventory(
    [
      { path: "src/z.ts", content: "export class Z { run(): void {} }" },
      { path: "src/a.ts", content: "export class A { save(): void {} }" },
    ],
    [],
  );

  assert.deepEqual(
    inventory.files.map((file) => file.path),
    ["src/a.ts", "src/z.ts"],
  );
  assert.deepEqual(inventory.errors, []);
});

test("reports extraction errors for required malformed files", () => {
  const inventory = extractFactInventory(
    [{ path: "src/broken.ts", content: "export class Broken {" }],
    ["src/broken.ts"],
  );

  assert.deepEqual(inventory.files, []);
  assert.match(inventory.errors[0] ?? "", /src\/broken\.ts: cannot extract required architecture facts/);
});
