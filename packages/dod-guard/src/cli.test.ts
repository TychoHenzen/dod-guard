import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { EXIT_USAGE_ERROR, isCliInvocation, parseArgs, runCli } from "./cli.js";

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
    const { command } = parseArgs(["steps", "some-change"]);
    assert.equal(command, "steps");
  });

  it("parses --key=value into a string flag", () => {
    const { flags } = parseArgs(["steps", "--cwd=/repo"]);
    assert.equal(flags.cwd, "/repo");
  });

  it("parses a bare --flag as boolean true", () => {
    const { flags } = parseArgs(["steps", "--quiet"]);
    assert.equal(flags.quiet, true);
  });

  it("keeps '=' characters inside a flag value", () => {
    const { flags } = parseArgs(["steps", "--cwd=/repo?a=b"]);
    assert.equal(flags.cwd, "/repo?a=b");
  });

  it("returns an empty command when argv has no positional", () => {
    const { command } = parseArgs(["--help"]);
    assert.equal(command, "");
  });
});

// ── isCliInvocation ─────────────────────────────────────────────────────

describe("isCliInvocation", () => {
  it("is false with no args, so a bare launch starts the MCP server", () => {
    assert.equal(isCliInvocation([]), false);
  });

  it("is true when a command is present", () => {
    assert.equal(isCliInvocation(["steps", "some-change"]), true);
  });
});

// ── runCli ──────────────────────────────────────────────────────────────

describe("runCli", () => {
  it("prints usage and exits 0 for --help", async () => {
    const { io, out } = captureIo();
    const code = await runCli(["--help"], io);
    assert.equal(code, 0);
    assert.match(out(), /USAGE/);
  });

  it("errors with the usage exit code on an unknown command", async () => {
    const { io, err } = captureIo();
    const code = await runCli(["bogus"], io);
    assert.equal(code, EXIT_USAGE_ERROR);
    assert.match(err(), /unknown command "bogus"/);
  });
});

// ── cover ───────────────────────────────────────────────────────────────

describe("cover via runCli", () => {
  let cwd: string;

  before(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-cli-cover-"));
  });

  after(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it("errors with the usage exit code when neither a change id nor --all is given", async () => {
    const { io, err } = captureIo();
    const code = await runCli(["cover", `--cwd=${cwd}`], io);
    assert.equal(code, EXIT_USAGE_ERROR);
    assert.match(err(), /needs a change id or --all/);
  });

  it("exits 0 with nothing to cover when --all finds no spec tree", async () => {
    const { io, out } = captureIo();
    const code = await runCli(["cover", "--all", `--cwd=${cwd}`], io);
    assert.equal(code, 0);
    assert.match(out(), /Nothing to cover/);
  });
});
