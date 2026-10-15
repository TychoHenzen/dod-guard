// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { readFile } from "node:fs/promises";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

function assertInOrder(text, patterns) {
  let previous = -1;
  for (const pattern of patterns) {
    const position = text.search(pattern);
    assert.ok(position > previous, `${pattern} must follow the preceding step`);
    previous = position;
  }
}
test("documents supported GitHub review-comment request shapes", () => {
  const updateSection = skill.slice(skill.indexOf("## Update proven findings"));
  const replySection = updateSection.match(/Otherwise reply through([\s\S]*?)Do\s+not use the legacy/)?.[1] ?? "";
  const inlineSection =
    updateSection.match(/For a\s+new inline review comment([\s\S]*?)REST cannot resolve a thread/)?.[1] ?? "";

  assert.notEqual(replySection, "");
  assert.notEqual(inlineSection, "");
  assert.match(replySection, /POST \/repos\/\{owner\}\/\{repo\}\/pulls\/\{pull_number\}\/comments/);
  assert.match(replySection, /`in_reply_to` set to the selected root/);
  assert.doesNotMatch(replySection, /pulls\/comments\/\{comment_id\}\/replies/);
  assert.match(inlineSection, /diff `position`/);
  assert.match(inlineSection, /do not send `line` or `subject_type`/);
});

test("documents narrow GitHub readback and guarded thread resolution", () => {
  const readbackSection = skill.slice(
    skill.indexOf("For GitHub review-thread metadata"),
    skill.indexOf("## Load the behavior contract"),
  );
  const updateSection = skill.slice(skill.indexOf("## Update proven findings"));

  assertInOrder(readbackSection, [
    /1\. The typed connector's review-thread operation/,
    /2\. The explicit GraphQL exception: one paginated read/,
    /`reviewThreads` limited to `id`, `isResolved`/,
    /3\. When that read returns an explicit unsupported response \(404\/405\), the REST\s+review-comment endpoints/,
  ]);
  assert.match(readbackSection, /pulls\/\{pull_number\}\/comments\?per_page=100&page=N/);
  assert.match(readbackSection, /pagination until every selected root comment is present/);
  assert.match(readbackSection, /authentication failure,\s+rate limit \(403\/429\)/);
  assert.match(readbackSection, /Do not request the unsupported\s+`PullRequestReviewComment\.inReplyTo` field/);
  assert.match(updateSection, /`threadId` comes from the\s+thread metadata read under "Resolve the input"/);
  const readbackOffset = updateSection.indexOf("Read back the exact review thread");
  const resolutionOffset = updateSection.indexOf("resolveReviewThread");
  assert.notEqual(readbackOffset, -1);
  assert.notEqual(resolutionOffset, -1);
  assert.ok(readbackOffset < resolutionOffset);
  assert.match(updateSection, /exactly one\s+GraphQL/);
  assert.match(updateSection, /node\(id: \$threadId\)/);
  assert.match(updateSection, /mismatched head/);
  assert.match(
    updateSection,
    /If a write fails or is ambiguous, read back before retrying; never issue\s+a blind duplicate reply/,
  );
  assert.match(updateSection, /Leave every other\s+thread unchanged/);
});

test("does not widen the exception to routine GraphQL provider data", () => {
  assert.doesNotMatch(skill, /projectsV2/i);
  assert.match(skill, /do not batch unrelated threads or ProjectV2\s+data/);
  assert.doesNotMatch(skill, /Azure|ADO-/);
});

function declineSection() {
  const start = skill.indexOf("## Decline non-actionable findings");
  const end = skill.indexOf("## Report");
  assert.notEqual(start, -1, "the decline section must exist");
  assert.ok(end > start, "the report section must follow the decline section");
  return skill.slice(start, end);
}

test("documents the decline path for non-actionable findings", () => {
  const decline = declineSection();

  assert.match(decline, /`unsupported`, `already-fixed`, or `stale`/);
  assert.match(decline, /whose thread is still open/);
  assert.match(decline, /ask for no per-PR confirmation/);
  assert.match(decline, /already resolved is\s+a no-op with no write/);
  assertInOrder(decline, [/Reply through the same endpoint/, /`in_reply_to`/, /exactly one `resolveReviewThread`/]);
  assert.match(decline, /`node\(id: \$threadId\)`/);
  assert.match(decline, /classification, the exact evidence/);
  assert.doesNotMatch(skill, /only findings proven fixed/);
  assert.doesNotMatch(skill, /Keep stale, unsupported,\s+and unresolved findings visible/);
});

test("pins decline head handling, mixed threads, stops, recovery, and the report", () => {
  const decline = declineSection();
  const report = skill.slice(skill.indexOf("## Report"));

  assert.match(decline, /Read the PR head once before\s+the first reply and the resolve/);
  assert.match(decline, /expected and\s+observed SHAs, post no reply, and make no resolution claim/);
  assert.match(decline, /set the\s+reply's `commit_id` to that revalidated head/);
  assert.match(decline, /three-ref convergence wait/);
  assert.match(
    decline,
    /one reply that lists the fixed items with\s+the commit and the verification command and gives a reason for each declined\s+item/,
  );
  assert.match(decline, /a mismatched head, or an unresolved readback stops the workflow/);
  assert.match(decline, /no resolution claim, and the thread unchanged/);
  assert.match(decline, /reads the thread back first/);
  assert.match(decline, /never posts a duplicate reply/);
  assert.match(report, /declined finding IDs each with its classification\s+and evidence/);
  assert.match(report, /resolved thread IDs/);
});
