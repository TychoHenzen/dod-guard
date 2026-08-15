import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { type AttemptResult, blankResult } from "./attempt-result.js";
import type { SolveRun } from "./solve-run.js";
import type { SolveSession } from "./solve-session.js";
import type { SolveResult } from "./types.js";

/** Arguments buildEscalation was called with, in order. */
const escalations: { attempts: AttemptResult[]; rejections: string[] }[] = [];
/** Survivor lists selectWinner was called with, in order. */
const selections: AttemptResult[][] = [];
let patch = "the winning patch";
let verdict: unknown = { winner: "solve-strategy-1", reasoning: "cleanest" };

mock.module("./solve-report.js", {
  namedExports: {
    buildEscalation: mock.fn((attempts: AttemptResult[], rejections: string[]) => {
      escalations.push({ attempts, rejections });
      return { failure_signature: "sig", lineages_attempted: attempts.length, summary: "s" };
    }),
  },
});

mock.module("./solve-select.js", {
  namedExports: {
    selectWinner: mock.fn(async (survivors: AttemptResult[]) => {
      selections.push(survivors);
      return { winner: survivors[0], verdict, patch };
    }),
  },
});

function attempt(index: number): AttemptResult {
  const state = blankResult({ index, label: "simplest", prompt: "go" });
  state.diff = "d";
  state.passed = true;
  state.exitCode = 0;
  state.report = "- verify: PASSED (exit=0)";
  state.diagnostic.final_status = "passed";
  return state;
}

describe("finalize", () => {
  let finalize: (run: SolveRun, session: SolveSession) => Promise<SolveResult>;
  let createRun: (spec: never) => SolveRun;

  before(async () => {
    finalize = (await import("./solve-finish.js")).finalize;
    createRun = (await import("./solve-run.js")).createRun as never;
  });

  const spec = { goal: "fix", verify_cmd: "npm test", cwd: "/repo" };

  function openRun(): SolveRun {
    return createRun(spec as never);
  }

  function openSession(onProgress?: (msg: string) => void): SolveSession {
    return { spec, rootBranch: "master", proxyReady: true, budgetExhausted: false, onProgress };
  }

  function reset() {
    escalations.length = 0;
    selections.length = 0;
    patch = "the winning patch";
    verdict = { winner: "solve-strategy-1", reasoning: "cleanest" };
  }

  // covers: evomcp/solve :: A run with no surviving attempt returns an escalation report :: Every attempt fails
  it("escalates when nothing survived", async () => {
    reset();
    const run = openRun();
    run.attempts.push(attempt(0));
    const result = await finalize(run, openSession());
    assert.equal(result.outcome, "escalate");
    assert.equal(result.patch, undefined);
    assert.equal(escalations.length, 1);
    assert.deepEqual(escalations[0].attempts, run.attempts);
    assert.deepEqual(selections, []);
  });

  // covers: evomcp/solve :: A run with no surviving attempt returns an escalation report :: Some attempts were rejected by screening
  it("hands the refusal list to the escalation report", async () => {
    reset();
    const run = openRun();
    run.rejections.push("strategy-0 rejected as degenerate: x");
    await finalize(run, openSession());
    assert.deepEqual(escalations[0].rejections, ["strategy-0 rejected as degenerate: x"]);
  });

  it("omits the refusal list when nothing was refused", async () => {
    reset();
    const run = openRun();
    assert.equal((await finalize(run, openSession())).degenerate_rejections, undefined);
    run.survivors.push(attempt(1));
    assert.equal((await finalize(run, openSession())).degenerate_rejections, undefined);
  });

  it("reports the refusals on both answers", async () => {
    reset();
    const escalated = openRun();
    escalated.rejections.push("a");
    assert.deepEqual((await finalize(escalated, openSession())).degenerate_rejections, ["a"]);

    const adopted = openRun();
    adopted.rejections.push("a");
    adopted.survivors.push(attempt(1));
    assert.deepEqual((await finalize(adopted, openSession())).degenerate_rejections, ["a"]);
  });

  // covers: evomcp/solve :: A single survivor is adopted directly, several go through the judge :: Exactly one survivor
  it("adopts the selected change when a survivor exists", async () => {
    reset();
    const run = openRun();
    const winner = attempt(1);
    run.survivors.push(winner);
    const result = await finalize(run, openSession());
    assert.equal(result.outcome, "pass");
    assert.equal(result.patch, "the winning patch");
    assert.equal(result.verification_report, "- verify: PASSED (exit=0)");
    assert.deepEqual(result.judge_verdict, { winner: "solve-strategy-1", reasoning: "cleanest" });
    assert.equal(result.escalation, undefined);
    assert.deepEqual(selections, [[winner]]);
  });

  it("leaves the judge verdict out when the selection had none", async () => {
    reset();
    verdict = undefined;
    const run = openRun();
    run.survivors.push(attempt(1));
    assert.equal((await finalize(run, openSession())).judge_verdict, undefined);
  });

  it("tells the caller which branch was adopted", async () => {
    reset();
    const messages: string[] = [];
    const run = openRun();
    run.survivors.push(attempt(1));
    await finalize(
      run,
      openSession((m) => messages.push(m)),
    );
    assert.deepEqual(messages, ["Adopted solve-strategy-1."]);
  });

  it("stamps the run duration on both answers", async () => {
    reset();
    const escalated = openRun();
    escalated.startedAt = Date.now() - 5000;
    const first = await finalize(escalated, openSession());
    assert.equal(first.stats.duration_ms >= 5000, true);

    const adopted = openRun();
    adopted.startedAt = Date.now() - 5000;
    adopted.survivors.push(attempt(1));
    assert.equal((await finalize(adopted, openSession())).stats.duration_ms >= 5000, true);
  });

  it("returns the same counters the run collected", async () => {
    reset();
    const run = openRun();
    run.stats.plans_deduped = 4;
    assert.equal((await finalize(run, openSession())).stats, run.stats);
  });
});
