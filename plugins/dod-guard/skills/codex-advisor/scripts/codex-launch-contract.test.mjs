import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCodexExecArgs,
  buildCodexPreflightArgs,
  CODEX_OBSOLETE_APPROVAL_FLAG,
  CODEX_WRITE_APPROVAL_FLAG,
} from "./codex-launch-contract.mjs";

test("builds read-only advisor and write-capable review arguments without stale flags", () => {
  const shared = {
    model: "gpt-5.6-sol",
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
  assert.equal(readOnly.includes("--json"), true);
  assert.equal(write.includes("--json"), true);
  assert.deepEqual(buildCodexPreflightArgs(), { version: ["--version"], help: ["exec", "--help"] });
});

test("rejects the obsolete approval option before a process can start", () => {
  assert.throws(
    () => buildCodexExecArgs({ mode: "write", prefixArgs: [CODEX_OBSOLETE_APPROVAL_FLAG] }),
    /does not support --ask-for-approval/,
  );
});

test("rejects approval injection in read-only prefixes before a process can start", () => {
  assert.throws(
    () => buildCodexExecArgs({ mode: "read-only", prefixArgs: [CODEX_WRITE_APPROVAL_FLAG] }),
    /read-only mode rejects --approve-for-me/,
  );
  assert.throws(
    () => buildCodexPreflightArgs({ mode: "read-only", prefixArgs: [CODEX_WRITE_APPROVAL_FLAG] }),
    /read-only mode rejects --approve-for-me/,
  );
});
