/**
 * Final selection: adopt exactly one acceptable change, discard the rest.
 */

import type { AttemptResult } from "./attempt-result.js";
import { adoptWinner } from "./gitevo-integration.js";
import { type BranchInfo, compareBranches } from "./judge.js";
import { abandonBranch } from "./solve-abandon.js";
import { captureDiff, checkoutBranch } from "./solve-git.js";
import type { SolveSession } from "./solve-session.js";
import type { JudgeVerdict } from "./types.js";

export interface Selection {
  /** The adopted attempt. */
  winner: AttemptResult;
  /** Judge verdict, absent when only one candidate survived. */
  verdict?: JudgeVerdict;
  /** The change that is now in the repository. */
  patch: string;
}

/**
 * Every survivor passed verification, so they all carry the same score. That
 * score is what lets the judge build a composite verdict when the LLM judge
 * is unavailable.
 */
function toBranch(attempt: AttemptResult): BranchInfo {
  return {
    name: attempt.branch,
    diff: attempt.diff,
    score: 1,
    verificationReport: attempt.report,
  };
}

async function pickWinner(
  survivors: AttemptResult[],
  session: SolveSession,
): Promise<{ winner: AttemptResult; verdict?: JudgeVerdict }> {
  if (survivors.length === 1) return { winner: survivors[0] };

  const branches: BranchInfo[] = survivors.map(toBranch);
  const result = await compareBranches(branches, {
    cwd: session.spec.cwd,
    model: session.spec.model,
    apiKey: session.spec.api_key,
    useProxy: session.proxyReady,
  });

  const found = survivors.find((s) => s.branch === result.winner);
  return { winner: found ?? survivors[0], verdict: result.verdict ?? undefined };
}

/**
 * Adopt one survivor, abandon the others, and return to the default branch.
 * An adopt failure propagates: the caller must not read a merge report for a
 * merge that never happened.
 */
export async function selectWinner(survivors: AttemptResult[], session: SolveSession): Promise<Selection> {
  const cwd = session.spec.cwd;
  const { winner, verdict } = await pickWinner(survivors, session);

  for (const loser of survivors) {
    if (loser === winner) continue;
    await abandonBranch(loser.branch, `judge selected ${winner.branch}`, cwd);
  }

  const fresh = captureDiff(cwd, `${session.rootBranch}...${winner.branch}`);
  checkoutBranch(cwd, session.rootBranch);
  await adoptWinner(winner.branch, cwd);
  checkoutBranch(cwd, session.rootBranch);

  return { winner, verdict, patch: fresh || winner.diff };
}
