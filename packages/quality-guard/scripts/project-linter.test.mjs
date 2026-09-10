import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { rustFindings } from "./rust-linter.mjs";
import { runProjectLinter } from "./project-linter.mjs";
import {
  clippyLine,
  stubSpawn,
  tempCrate,
} from "./project-linter-fixtures.test.mjs";
test("a clippy error whose primary span names the edited file surfaces", () => {
  const root = tempCrate();
  const filePath = join(root, "src", "main.rs");
  const spawn = stubSpawn(clippyLine());

  const findings = rustFindings(filePath, root, spawn);

  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0], {
    line: 3,
    rule: "clippy::needless_return",
    message: "unneeded `return` statement",
  });
  rmSync(root, { recursive: true, force: true });
});
test("diagnostics for another file are dropped", () => {
  const root = tempCrate();
  const filePath = join(root, "src", "main.rs");
  const spawn = stubSpawn(
    clippyLine({
      spans: [{ file_name: "src/other.rs", line_start: 3, is_primary: true }],
    }),
  );

  const findings = rustFindings(filePath, root, spawn);

  assert.deepEqual(findings, []);
  rmSync(root, { recursive: true, force: true });
});
test("a warning-level diagnostic is dropped", () => {
  const root = tempCrate();
  const filePath = join(root, "src", "main.rs");
  const spawn = stubSpawn(clippyLine({ level: "warning" }));

  const findings = rustFindings(filePath, root, spawn);

  assert.deepEqual(findings, []);
  rmSync(root, { recursive: true, force: true });
});
