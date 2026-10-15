// Keeps one gate comment per pull request: the comment that starts with the gate marker is updated in place,
// and a new one is created only when none exists.

import { COMMENT_MARKER } from "./pr-gate-report.mjs";

const bodyField = (bodyFile) => ["--field", `body=@${bodyFile}`];

/** `gh(args)` runs the GitHub CLI and returns its stdout, throwing when the call fails. */
export function upsertComment({ repo, pr, bodyFile, gh }) {
  const filter = `.[] | select(.body | startswith("${COMMENT_MARKER}")) | .id`;
  const listed = gh(["api", "--paginate", `repos/${repo}/issues/${pr}/comments`, "--jq", filter]);
  const [existing] = listed.split("\n").filter(Boolean);
  if (existing) {
    return gh(["api", "--method", "PATCH", `repos/${repo}/issues/comments/${existing}`, ...bodyField(bodyFile)]);
  }
  return gh(["api", "--method", "POST", `repos/${repo}/issues/${pr}/comments`, ...bodyField(bodyFile)]);
}
