import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { rustFindings } from "./rust-linter.mjs";
import { runProjectLinter } from "./project-linter.mjs";
import { tempCrate } from "./project-linter-fixtures.test.mjs";

test("a timeout produces no findings and throws nothing", () => {
  const root = tempCrate();
  const filePath = join(root, "src", "main.rs");
  const spawn = () => {
    const error = new Error("ETIMEDOUT");
    error.code = "ETIMEDOUT";
    return { error, signal: "SIGTERM", stdout: "" };
  };

  assert.doesNotThrow(() => {
    const findings = rustFindings(filePath, root, spawn);
    assert.deepEqual(findings, []);
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

    const findings = rustFindings(filePath, root, spawn);

    assert.deepEqual(findings, []);
    assert.deepEqual(
      runProjectLinter(filePath, root),
      [],
      "the dispatcher must agree",
    );
    rmSync(root, { recursive: true, force: true });
  },
);
