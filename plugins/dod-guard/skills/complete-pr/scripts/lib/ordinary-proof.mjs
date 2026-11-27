// The pre-merge proof complete-pr runs before its helper. It sorts the one issue a pull request closes onto
// the structured or the ordinary path, and for an ordinary ticket verifies the pull request's evidence.
// It only reads GitHub. The outcome is "ordinary" (verified), "structured" (the issue carries a structured
// record or comment, so the structured sections of complete-pr apply unchanged), or "refused".
import { gh, readComments, readIssue } from "./closure-github.mjs";
import { closingReferences } from "./linked-issues.mjs";
import { ordinaryEvidenceReasons, structuredMarkers } from "./ordinary-evidence.mjs";

function sameRepository(left, right) {
  return String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
}

// The issues in the target repository that the pull request body closes, each number once.
function closingIssues(pull, repository) {
  const references = closingReferences(pull?.body, repository).filter((reference) =>
    sameRepository(reference.repository, repository),
  );
  return [...new Set(references.map((reference) => reference.number))];
}

// Each row answers null when the pull request passes it, or the text after "pull request #N".
const PULL_CHECKS = [
  (live) => (live.pull?.state === "open" ? null : "is not open"),
  (live) =>
    live.pull?.head?.sha === live.headSha ? null : `head is ${live.pull?.head?.sha ?? "missing"}, not ${live.headSha}`,
  (live) =>
    live.pull?.base?.ref === live.defaultBranch
      ? null
      : `base ${live.pull?.base?.ref ?? "missing"} is not the default branch ${live.defaultBranch}`,
  (live) =>
    sameRepository(live.pull?.head?.repo?.full_name, live.repository)
      ? null
      : `head repository is not ${live.repository}`,
  (live) =>
    live.issues.length === 1
      ? null
      : `body closes ${live.issues.length} issues in ${live.repository}; the proof needs exactly one`,
];

function pullReasons(live) {
  return PULL_CHECKS.map((check) => check(live))
    .filter(Boolean)
    .map((tail) => `pull request #${live.pullNumber} ${tail}`);
}

function readPullSide({ runner, repository, pull, headSha }) {
  const pullRecord = gh(runner, ["api", `repos/${repository}/pulls/${pull}`]);
  return {
    repository,
    headSha,
    pullNumber: pull,
    pull: pullRecord,
    defaultBranch: gh(runner, ["api", `repos/${repository}`])?.default_branch ?? null,
    issues: closingIssues(pullRecord, repository),
  };
}

function readTicket(live, runner) {
  const api = { runner, repository: live.repository };
  const [issueNumber] = live.issues;
  return { ...live, issueNumber, issue: readIssue(api, issueNumber), comments: readComments(api, issueNumber) };
}

function verdict(outcome, ticket, details) {
  return { outcome, pull: ticket.pullNumber, issue: ticket.issueNumber ?? null, headSha: ticket.headSha, ...details };
}

function judgeTicket(ticket) {
  if (ticket.issue?.state !== "open") {
    return verdict("refused", ticket, { reasons: [`issue #${ticket.issueNumber} is not open`] });
  }
  const markers = structuredMarkers(ticket);
  if (markers.length > 0) {
    return verdict("structured", ticket, { markers });
  }
  const reasons = ordinaryEvidenceReasons(ticket);
  return reasons.length > 0 ? verdict("refused", ticket, { reasons }) : verdict("ordinary", ticket, {});
}

function ordinaryProof({ repository, pull, headSha, runner }) {
  const live = readPullSide({ runner, repository, pull, headSha });
  const reasons = pullReasons(live);
  if (reasons.length > 0) {
    return verdict("refused", live, { reasons });
  }
  return judgeTicket(readTicket(live, runner));
}

export { ordinaryProof };
