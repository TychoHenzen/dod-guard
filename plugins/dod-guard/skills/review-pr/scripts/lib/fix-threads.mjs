// A review asks for fixes to its few worst findings only. Every BLOCKER and MAJOR used to get a thread
// that the fix stage had to fix or decline, so a pull request whose code is still moving paid for
// polish on each one; the review of one 213-file move held 16 MAJOR scanner groups, all in files
// the change only renamed. The findings past the cap are listed in the body and get no thread.
const MAX_FIX_THREADS = 5;

// ASSUMPTION: within one severity, a judged finding is worse than a scanner group, and the lenses
// rank feature, reliability, design, hygiene: a missing behavior or a failure path costs a user
// more than a structural or consistency problem. A finding several lenses found takes the best rank.
const LENS_ORDER = Object.freeze([
  "review-pr-feature",
  "review-pr-reliability",
  "review-pr-design",
  "review-pr-hygiene",
]);
const SCANNER_RANK = LENS_ORDER.length;

function lensRank(finding) {
  if (finding.scanner) {
    return SCANNER_RANK;
  }
  const ranks = (finding.reviewers ?? []).map((name) => LENS_ORDER.indexOf(name)).filter((rank) => rank >= 0);
  return Math.min(SCANNER_RANK - 1, ...ranks);
}

function worstFirst(left, right) {
  const severity = (finding) => (finding.severity === "BLOCKER" ? 0 : 1);
  return severity(left) - severity(right) || lensRank(left) - lensRank(right);
}

// Every BLOCKER keeps its thread however many there are, because a deferred one would never be
// fixed; MAJOR findings fill what is left of the cap. MINOR findings are not threads at all.
// The sort is stable, so findings of one rank keep the order the build gave them.
function splitFixThreads(findings) {
  const blocking = findings.filter((finding) => finding.severity !== "MINOR").sort(worstFirst);
  const blockers = blocking.filter((finding) => finding.severity === "BLOCKER").length;
  const room = Math.max(blockers, MAX_FIX_THREADS);
  return { threads: blocking.slice(0, room), deferred: blocking.slice(room) };
}

export { MAX_FIX_THREADS, splitFixThreads };
