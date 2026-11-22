// Printed on exit 3 when a command or its flags are invalid.
const USAGE = [
  "Usage:",
  "  review-findings.mjs scan --client=claude|codex --registry=<plugin-list.json>",
  "    --root=<repo> --out=<scan.json>",
  "  review-findings.mjs existing --reviews=<reviews.json>",
  "  review-findings.mjs slots --diff=<unified0.diff> --pbi=<issue.json>",
  "    --sub-issues=<sub-issues.json> --out=<slots.json>",
  "  review-findings.mjs violations --scan=<scan.json> --diff=<unified0.diff>",
  "    --out=<violations.json>",
  "  review-findings.mjs batches --plan=<plan.json> --head=<sha> --out-dir=<batches-dir>",
  "  review-findings.mjs answers --plan=<plan.json> --head=<sha> --answers-dir=<answers-dir>",
  "    --out=<answers.json>",
  "  review-findings.mjs pending --plan=<plan.json> --head=<sha> --answers-dir=<answers-dir>",
  "  review-findings.mjs candidates --scan=<scan.json> --diff=<unified0.diff> --pbi=<issue.json>",
  "    --sub-issues=<sub-issues.json> --plan=<plan.json> --results=<results.json> --answers=<answers.json>",
  "    --out=<candidates.json>",
  "  review-findings.mjs build --head=<sha> --scan=<scan.json> --diff=<unified0.diff>",
  "    --pbi=<issue.json> --sub-issues=<sub-issues.json> --plan=<plan.json>",
  "    --results=<results.json> --merge=<merge.json> --answers=<answers.json> --out=<payload.json>",
  "    --scanner-comments-out=<scanner-comments.json>",
  "  review-findings.mjs label --review-id=<id> --comments=<review-comments.json> --out=<edits.json>",
  "  review-findings.mjs report --review-id=<id> --comments=<review-comments.json>",
].join("\n");

export { USAGE };
