// The pushed delivery branches a queue snapshot carries, and the hold an unfinished one puts on its root.
// Every function is pure.

// A pushed codex/<issue>-* branch with no open pull request is a delivery that stopped partway. The
// trailing hyphen keeps issue 9 from matching codex/90-x. Only an entry that says openPullRequest is true
// counts as having one, so an unreadable entry never clears the hold.
function branchReasons(root, context) {
  if (!root) return [];
  const prefix = `codex/${root.issueNumber}-`;
  return context.branches
    .filter(({ name, openPullRequest }) => name.startsWith(prefix) && openPullRequest !== true)
    .map(
      ({ name }) => `issue #${root.issueNumber} has unfinished delivery branch ${name} without an open pull request`,
    );
}

// ASSUMPTION (Medium risk): a snapshot without a branches list holds nothing, so a hand-built snapshot or one
// made before the key existed still selects. closure.mjs snapshot always writes the key, so a live run
// always carries the list. An entry without a string name is dropped, never read as a branch.
function branchesOf(snapshot) {
  if (!Array.isArray(snapshot?.branches)) return [];
  return snapshot.branches.filter((branch) => typeof branch?.name === "string");
}

export { branchesOf, branchReasons };
