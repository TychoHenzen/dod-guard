// biome-ignore-all lint/style/useNamingConvention: object keys mirror the GitHub REST field names.
import assert from "node:assert/strict";
import test from "node:test";
import { appliedGitHub } from "./fixtures/closure-applied-github.mjs";
import { builtSnapshot, closureJson, selectNextOf } from "./fixtures/closure-cli.mjs";
import {
  BEEHAIVE,
  crossRepositoryFixture,
  deliveredFixture,
  ORIGINAL,
  ROOT,
  roundTripFixture,
} from "./fixtures/closure-round-trip-routes.mjs";
import { DELIVERIES, FOREIGN_REPOSITORY, holdOf, REPOSITORY } from "./lib/closure.test-support.mjs";
import { OWNER } from "./lib/fixtures/rest-shapes.mjs";

const STATUS_WRITE = [
  "api",
  "--method",
  "PATCH",
  `users/${OWNER}/projectsV2/2/items/7771`,
  "-F",
  "fields[][id]=101",
  "-f",
  "fields[][value]=opt-done",
];

function projectWritesOf(github) {
  const items = `users/${OWNER}/projectsV2/2/items/`;
  return github.calls.filter((args) => args.includes("PATCH") && args.some((value) => String(value).startsWith(items)));
}

test("appliedGitHub answers an unknown issue or Project item with a gh failure", () => {
  const github = appliedGitHub(deliveredFixture());
  const issue = `repos/${REPOSITORY}/issues/999`;
  assert.deepEqual(github.runner(["api", issue]), {
    status: 1,
    stdout: "",
    stderr: `no issue in ${issue}`,
  });
  const patch = (itemId, option) => [
    "api",
    "--method",
    "PATCH",
    `users/${OWNER}/projectsV2/2/items/${itemId}`,
    "-F",
    "fields[][id]=101",
    "-f",
    `fields[][value]=${option}`,
  ];
  const unknownItem = `users/${OWNER}/projectsV2/2/items/424242`;
  assert.deepEqual(github.runner(patch(424_242, "opt-done")), {
    status: 1,
    stdout: "",
    stderr: `no Project item or option in ${unknownItem}`,
  });
  const unknownOption = `users/${OWNER}/projectsV2/2/items/7771`;
  assert.deepEqual(github.runner(patch(7771, "opt-nope")), {
    status: 1,
    stdout: "",
    stderr: `no Project item or option in ${unknownOption}`,
  });
});

test("AC-07: a built snapshot plans one verified close, applies it, and sets the original Done", async () => {
  const fixture = deliveredFixture();
  const { file } = await builtSnapshot(fixture.routes);

  const plan = closureJson(["plan", `--snapshot=${file}`]);
  assert.deepEqual(
    plan.closes.map(({ issue, rule, root, pullRequest, stateReason }) => [issue, rule, root, pullRequest, stateReason]),
    [[ORIGINAL, "replaced-original", ROOT, DELIVERIES[ROOT].pull, "completed"]],
  );
  assert.deepEqual([plan.holds, plan.reports, plan.statusRepairs], [[], [], []]);

  const github = appliedGitHub(fixture);
  const applied = closureJson(["apply", `--snapshot=${file}`], github.runner);
  assert.deepEqual(applied.applied, [ORIGINAL]);
  assert.deepEqual(projectWritesOf(github), [STATUS_WRITE]);
  const original = github.issues.get(ORIGINAL);
  assert.equal(original.state, "closed");
  assert.equal(original.state_reason, "completed");
  assert.equal(original.comments.length, 1);
  const status = github.items.find(({ node_id }) => node_id === `PVTI_${ORIGINAL}`).fields.find(({ id }) => id === 101);
  assert.equal(status.value.name.raw, "Done");
});

test("AC-03: a built delivery annotates to a complete group, and select-next reports no missing evidence", async () => {
  const { file } = await builtSnapshot(deliveredFixture().routes);
  const result = await selectNextOf(closureJson(["annotate", `--snapshot=${file}`]));
  assert.deepEqual(result.missingEvidence, []);
  assert.deepEqual(result.counts.missingEvidence, []);
  assert.equal(result.counts.balanced, true);
  assert.deepEqual(
    result.groups.find(({ rootIssueNumber }) => rootIssueNumber === ROOT),
    {
      rootIssueNumber: ROOT,
      kind: "complete",
      reasons: [],
    },
  );
  assert.deepEqual(result.selected.issueNumbers, [ORIGINAL]);
});

test("AC-06: snapshot, annotate, and select-next round trip", async () => {
  const { file } = await builtSnapshot(roundTripFixture().routes);
  const annotated = closureJson(["annotate", `--snapshot=${file}`]);
  const result = await selectNextOf(annotated);
  const group = (root) => result.groups.find(({ rootIssueNumber }) => rootIssueNumber === root);
  assert.deepEqual(group(840), { rootIssueNumber: 840, kind: "complete", reasons: [] });
  assert.equal(group(841).kind, "hold");
  assert.ok(
    group(841).reasons.includes("active checkpoint for issue #841 is not explicitly false"),
    group(841).reasons.join("; "),
  );
  assert.deepEqual(result.selected, { rootIssueNumber: 950, status: "Todo", issueNumbers: [950] });
  assert.deepEqual(result.missingEvidence, []);
});

test("AC-03: select-next holds #20 and #32 in their own groups and leaves #31 eligible", async () => {
  const { file, snapshot } = await builtSnapshot(crossRepositoryFixture().routes);
  assert.deepEqual(snapshot.issues.find(({ number }) => number === 20).children, [
    { repository: FOREIGN_REPOSITORY, number: 21 },
  ]);
  assert.deepEqual(snapshot.issues.find(({ number }) => number === 32).parent, { repository: BEEHAIVE, number: 31 });

  const plan = closureJson(["plan", `--snapshot=${file}`]);
  assert.deepEqual(plan.closes, []);
  assert.deepEqual(holdOf(plan, 20).reasons, ["cross-repository sub-issue TychoHenzen/DeepSeekCustom#21"]);
  assert.deepEqual(holdOf(plan, 32).reasons, ["cross-repository parent TychoHenzen/BeeHAIve#31"]);

  const result = await selectNextOf(closureJson(["annotate", `--snapshot=${file}`]));
  const group = (root) => result.groups.find(({ rootIssueNumber }) => rootIssueNumber === root);
  assert.equal(group(20).kind, "hold");
  assert.ok(group(20).reasons.includes("cross-repository sub-issue TychoHenzen/DeepSeekCustom#21"));
  assert.equal(group(32).kind, "hold");
  assert.ok(group(32).reasons.includes("cross-repository parent TychoHenzen/BeeHAIve#31"));
  assert.deepEqual(group(31), { rootIssueNumber: 31, kind: "eligible", reasons: [] });
  assert.deepEqual(result.selected.issueNumbers, [21]);
});
