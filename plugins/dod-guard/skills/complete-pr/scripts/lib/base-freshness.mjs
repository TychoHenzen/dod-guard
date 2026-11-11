// The pull request base SHA that GitHub reports can stay behind the default branch after that branch moves.
// Merging such a commit changes nothing when the head already holds it, so the triage would find no conflict
// to classify. This check compares the base with the default branch tip the caller fetched before the run.
// It tests equality only, so a stale fetch can produce a false stop; the standard tells the caller to fetch
// immediately before start.

function trackedTip(git, defaultBranch) {
  const result = git(["rev-parse", "-q", "--verify", `refs/remotes/origin/${defaultBranch}`], [0, 1, 128]);
  return result.status === 0 ? result.stdout.trim() : null;
}

function refreshStep(defaultBranch) {
  return (
    `Run \`gh pr edit <number> --base ${defaultBranch}\`, read the pull request back until its base.sha ` +
    "equals the expected SHA, then run start again with a new state file."
  );
}

// Returns null when the base is current, else the stop the caller throws.
function baseFreshnessStop(git, { defaultBranch, pullRequest }) {
  const tip = trackedTip(git, defaultBranch);
  if (tip === null) {
    return {
      code: "default_tip_unknown",
      reason: `origin/${defaultBranch} is not in this clone. Fetch the default branch before the run.`,
      details: { expected: `origin/${defaultBranch}` },
    };
  }
  if (tip === pullRequest.baseSha) {
    return null;
  }
  return {
    code: "base_stale",
    reason: "The pull request base SHA differs from the default branch tip fetched before this run.",
    details: { decisionNeeded: refreshStep(defaultBranch), expected: tip, observed: pullRequest.baseSha },
  };
}

export { baseFreshnessStop };
