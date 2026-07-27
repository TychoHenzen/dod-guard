import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXIT, exitCodeFor, isCliInvocation, parseArgs, runCli } from "./cli.js";
import type { CheckResult, LeafResult } from "./types.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function leafResult(status: LeafResult["status"]): LeafResult {
  return {
    node_path: "0.children.0",
    title: "a proof",
    status,
  } as LeafResult;
}

function result(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    overall: "pass",
    leaves: [leafResult("pass")],
    summary: "1/1 concrete proofs pass",
    timestamp: "2026-07-27T00:00:00.000Z",
    proof_fingerprint: "abc",
    draft_count: 0,
    ...overrides,
  } as CheckResult;
}

/** Collect CLI output instead of writing to the real streams. */
function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { write: (s: string) => out.push(s), writeErr: (s: string) => err.push(s) },
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

// ── parseArgs ───────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("reads the command from the first positional arg", () => {
    assert.equal(parseArgs(["check", "--dod-id=x"]).command, "check");
  });

  it("parses --key=value into a string flag", () => {
    assert.equal(parseArgs(["check", "--dod-id=abc123"]).flags["dod-id"], "abc123");
  });

  it("parses a bare --flag as boolean true", () => {
    assert.equal(parseArgs(["check", "--quiet"]).flags.quiet, true);
  });

  it("keeps '=' characters inside a flag value", () => {
    const { flags } = parseArgs(["check", "--cwd=C:\\a=b"]);
    assert.equal(flags.cwd, "C:\\a=b");
  });

  it("returns an empty command when argv has no positional", () => {
    assert.equal(parseArgs(["--help"]).command, "");
  });
});

// ── exitCodeFor ─────────────────────────────────────────────────────────

describe("exitCodeFor", () => {
  it("returns PASS for a clean full run", () => {
    assert.equal(exitCodeFor(result()), EXIT.PASS);
  });

  it("returns FAIL when the verdict is fail", () => {
    assert.equal(exitCodeFor(result({ overall: "fail" })), EXIT.FAIL);
  });

  it("returns FAIL when the DoD is stuck", () => {
    assert.equal(exitCodeFor(result({ overall: "stuck" })), EXIT.FAIL);
  });

  it("returns FAIL when the proof set was tampered with", () => {
    assert.equal(exitCodeFor(result({ overall: "pass", tampered: true })), EXIT.FAIL);
  });

  it("returns INCOMPLETE for a full run with drafts remaining", () => {
    assert.equal(exitCodeFor(result({ overall: "incomplete", draft_count: 2 })), EXIT.INCOMPLETE);
  });

  it("returns PASS for a pass_dirty verdict", () => {
    assert.equal(exitCodeFor(result({ overall: "pass_dirty" })), EXIT.PASS);
  });

  // This is the behaviour that makes a DoD subtree usable as a verify_cmd:
  // checker.ts forces scoped runs to "incomplete", but a passing subtree must
  // still exit 0 or evomcp/cheap-step could never gate on one.
  it("returns PASS for a scoped run whose leaves all passed, despite overall=incomplete", () => {
    const scoped = result({
      overall: "incomplete",
      scoped: true,
      leaves: [leafResult("pass"), leafResult("pass")],
    });
    assert.equal(exitCodeFor(scoped), EXIT.PASS);
  });

  it("returns FAIL for a scoped run with a failing leaf", () => {
    const scoped = result({
      overall: "incomplete",
      scoped: true,
      leaves: [leafResult("pass"), leafResult("fail")],
    });
    assert.equal(exitCodeFor(scoped), EXIT.FAIL);
  });

  it("ignores draft leaves when scoring a scoped run", () => {
    const scoped = result({
      overall: "incomplete",
      scoped: true,
      leaves: [leafResult("pass"), leafResult("draft")],
    });
    assert.equal(exitCodeFor(scoped), EXIT.PASS);
  });
});

// ── isCliInvocation ─────────────────────────────────────────────────────

describe("isCliInvocation", () => {
  it("is false with no args, so a bare launch starts the MCP server", () => {
    assert.equal(isCliInvocation([]), false);
  });

  it("is true when a command is present", () => {
    assert.equal(isCliInvocation(["check"]), true);
  });
});

// ── runCli routing ──────────────────────────────────────────────────────

describe("runCli", () => {
  it("prints usage and exits 0 for --help", async () => {
    const { io, out } = captureIo();
    const code = await runCli(["--help"], io);
    assert.equal(code, EXIT.PASS);
    assert.match(out(), /USAGE/);
  });

  it("documents the exit-code contract in usage output", async () => {
    const { io, out } = captureIo();
    await runCli(["help"], io);
    assert.match(out(), /0\s+pass/);
    assert.match(out(), /2\s+incomplete/);
  });

  it("errors with ERROR code on an unknown command", async () => {
    const { io, err } = captureIo();
    const code = await runCli(["frobnicate"], io);
    assert.equal(code, EXIT.ERROR);
    assert.match(err(), /unknown command "frobnicate"/);
  });

  it("errors when check is given neither --dod-id nor --path", async () => {
    const { io, err } = captureIo();
    const code = await runCli(["check"], io);
    assert.equal(code, EXIT.ERROR);
    assert.match(err(), /--dod-id/);
  });

  it("errors with ERROR code when the DoD ID is not in the store", async () => {
    const { io, err } = captureIo();
    const code = await runCli(["check", "--dod-id=definitely-not-a-real-dod-id"], io);
    assert.equal(code, EXIT.ERROR);
    assert.match(err(), /not found/);
  });
});
