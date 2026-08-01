// Churn is the loop's best signal for accidental complexity. Complexity that
// nobody ever had to patch is usually essential: the problem is genuinely hard.
// Complexity that keeps attracting fix commits grew by patching, and patching
// is how accidental complexity gets in. So the ledger scores both, and weighs
// fix commits heavier than ordinary ones.

// A NUL starts each commit, which keeps a subject line that looks like a path
// from being counted as one.
export const LOG_ARGS = ["log", "--name-only", "--format=%x00%s"];

const FIX_SUBJECT = /^(fix|hotfix|bugfix|patch|revert)\b/i;

function isFixSubject(subject) {
  return FIX_SUBJECT.test(subject.trim());
}

function tallyCommit(churn, block) {
  const [subject, ...rest] = block.split("\n");
  const fix = isFixSubject(subject) ? 1 : 0;
  for (const line of rest) {
    const path = line.trim();
    if (path === "") {
      continue;
    }
    churn[path] ??= { touches: 0, fixes: 0 };
    churn[path].touches += 1;
    churn[path].fixes += fix;
  }
}

// Returns { [path]: { touches, fixes } } from `git log` output built with
// LOG_ARGS. A path counts once per commit that named it.
export function parseChurn(logText) {
  const churn = {};
  for (const block of logText.split("\0")) {
    if (block.trim() === "") {
      continue;
    }
    tallyCommit(churn, block);
  }
  return churn;
}
