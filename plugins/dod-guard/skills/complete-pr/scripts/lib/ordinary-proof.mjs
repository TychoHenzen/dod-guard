// The pre-merge proof complete-pr runs before its helper. It sorts the one issue a pull request closes onto
// the structured or the ordinary path, and for an ordinary ticket verifies the pull request's evidence.
// It only reads GitHub. The outcome is "ordinary" (verified), "structured" (the issue carries a structured
// record or comment, so the structured sections of complete-pr apply unchanged), or "refused".
import { sameRepository } from "../../../../lib/repository-identity.mjs";
import { gh, readComments, readIssue } from "./closure-github.mjs";
import { TARGET_CHECKS } from "./closure-legacy-pull.mjs";
import { closingReferences } from "./linked-issues.mjs";
import { ordinaryEvidenceReasons, structuredMarkers } from "./ordinary-evidence.mjs";

// The issues in the target repository that the pull request body closes, each number once.
function closingIssues(pull, repository) {
  const references = closingReferences(pull?.body, repository).filter((reference) =>
    sameRepository(reference.repository, repository),
  );
  return [...new Set(references.map((reference) => reference.number))];
}

// Each row is the text after "pull request #N", or a function of the live read that gives it, and the
// test that makes the row a refusal. The target rows are the ones record-ordinary applies after the merge.
const PULL_CHECKS = [
  ["is not open", ({ pull }) => pull.state !== "open"],
  [
    ({ pull, headSha }) => `head is ${pull.head?.sha ?? "missing"}, not ${headSha}`,
    ({ pull, headSha }) => pull.head?.sha !== headSha,
  ],
  ...TARGET_CHECKS,
  [
    ({ issues, repository }) => `body closes ${issues.length} issues in ${repository}; the proof needs exactly one`,
    ({ issues }) => issues.length !== 1,
  ],
];

function rowText(tail, live) {
  if (typeof tail === "function") {
    return tail(live);
  }
  return tail;
}

function pullReasons(live) {
  return PULL_CHECKS.filter(([, refused]) => refused(live)).map(
    ([tail]) => `pull request #${live.pullNumber} ${rowText(tail, live)}`,
  );
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
  if (reasons.length > 0) {
    return verdict("refused", ticket, { reasons });
  }
  return verdict("ordinary", ticket, {});
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
