import assert from "node:assert/strict";
import { test } from "node:test";
import { selectHandoff } from "./handoff-comments.mjs";

const ME = "TychoHenzen";
const NO_OWN_HANDOFF = "no comment by TychoHenzen starts with the ## Implementation handoff heading";

function matrix(head) {
  return `## Acceptance matrix\n\n\`\`\`json\n[{"id":"R1","headSha":"${head}"}]\n\`\`\`\n`;
}

function comment(id, createdAt, body) {
  return { id, created_at: createdAt, user: { login: ME }, body };
}

function by(login, base) {
  return { ...base, user: { login } };
}

const STALE = comment(1, "2026-10-29T11:17:35Z", `## Implementation handoff\n\n- old\n\n${matrix("ed0b3c5aaaa")}`);
const CURRENT = comment(2, "2026-10-29T11:24:06Z", `## Implementation handoff\n\n- new\n\n${matrix("6b541cfbbbb")}`);

test("keeps the newest handoff and demotes the stale earliest one", () => {
  const plan = selectHandoff([STALE, CURRENT], ME);
  assert.deepEqual(plan.keep, { id: 2 });
  assert.equal(plan.superseded.length, 1);
  assert.equal(plan.superseded[0].id, 1);
  assert.match(plan.superseded[0].body, /^## Superseded handoff \(head ed0b3c5\)\n\n/);
  assert.match(plan.superseded[0].body, /Superseded by the handoff comment at head 6b541cf \(comment 2\)\./);
  assert.match(plan.superseded[0].body, /- old/);
  assert.doesNotMatch(plan.superseded[0].body, /^## Implementation handoff/m);
});

test("the order of the list does not change which handoff is kept", () => {
  assert.deepEqual(selectHandoff([CURRENT, STALE], ME).keep, { id: 2 });
});

test("one handoff plans no demotion and non-handoff comments are ignored", () => {
  const other = by("someone", comment(3, "2026-10-30T00:00:00Z", "## Step plan: T1\n\nbody"));
  const quoted = by("someone", comment(4, "2026-10-30T00:00:00Z", "see\n## Implementation handoff\nquoted"));
  assert.deepEqual(selectHandoff([STALE, other, quoted], ME), { keep: { id: 1 }, superseded: [], ignored: [] });
});

test("equal creation times fall back to the larger comment id", () => {
  const first = comment(5, "2026-10-29T11:24:06Z", "## Implementation handoff\n\na");
  const second = comment(6, "2026-10-29T11:24:06Z", "## Implementation handoff\n\nb");
  assert.deepEqual(selectHandoff([second, first], ME).keep, { id: 6 });
});

test("a demoted comment without a matrix head says unknown", () => {
  const plan = selectHandoff([comment(7, "2026-10-01T00:00:00Z", "## Implementation handoff\n\nx"), CURRENT], ME);
  assert.match(plan.superseded[0].body, /^## Superseded handoff \(head unknown\)/);
});

test("plans nothing when no comment is a handoff", () => {
  assert.deepEqual(selectHandoff([], ME).errors, [NO_OWN_HANDOFF]);
});

test("plans nothing when a handoff comment is malformed", () => {
  const undated = { id: 9, user: { login: ME }, body: "## Implementation handoff\n\nx" };
  assert.deepEqual(selectHandoff([undated], ME).errors, ["handoff comment 9 has no numeric id or no created_at time"]);
});

test("a handoff comment by another author is ignored, never kept and never demoted", () => {
  const foreign = by("mallory", comment(8, "2026-10-29T11:30:00Z", "## Implementation handoff\n\nx"));
  assert.deepEqual(selectHandoff([STALE, foreign], ME), { keep: { id: 1 }, superseded: [], ignored: [8] });
  assert.deepEqual(selectHandoff([foreign], ME).errors, [NO_OWN_HANDOFF]);
});

test("a second run on the demoted comments keeps the same handoff and plans nothing more", () => {
  const first = selectHandoff([STALE, CURRENT], ME);
  const demoted = { ...STALE, body: first.superseded[0].body };
  assert.deepEqual(selectHandoff([demoted, CURRENT], ME), { keep: { id: 2 }, superseded: [], ignored: [] });
});
