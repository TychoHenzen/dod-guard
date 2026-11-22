import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: the test reads its fixture body from disk
import { readFileSync } from "node:fs";
import test from "node:test";
import { body904 } from "./harness/issue-body-fixtures.mjs";
import { bodyToChange, changeToBody, issueIds, renderBody } from "./openspec-issue-map.mjs";

const fixture = readFileSync(new URL("./fixtures/openspec-shaped-body.md", import.meta.url), "utf8");

const WHY = "A player can draw past the hand limit, so the rules engine and the view disagree about the hand.";

function body({ requirements, criteria }) {
  return [
    "## Why",
    "",
    WHY,
    "",
    "## What Changes",
    "",
    "- Refuse a draw past the limit.",
    "",
    "## Design",
    "",
    "The rules engine owns the limit.",
    "",
    "## Implementation notes",
    "",
    "### requirements",
    "",
    ...requirements,
    "",
    "## Acceptance criteria",
    "",
    ...criteria,
    "",
    "## Verification",
    "",
    "- Run the draw tests.",
    "",
  ].join("\n");
}

const LIMIT = "- R-1 (ADDED, card-rules) Hand size limit: The game SHALL reject a draw that exceeds seven cards.";
const REASON = "- R-2 (ADDED, card-rules) Refusal reason: The draw SHALL report `hand-full` when it is refused.";

test("maps one ADDED requirement with one scenario into a delta spec", () => {
  const change = bodyToChange(
    body({
      requirements: [LIMIT],
      criteria: ["- [ ] AC-1 (R-1) Draw at limit: WHEN the hand holds seven cards THEN the draw is refused"],
    }),
  );

  assert.deepEqual(change.problems, []);
  assert.equal(change.legacy, false);
  assert.deepEqual(Object.keys(change.specs), ["card-rules"]);
  assert.equal(
    change.specs["card-rules"],
    [
      "## ADDED Requirements",
      "",
      "### Requirement: Hand size limit",
      "The game SHALL reject a draw that exceeds seven cards.",
      "",
      "#### Scenario: Draw at limit",
      "- **WHEN** the hand holds seven cards",
      "- **THEN** the draw is refused",
      "",
    ].join("\n"),
  );
  assert.deepEqual(change.sourceMap, [
    { file: "specs/card-rules/spec.md", line: 3, id: "R-1", name: "Hand size limit" },
    { file: "specs/card-rules/spec.md", line: 6, id: "AC-1", name: "Draw at limit" },
  ]);
  assert.match(change.proposal, /^## Why\n\nA player can draw/);
  assert.match(change.proposal, /\n## What Changes\n\n- Refuse a draw past the limit\.\n$/);
  assert.match(change.design, /The rules engine owns the limit\./);
});

test("adds a checkbox that cites two requirements as a scenario of both", () => {
  const change = bodyToChange(
    body({
      requirements: [LIMIT, REASON],
      criteria: [
        "- [ ] AC-1 (R-1, R-2) Draw at limit: WHEN the hand holds seven cards THEN the draw is refused with `hand-full`",
      ],
    }),
  );

  assert.deepEqual(change.problems, []);
  const scenarios = change.specs["card-rules"].match(/#### Scenario: Draw at limit/g);
  assert.equal(scenarios.length, 2);
  assert.deepEqual(
    change.sourceMap.filter((entry) => entry.id === "AC-1").map((entry) => entry.line),
    [6, 13],
  );
});

test("reports a requirement that no checkbox cites, by id", () => {
  const change = bodyToChange(
    body({
      requirements: [LIMIT, REASON],
      criteria: ["- [ ] AC-1 (R-1) Draw at limit: WHEN the hand holds seven cards THEN the draw is refused"],
    }),
  );

  assert.deepEqual(change.problems, [{ id: "R-2", message: "R-2 is cited by no acceptance criterion" }]);
  assert.doesNotMatch(change.specs["card-rules"].split("### Requirement: Refusal reason")[1], /#### Scenario/);
});

test("reports a statement without SHALL or MUST, by id", () => {
  const change = bodyToChange(
    body({
      requirements: ["- R-1 (ADDED, card-rules) Hand size limit: The game rejects a draw that exceeds seven cards."],
      criteria: ["- [ ] AC-1 (R-1) Draw at limit: WHEN the hand holds seven cards THEN the draw is refused"],
    }),
  );

  assert.deepEqual(change.problems, [{ id: "R-1", message: "R-1 statement uses neither SHALL nor MUST" }]);
});

test("marks a legacy body with Outcome and untagged requirements as legacy", () => {
  const change = bodyToChange(body904);

  assert.equal(change.legacy, true);
  assert.deepEqual(change.requirements, []);
  assert.deepEqual(change.specs, {});
  assert.deepEqual(change.problems, [
    { id: null, message: "no requirement names an operation and a capability; the body uses the legacy form" },
  ]);
});

test("refuses a RENAMED requirement, whose old name the bullet grammar cannot carry", () => {
  const change = bodyToChange(
    body({
      requirements: ["- R-1 (RENAMED, card-rules) Hand limit: The game SHALL reject a draw past seven cards."],
      criteria: ["- [ ] AC-1 (R-1) Draw at limit: WHEN the hand holds seven cards THEN the draw is refused"],
    }),
  );

  assert.deepEqual(change.problems, [
    { id: "R-1", message: "R-1 is RENAMED, but the bullet grammar has no place for the old requirement name" },
  ]);
});

test("reports an untagged requirement and a criterion outside the WHEN ... THEN form", () => {
  const change = bodyToChange(
    body({
      requirements: [LIMIT, "- R-2 The draw reports why it was refused."],
      criteria: ["- [ ] AC-1 (R-1, R-2) The draw is refused at seven cards."],
    }),
  );

  assert.deepEqual(change.problems, [
    { id: "R-2", message: "R-2 does not name an operation and a capability" },
    { id: "AC-1", message: 'AC-1 is not in the "<scenario>: WHEN ... THEN ..." form' },
    { id: "R-1", message: "R-1 is cited by no acceptance criterion" },
  ]);
});

test("maps the OpenSpec-shaped fixture body with no problem", () => {
  const change = bodyToChange(fixture);

  assert.deepEqual(change.problems, []);
  assert.deepEqual(Object.keys(change.specs), ["card-rules", "hand-view"]);
  assert.match(change.specs["hand-view"], /^## MODIFIED Requirements\n/);
  assert.match(change.tasks, /- \[ \] 1\.1 Enforce the hand size limit in the draw action/);
});

test("ties an OpenSpec issue to ids by capability path and quoted requirement name", () => {
  const change = bodyToChange(fixture);

  assert.deepEqual(issueIds(change, { path: "card-rules/spec.md", message: 'ADDED "Refusal reason" must ...' }), [
    "R-2",
  ]);
  assert.deepEqual(issueIds(change, { path: "card-rules/spec.md", message: "no quoted name" }), ["R-1", "R-2"]);
  assert.deepEqual(issueIds(change, { path: "card-rules/spec.md", line: 7, message: "x" }), ["AC-1"]);
  assert.deepEqual(issueIds(change, { path: "proposal.md", message: "Why section must be ..." }), []);
});

const ROUND_TRIP_SPEC = [
  "## ADDED Requirements",
  "",
  "### Requirement: Hand size limit",
  "The game SHALL reject a draw that exceeds seven cards.",
  "",
  "#### Scenario: Draw at limit",
  "- **WHEN** the hand holds seven cards",
  "- **THEN** the draw is refused",
  "",
  "### Requirement: Refusal reason",
  "The draw SHALL report `hand-full` when it is refused.",
  "",
  "#### Scenario: Draw at limit",
  "- **WHEN** the hand holds seven cards",
  "- **THEN** the draw is refused",
  "",
  "#### Scenario: Draw below limit",
  "- **WHEN** the hand holds six cards",
  "- **THEN** the draw succeeds",
  "",
].join("\n");

test("changeToBody then bodyToChange returns the same delta spec", () => {
  const files = {
    proposal: `## Why\n\n${WHY}\n\n## What Changes\n\n- Refuse a draw past the limit.\n\n## Impact\n\n- Rules engine.\n`,
    design: "## Context\n\nThe rules engine owns the limit.\n",
    specs: { "card-rules": ROUND_TRIP_SPEC },
    tasks: "## 1. Domain rules (slice: hand-size-limit)\n\n- [ ] 1.1 Enforce the limit\n",
  };
  const mapped = changeToBody(files);
  const back = bodyToChange(renderBody(mapped.sections));

  assert.deepEqual(mapped.problems, []);
  assert.deepEqual(back.problems, []);
  assert.equal(back.specs["card-rules"], ROUND_TRIP_SPEC);
  assert.match(mapped.sections.find((section) => section.heading === "Design").text, /^### Context$/m);
  assert.match(back.design, /^## Context$/m);
  assert.match(
    mapped.sections.find((section) => section.heading === "Acceptance criteria").text,
    /^- \[ \] AC-1 \(R-1, R-2\) Draw at limit: WHEN the hand holds seven cards THEN the draw is refused$/m,
  );
  assert.deepEqual(bodyToChange(renderBody(changeToBody(files).sections)), back);
});
