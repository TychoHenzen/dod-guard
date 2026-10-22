import assert from "node:assert/strict";
import test from "node:test";
import { assessGitHubSnapshot } from "./inspect-repository.mjs";

test("blocks ambiguous linked Project state", () => {
  const assessment = assessGitHubSnapshot({
    projects: [
      { closed: false, statusOptions: ["Backlog", "Todo", "In Progress", "Done"] },
      { closed: false, statusOptions: ["Backlog", "Todo", "In Progress", "Done"] },
    ],
    checks: [{ name: "test", conclusion: "SUCCESS" }],
  });

  assert.equal(assessment.readyForProtection, false);
  assert.match(assessment.blockers[0], /exactly one open linked Project, found 2/);
  assert.equal(assessment.protectionPayload, null);
});

const EXPECTED_ONE_PROJECT = "expected exactly one open linked Project, found";

test("applies the shared linked-Project count rule to zero, one, and two open Projects", () => {
  const statusOptions = ["Backlog", "Todo", "In Progress", "Done"];
  const checks = [{ name: "test", conclusion: "SUCCESS" }];
  const assess = (projects) => assessGitHubSnapshot({ projects, checks });
  const isProjectBlocker = (blocker) => blocker.includes("linked Project");
  const projectBlocker = ({ blockers }) => blockers.find(isProjectBlocker);

  for (const projects of [[], [{ closed: true, statusOptions }]]) {
    const none = assess(projects);
    assert.equal(none.readyForProtection, false);
    assert.equal(projectBlocker(none), `${EXPECTED_ONE_PROJECT} 0`);
  }

  const one = assess([
    { closed: false, statusOptions },
    { closed: true, statusOptions },
  ]);
  assert.equal(one.readyForProtection, true);
  assert.equal(projectBlocker(one), undefined);

  const two = assess([
    { closed: false, statusOptions },
    { closed: false, statusOptions },
  ]);
  assert.equal(two.readyForProtection, false);
  assert.equal(projectBlocker(two), `${EXPECTED_ONE_PROJECT} 2`);
});

test("blocks protection after a failed check", () => {
  const assessment = assessGitHubSnapshot({
    projects: [{ closed: false, statusOptions: ["Backlog", "Todo", "In Progress", "Done"] }],
    checks: [{ name: "build-test", conclusion: "FAILURE" }],
  });

  assert.equal(assessment.readyForProtection, false);
  assert.ok(assessment.blockers.includes("check build-test concluded FAILURE"));
  assert.equal(assessment.protectionPayload, null);
});

test("turns malformed GitHub snapshots into a safe protection stop", () => {
  const assessment = assessGitHubSnapshot({
    projects: [{ closed: undefined, statusOptions: "Done" }],
    checks: [{ name: "build-test", conclusion: "SUCCESS" }, null],
  });

  assert.equal(assessment.readyForProtection, false);
  assert.ok(assessment.blockers.includes("expected exactly one open linked Project, found 0"));
  assert.ok(assessment.blockers.includes("check result is missing or malformed"));
  assert.ok(assessment.blockers.includes("required check names are missing or duplicated"));
  assert.equal(assessment.protectionPayload, null);
  assert.deepEqual(assessGitHubSnapshot(null), {
    readyForProtection: false,
    blockers: ["GitHub snapshot must be an object"],
    requiredChecks: [],
    protectionPayload: null,
  });
});

test("builds strict protection from successful observed check names", () => {
  const assessment = assessGitHubSnapshot({
    projects: [{ closed: false, statusOptions: ["Backlog", "Todo", "In Progress", "Done"] }],
    checks: [
      { name: "test", conclusion: "SUCCESS" },
      { name: "lint", conclusion: "SUCCESS" },
    ],
  });

  assert.equal(assessment.readyForProtection, true);
  assert.deepEqual(assessment.requiredChecks, ["lint", "test"]);
  assert.deepEqual(assessment.protectionPayload.required_status_checks, {
    strict: true,
    contexts: ["lint", "test"],
  });
  assert.deepEqual(assessment.protectionPayload.required_pull_request_reviews, {
    required_approving_review_count: 0,
  });
  assert.equal(assessment.protectionPayload.enforce_admins, true);
  assert.equal(assessment.protectionPayload.allow_force_pushes, false);
  assert.equal(assessment.protectionPayload.allow_deletions, false);
});

const STATUS_OPTIONS = ["Backlog", "Todo", "In Progress", "Done"];
const PASSING_CHECK = { name: "a", conclusion: "SUCCESS" };
const OPEN_PROJECT = [{ closed: false, statusOptions: STATUS_OPTIONS }];

function blocked(blockers, requiredChecks) {
  return { readyForProtection: false, blockers, requiredChecks, protectionPayload: null };
}

test("flags a non-array Project list and still counts zero open Projects", () => {
  assert.deepEqual(
    assessGitHubSnapshot({ projects: "x", checks: [PASSING_CHECK] }),
    blocked(["linked Project snapshot is missing or malformed", `${EXPECTED_ONE_PROJECT} 0`], ["a"]),
  );
});

test("flags missing status options on the single open Project", () => {
  assert.deepEqual(
    assessGitHubSnapshot({ projects: [{ closed: false }], checks: [PASSING_CHECK] }),
    blocked(
      [
        "linked Project status options are missing or malformed",
        "expected one Backlog status, found 0",
        "expected one Todo status, found 0",
        "expected one In Progress status, found 0",
        "expected one Done status, found 0",
      ],
      ["a"],
    ),
  );
});

test("requires exactly one case-insensitive match for each required status", () => {
  const statusOptions = ["Backlog", "todo", "TODO", 5, "Done"];
  assert.deepEqual(
    assessGitHubSnapshot({ projects: [{ closed: false, statusOptions }], checks: [PASSING_CHECK] }),
    blocked(["expected one Todo status, found 2", "expected one In Progress status, found 0"], ["a"]),
  );
});

test("treats a non-array or empty check list as no results", () => {
  assert.deepEqual(
    assessGitHubSnapshot({ projects: OPEN_PROJECT, checks: "x" }),
    blocked(["check snapshot is missing or malformed", "no required check results were supplied"], []),
  );
  assert.deepEqual(
    assessGitHubSnapshot({ projects: OPEN_PROJECT, checks: [] }),
    blocked(["no required check results were supplied"], []),
  );
});

test("names unnamed checks and reports an unknown conclusion", () => {
  assert.deepEqual(
    assessGitHubSnapshot({ projects: OPEN_PROJECT, checks: [{ conclusion: "FAILURE" }, { name: 7 }] }),
    blocked(
      [
        "check <unnamed> concluded FAILURE",
        "check <unnamed> concluded unknown",
        "required check names are missing or duplicated",
      ],
      [],
    ),
  );
});

test("blocks duplicate and empty check names", () => {
  assert.deepEqual(
    assessGitHubSnapshot({ projects: OPEN_PROJECT, checks: [PASSING_CHECK, PASSING_CHECK] }),
    blocked(["required check names are missing or duplicated"], ["a"]),
  );
  assert.deepEqual(
    assessGitHubSnapshot({ projects: OPEN_PROJECT, checks: [{ name: "", conclusion: "SUCCESS" }] }),
    blocked(["required check names are missing or duplicated"], []),
  );
});
