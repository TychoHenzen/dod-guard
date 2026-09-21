import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCodexExecArgs,
  buildCodexPreflightArgs,
  CODEX_OBSOLETE_APPROVAL_FLAG,
  CODEX_WRITE_APPROVAL_FLAG,
  resolveCodexExecutable,
} from "./codex-launch-contract.mjs";

test("resolves the direct Codex executable for each platform", () => {
  assert.equal(resolveCodexExecutable("win32"), "codex.exe");
  assert.equal(resolveCodexExecutable("linux"), "codex");
  assert.equal(resolveCodexExecutable("darwin"), "codex");
});

test("builds read-only advisor and write-capable review arguments without stale flags", () => {
  const shared = {
    model: "gpt-5.6-luna",
    reasoningEffort: "max",
    schemaPath: "schema.json",
    outputPath: "output.json",
    workdir: "work",
  };
  const readOnly = buildCodexExecArgs({ ...shared, mode: "read-only" });
  const write = buildCodexExecArgs({ ...shared, mode: "write" });
  assert.equal(readOnly.includes(CODEX_WRITE_APPROVAL_FLAG), false);
  assert.equal(write.includes(CODEX_WRITE_APPROVAL_FLAG), true);
  assert.equal(readOnly.includes(CODEX_OBSOLETE_APPROVAL_FLAG), false);
  assert.equal(write.includes(CODEX_OBSOLETE_APPROVAL_FLAG), false);
  assert.deepEqual(buildCodexPreflightArgs(), { version: ["--version"], help: ["exec", "--help"] });
});

test("rejects the obsolete approval option before a process can start", () => {
  assert.throws(
    () => buildCodexExecArgs({ mode: "write", prefixArgs: [CODEX_OBSOLETE_APPROVAL_FLAG] }),
    /does not support --ask-for-approval/,
  );
});
