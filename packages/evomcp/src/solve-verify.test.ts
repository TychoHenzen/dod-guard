import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import type { GateResult, TaskSpec } from "./types.js";

/** The shape runVerification hands the gate pipeline. */
interface Config {
  build_cmd?: string;
  test_cmd?: string;
  lint_cmd?: string;
  verify_cmd?: string;
}

/** Config of every GateRunner the module built, in order. */
const built: Config[] = [];
/** Directory every runAll was pointed at, in order. */
const ran: string[] = [];
let gateResults: GateResult[] = [];

/** Commands handed to the shell, in order. */
const shell: string[] = [];
let shellOutput = "all good";
/** Exit status the shell reports, or 0 for success. */
let shellStatus = 0;

mock.module("./gates.js", {
  namedExports: {
    GateRunner: class {
      constructor(config: Config) {
        built.push(config);
      }
      async runAll(cwd: string): Promise<GateResult[]> {
        ran.push(cwd);
        return gateResults;
      }
    },
  },
});

mock.module("node:child_process", {
  namedExports: {
    spawn: mock.fn(() => {
      throw new Error("the verify path must not spawn a worker");
    }),
    execSync: mock.fn((cmd: string) => {
      shell.push(String(cmd));
      if (shellStatus === 0) return shellOutput;
      const err: Error & { status?: number; stdout?: string; stderr?: string } = new Error("failed");
      err.status = shellStatus;
      err.stdout = shellOutput;
      err.stderr = "";
      throw err;
    }),
  },
});

function gate(name: string, passed: boolean, diagnostics = "", elapsed = 10): GateResult {
  return { gate: name, passed, diagnostics, elapsed_ms: elapsed };
}

const base: TaskSpec = { goal: "fix", verify_cmd: "npm test", cwd: "/repo" };

describe("runVerification", () => {
  let runVerification: (spec: TaskSpec) => Promise<{
    passed: boolean;
    exitCode: number;
    output: string;
    report: string;
  }>;

  before(async () => {
    runVerification = (await import("./solve-verify.js")).runVerification;
  });

  function reset() {
    built.length = 0;
    ran.length = 0;
    shell.length = 0;
    gateResults = [];
    shellOutput = "all good";
    shellStatus = 0;
  }

  it("runs the verify command alone when no other check is configured", async () => {
    reset();
    const outcome = await runVerification(base);
    assert.deepEqual(shell, ["npm test"]);
    assert.equal(built.length, 0);
    assert.deepEqual(outcome, {
      passed: true,
      exitCode: 0,
      output: "all good",
      report: "- verify: PASSED (exit=0)\n\nall good",
    });
  });

  it("reports the exit code of a failing verify command", async () => {
    reset();
    shellStatus = 3;
    shellOutput = "boom";
    const outcome = await runVerification(base);
    assert.equal(outcome.passed, false);
    assert.equal(outcome.exitCode, 3);
    assert.equal(outcome.report.startsWith("- verify: FAILED (exit=3)\n\n"), true);
    assert.equal(outcome.output.includes("boom"), true);
  });

  it("hands every configured command to the gate pipeline", async () => {
    reset();
    gateResults = [gate("lint", true)];
    await runVerification({ ...base, build_cmd: "npm run build", lint_cmd: "npm run lint" });
    assert.deepEqual(built, [
      {
        build_cmd: "npm run build",
        test_cmd: undefined,
        lint_cmd: "npm run lint",
        verify_cmd: "npm test",
      },
    ]);
    assert.deepEqual(ran, ["/repo"]);
    assert.deepEqual(shell, []);
  });

  it("uses the gate pipeline when only a test command is configured", async () => {
    reset();
    gateResults = [gate("test", true)];
    await runVerification({ ...base, test_cmd: "npm test" });
    assert.equal(built.length, 1);
  });

  it("passes when every gate passed, and lists what ran", async () => {
    reset();
    gateResults = [gate("lint", true, "", 12), gate("build", true, "", 34)];
    const outcome = await runVerification({ ...base, lint_cmd: "l", build_cmd: "b" });
    assert.deepEqual(outcome, {
      passed: true,
      exitCode: 0,
      output: "",
      report: "- lint: PASSED (12ms)\n- build: PASSED (34ms)",
    });
  });

  it("passes with an empty report when the pipeline ran no gate", async () => {
    reset();
    gateResults = [];
    const outcome = await runVerification({ ...base, lint_cmd: "l" });
    assert.deepEqual(outcome, { passed: true, exitCode: 0, output: "", report: "" });
  });

  it("reports one failing gate under its own header", async () => {
    reset();
    gateResults = [gate("lint", true, "", 12), gate("test", false, "expected 200", 50)];
    const outcome = await runVerification({ ...base, lint_cmd: "l", test_cmd: "t" });
    assert.equal(outcome.passed, false);
    assert.equal(outcome.output, "=== FAILED: test ===\nexpected 200");
    assert.equal(outcome.report, "- lint: PASSED (12ms)\n- test: FAILED (50ms)\n\n=== FAILED: test ===\nexpected 200");
  });

  it("separates the diagnostics of two failing gates with a blank line", async () => {
    reset();
    gateResults = [gate("lint", false, "bad style"), gate("test", false, "bad logic")];
    const outcome = await runVerification({ ...base, lint_cmd: "l", test_cmd: "t" });
    assert.equal(outcome.output, "=== FAILED: lint ===\nbad style\n\n=== FAILED: test ===\nbad logic");
  });

  it("reports a gate failure as exit code 1, whatever the gate itself exited", async () => {
    reset();
    gateResults = [gate("test", false, "expected 200")];
    assert.equal((await runVerification({ ...base, test_cmd: "t" })).exitCode, 1);
  });

  it("keeps a failing gate that produced no diagnostics a failure", async () => {
    reset();
    gateResults = [gate("test", false, "")];
    const outcome = await runVerification({ ...base, test_cmd: "t" });
    assert.equal(outcome.output, "=== FAILED: test ===\n");
    assert.equal(outcome.passed, false);
  });
});
