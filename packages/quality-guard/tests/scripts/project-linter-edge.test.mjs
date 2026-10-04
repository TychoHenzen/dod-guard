import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { rustFindings } from "../../scripts/rust-linter.mjs";
import { runProjectLinter } from "../../scripts/project-linter.mjs";
import { tempCrate } from "./project-linter-fixtures.test.mjs";

test("a timeout reports unavailable linter evidence", () => {
  const root = tempCrate();
  const filePath = join(root, "src", "main.rs");
  const spawn = () => {
    const error = new Error("ETIMEDOUT");
    error.code = "ETIMEDOUT";
    return { error, signal: "SIGTERM", stdout: "" };
  };

  assert.doesNotThrow(() => {
    const result = rustFindings(filePath, root, spawn);
    assert.deepEqual(result.findings, []);
    assert.match(result.unavailable, /ETIMEDOUT/);
  });
  rmSync(root, { recursive: true, force: true });
});

test(
  "a repository with no Cargo.toml produces nothing, and cargo is never " +
    "invoked",
  () => {
    const root = mkdtempSync(join(tmpdir(), "qg-rust-"));
    const filePath = join(root, "src", "main.rs");
    const spawn = () => {
      throw new Error(
        "cargo must not be invoked when the repository has no Cargo.toml",
      );
    };

    const result = rustFindings(filePath, root, spawn);

    assert.deepEqual(result.findings, []);
    assert.equal(result.unavailable, null);
    const dispatched = runProjectLinter(filePath, root);
    assert.deepEqual(dispatched.findings, [], "the dispatcher must agree");
    assert.equal(dispatched.unavailable, null);
    rmSync(root, { recursive: true, force: true });
  },
);

test("the dispatcher preserves a configured linter failure as unavailable evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "qg-eslint-"));
  const filePath = join(root, "main.ts");
  writeFileSync(join(root, "eslint.config.js"), "export default []\n");
  writeFileSync(filePath, "export const value = true;\n");

  const result = runProjectLinter(filePath, root);

  assert.deepEqual(result.findings, []);
  assert.match(result.unavailable, /eslint executable is not installed/);
  rmSync(root, { recursive: true, force: true });
});

test("ruff uses the per-file timeout budget", () => {
  const root = mkdtempSync(join(tmpdir(), "qg-ruff-"));
  const filePath = join(root, "main.py");
  const calls = [];
  writeFileSync(join(root, "ruff.toml"), "[lint]\nselect = ['E']\n");
  writeFileSync(filePath, "value = 1\n");

  const result = runProjectLinter(filePath, root, (command, args, options) => {
    calls.push({ command, args, options });
    return { stdout: "[]" };
  });

  assert.deepEqual(result.findings, []);
  assert.equal(result.unavailable, null);
  assert.equal(calls[0].command, "ruff");
  assert.equal(calls[0].options.timeout, 10_000);
  rmSync(root, { recursive: true, force: true });
});
