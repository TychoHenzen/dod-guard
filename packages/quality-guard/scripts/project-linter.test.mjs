import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { rustFindings } from "./rust-linter.mjs";
import { runProjectLinter } from "./project-linter.mjs";

function tempCrate() {
  const root = mkdtempSync(join(tmpdir(), "qg-rust-"));
  writeFileSync(join(root, "Cargo.toml"), '[package]\nname = "fixture"\nversion = "0.1.0"\n');
  return root;
}

function clippyLine(overrides = {}) {
  const message = {
    level: "error",
    message: "unneeded `return` statement",
    code: { code: "clippy::needless_return" },
    spans: [{
      file_name: "src/main.rs",
      line_start: 3,
      is_primary: true,
    }],
    ...overrides,
  };
  return JSON.stringify({ reason: "compiler-message", message });
}

/** A stub matching spawnSync's (command, args, options) => result shape. */
function stubSpawn(stdout) {
  return () => ({ stdout, status: 0 });
}

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

test("a diagnostic whose primary span names a different file is dropped", () => {
  const root = tempCrate();
  const filePath = join(root, "src", "main.rs");
  const spawn = stubSpawn(clippyLine({ spans: [{ file_name: "src/other.rs", line_start: 3, is_primary: true }] }));

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

test("a repository with no Cargo.toml produces nothing, and cargo is never invoked", () => {
  const root = mkdtempSync(join(tmpdir(), "qg-rust-"));
  const filePath = join(root, "src", "main.rs");
  const spawn = () => {
    throw new Error("cargo must not be invoked when the repository has no Cargo.toml");
  };

  const findings = rustFindings(filePath, root, spawn);

  assert.deepEqual(findings, []);
  assert.deepEqual(runProjectLinter(filePath, root), [], "the dispatcher must agree");
  rmSync(root, { recursive: true, force: true });
});
