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
  const replySection =
    updateSection.match(
      /Otherwise reply through([\s\S]*?)Do\s+not use the legacy/,
    )?.[1] ?? "";
  const inlineSection =
    updateSection.match(
      /For a\s+new inline review comment([\s\S]*?)REST cannot resolve a thread/,
    )?.[1] ?? "";

  assert.notEqual(replySection, "");
  assert.notEqual(inlineSection, "");
  assert.match(
    replySection,
    /POST \/repos\/\{owner\}\/\{repo\}\/pulls\/\{pull_number\}\/comments/,
  );
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
  assert.match(
    readbackSection,
    /pulls\/\{pull_number\}\/comments\?per_page=100&page=N/,
  );
  assert.match(
    readbackSection,
    /pagination until every selected root comment is present/,
  );
  assert.match(
    readbackSection,
    /authentication failure,\s+rate limit \(403\/429\)/,
  );
  assert.match(
    readbackSection,
    /Do not request the unsupported\s+`PullRequestReviewComment\.inReplyTo` field/,
  );
  assert.match(
    updateSection,
    /`threadId` comes from the\s+thread metadata read under "Resolve the input"/,
  );
  const readbackOffset = updateSection.indexOf(
    "Read back the exact review thread",
  );
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
