import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { EXIT, exitCodeFor, isCliInvocation, parseArgs, runCli } from "./cli.js";
import * as store from "./store.js";
import type { CheckResult, DodDocument, LeafResult } from "./types.js";

// Isolate the store the same way regenerate-dod.test.ts does — never touch
// the real ~/.claude/dod-store.
let storeDir: string;

beforeEach(async () => {
  storeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-store-"));
  process.env.DOD_STORE_DIR = storeDir;
});

afterEach(async () => {
  delete process.env.DOD_STORE_DIR;
  await fs.rm(storeDir, { recursive: true, force: true });
});

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

  it("documents the trace exit-code contract in usage output", async () => {
    const { io, out } = captureIo();
    await runCli(["help"], io);
    assert.match(out(), /EXIT CODES \(trace\)/);
  });

  it("errors when trace is given no change id", async () => {
    const { io, err } = captureIo();
    const code = await runCli(["trace"], io);
    assert.equal(code, EXIT.ERROR);
    assert.match(err(), /pass a change id/);
  });
});

// ── runCli list ─────────────────────────────────────────────────────────

function minimalDoc(overrides: Partial<DodDocument> = {}): DodDocument {
  return {
    id: store.generateId(),
    title: "A tracked DoD",
    goal: "prove something",
    date: "2026-08-11",
    cwd: "C:/repo",
    markdown_path: "C:/repo/dod.md",
    created_at: "2026-08-11T00:00:00.000Z",
    sections: { requirements: "" },
    roots: [],
    amendments: [],
    ...overrides,
  };
}

describe("runCli list", () => {
  it("reports no DoDs tracked and exits PASS when the store is empty", async () => {
    const { io, out } = captureIo();
    const code = await runCli(["list"], io);
    assert.equal(code, EXIT.PASS);
    assert.match(out(), /No DoDs tracked/);
  });

  it("prints each tracked DoD's id, verdict, and title, and exits PASS", async () => {
    const doc = minimalDoc({
      title: "List me",
      last_check: { timestamp: "2026-08-11T00:00:00.000Z", overall: "pass", summary: "1/1 pass" },
    });
    await store.save(doc);

    const { io, out } = captureIo();
    const code = await runCli(["list"], io);

    assert.equal(code, EXIT.PASS);
    assert.match(out(), new RegExp(`${doc.id}\\s+pass\\s+List me`));
  });

  it("labels an unchecked DoD as 'unchecked' rather than a check verdict", async () => {
    const doc = minimalDoc({ title: "Never checked" });
    await store.save(doc);

    const { io, out } = captureIo();
    await runCli(["list"], io);

    assert.match(out(), /unchecked\s+Never checked/);
  });
});

// ── runCli dispatch failure handling ───────────────────────────────────

describe("runCli error handling", () => {
  it("catches a thrown error from a handler and reports ERROR instead of crashing", async () => {
    // A regular file where the store directory should be forces
    // ensureStoreDir()'s fs.mkdir to throw — listAll() does not catch it,
    // so it propagates up through cmdList into runCli's try/catch.
    const blockingFile = join(os.tmpdir(), `dod-guard-not-a-dir-${Date.now()}`);
    await fs.writeFile(blockingFile, "not a directory", "utf-8");
    process.env.DOD_STORE_DIR = blockingFile;

    const { io, err } = captureIo();
    const code = await runCli(["list"], io);

    assert.equal(code, EXIT.ERROR);
    assert.match(err(), /ERROR:/);

    await fs.rm(blockingFile, { force: true });
  });
});
