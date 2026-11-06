import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { complete } from "./lib/review-pr.test-support.mjs";
import { judgedFindings } from "./lib/reviewer-results.mjs";

const LENSES = ["feature", "design", "reliability", "hygiene"];

// The model reads its definition, so the definition carries one literal result. The real
// validator judges that example, so a drift in either side fails here.
function shapeOf(lens) {
  const text = readFileSync(new URL(`../../../agents/review-pr-${lens}.md`, import.meta.url), "utf8");
  const block = text.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(block, `review-pr-${lens}.md has no json block`);
  return JSON.parse(block[1]);
}

function judge(shape, finding) {
  const assigned = new Map(LENSES.map((lens) => [`review-pr-${lens}`, new Set(["criterion:9"])]));
  assigned.set(shape.reviewer, new Set(shape.rulings.map((ruling) => ruling.slot)));
  return judgedFindings(complete([{ ...shape, findings: [finding] }], assigned), assigned);
}

for (const lens of LENSES) {
  test(`review-pr-${lens} shows a result the validator accepts`, () => {
    const shape = shapeOf(lens);
    assert.equal(shape.reviewer, `review-pr-${lens}`);
    assert.equal(judge(shape, shape.findings[0]).length, 1);
  });

  test(`review-pr-${lens} example is refused once any finding field is dropped`, () => {
    const shape = shapeOf(lens);
    assert.ok(Object.keys(shape.findings[0]).length >= 10);
    for (const field of Object.keys(shape.findings[0])) {
      const partial = Object.fromEntries(Object.entries(shape.findings[0]).filter(([name]) => name !== field));
      assert.throws(() => judge(shape, partial), Error, `dropping ${field} must be refused`);
    }
  });
}
