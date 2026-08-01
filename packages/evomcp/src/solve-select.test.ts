import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { type AttemptResult, blankResult } from "./attempt-result.js";
import type { SolveSession } from "./solve-session.js";

interface JudgeCall {
  branches: { name: string; diff: string; score: number; verificationReport: string }[];
  opts: Record<string, unknown>;
}

/** Every compareBranches call, in order. */
const judged: JudgeCall[] = [];
let judgeWinner: string | null = null;
let judgeVerdict: unknown = null;

/** Branch and reason of every abandon, in order. */
const abandoned: { branch: string; reason: string }[] = [];
/** Branch names checked out, in order. */
const checkouts: string[] = [];
/** Branches handed to the adopt, in order. */
const adopted: string[] = [];
let freshDiff = "the fresh diff";
let adoptThrows = false;

mock.module("./judge.js", {
  namedExports: {
    compareBranches: mock.fn(async (branches: JudgeCall["branches"], opts: Record<string, unknown>) => {
      judged.push({ branches, opts });
      return { winner: judgeWinner, verdict: judgeVerdict, fallback: false };
    }),
  },
});

mock.module("./gitevo-integration.js", {
  namedExports: {
    adoptWinner: mock.fn(async (branch: string) => {
      adopted.push(branch);
      if (adoptThrows) throw new Error("merge conflict");
    }),
  },
});

mock.module("./solve-abandon.js", {
  namedExports: {
    abandonBranch: mock.fn(async (branch: string, reason: string) => {
      abandoned.push({ branch, reason });
    }),
  },
});

mock.module("./solve-git.js", {
  namedExports: {
    captureDiff: mock.fn(() => freshDiff),
    checkoutBranch: mock.fn((_cwd: string, branch: string) => {
      checkouts.push(branch);
      return true;
    }),
  },
});

function attempt(index: number): AttemptResult {
  const state = blankResult({ index, label: "simplest", prompt: "go" });
  state.diff = `diff ${index}`;
  state.report = `report ${index}`;
  state.passed = true;
  state.exitCode = 0;
  state.diagnostic.final_status = "passed";
  return state;
}

const session: SolveSession = {
  spec: { goal: "fix", verify_cmd: "npm test", cwd: "/repo", model: "deepseek-chat", api_key: "sk-x" },
  rootBranch: "master",
  proxyReady: true,
  budgetExhausted: false,
};

describe("selectWinner", () => {
  let selectWinner: (survivors: AttemptResult[], session: SolveSession) => Promise<Record<string, unknown>>;

  before(async () => {
    selectWinner = (await import("./solve-select.js")).selectWinner as never;
  });

  function reset() {
    judged.length = 0;
    abandoned.length = 0;
    checkouts.length = 0;
    adopted.length = 0;
    judgeWinner = null;
    judgeVerdict = null;
    freshDiff = "the fresh diff";
    adoptThrows = false;
  }

  it("skips the judge when only one candidate survived", async () => {
    reset();
    const only = attempt(0);
    const selection = await selectWinner([only], session);
    assert.deepEqual(judged, []);
    assert.equal(selection.winner, only);
    assert.equal(selection.verdict, undefined);
  });

  it("abandons nothing when only one candidate survived", async () => {
    reset();
    await selectWinner([attempt(0)], session);
    assert.deepEqual(abandoned, []);
  });

  it("adopts the winner and ends on the default branch", async () => {
    reset();
    await selectWinner([attempt(0)], session);
    assert.deepEqual(adopted, ["solve-strategy-0"]);
    assert.deepEqual(checkouts, ["master", "master"]);
  });

  it("returns the diff taken after the run, not the one the attempt held", async () => {
    reset();
    assert.equal((await selectWinner([attempt(0)], session)).patch, "the fresh diff");
  });

  it("falls back to the attempt diff when the fresh diff is empty", async () => {
    reset();
    freshDiff = "";
    assert.equal((await selectWinner([attempt(0)], session)).patch, "diff 0");
  });

  it("asks the judge to compare every survivor on equal score", async () => {
    reset();
    judgeWinner = "solve-strategy-1";
    await selectWinner([attempt(0), attempt(1)], session);
    assert.deepEqual(judged[0].branches, [
      { name: "solve-strategy-0", diff: "diff 0", score: 1, verificationReport: "report 0" },
      { name: "solve-strategy-1", diff: "diff 1", score: 1, verificationReport: "report 1" },
    ]);
  });

  it("gives the judge the session settings", async () => {
    reset();
    judgeWinner = "solve-strategy-0";
    await selectWinner([attempt(0), attempt(1)], session);
    assert.deepEqual(judged[0].opts, {
      cwd: "/repo",
      model: "deepseek-chat",
      apiKey: "sk-x",
      useProxy: true,
    });
  });

  it("adopts the branch the judge named and abandons the rest", async () => {
    reset();
    judgeWinner = "solve-strategy-1";
    const selection = await selectWinner([attempt(0), attempt(1), attempt(2)], session);
    assert.equal((selection.winner as AttemptResult).branch, "solve-strategy-1");
    assert.deepEqual(adopted, ["solve-strategy-1"]);
    assert.deepEqual(abandoned, [
      { branch: "solve-strategy-0", reason: "judge selected solve-strategy-1" },
      { branch: "solve-strategy-2", reason: "judge selected solve-strategy-1" },
    ]);
  });

  it("returns the judge verdict when there was one", async () => {
    reset();
    judgeWinner = "solve-strategy-0";
    judgeVerdict = { winner: "solve-strategy-0", reasoning: "cleanest" };
    const selection = await selectWinner([attempt(0), attempt(1)], session);
    assert.deepEqual(selection.verdict, { winner: "solve-strategy-0", reasoning: "cleanest" });
  });

  it("reports no verdict when the judge gave none", async () => {
    reset();
    judgeWinner = "solve-strategy-0";
    const selection = await selectWinner([attempt(0), attempt(1)], session);
    assert.equal(selection.verdict, undefined);
  });

  it("keeps the first survivor when the judge names a branch nobody has", async () => {
    reset();
    judgeWinner = "solve-strategy-9";
    const selection = await selectWinner([attempt(0), attempt(1)], session);
    assert.equal((selection.winner as AttemptResult).branch, "solve-strategy-0");
    assert.deepEqual(abandoned, [{ branch: "solve-strategy-1", reason: "judge selected solve-strategy-0" }]);
  });

  it("propagates an adopt failure, so no merge report is read for a merge that never happened", async () => {
    reset();
    adoptThrows = true;
    await assert.rejects(() => selectWinner([attempt(0)], session), /merge conflict/);
  });
});
