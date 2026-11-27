// Tests for ordinary-proof.mjs: an ordinary pull request verifies, a structured ticket is sent to the
// structured sections (whose finalization proof still stops on missing records), and anything else is
// refused. The fake gh runner answers issue 61 and pull request 62.
// biome-ignore-all lint/correctness/noNodejsModules: node:test and node:assert are the test harness
import assert from "node:assert/strict";
import { test } from "node:test";
import { gate, parseError } from "../../next-ticket/scripts/testing/handoff-proof-harness.mjs";
import { HEAD } from "./lib/closure-legacy.fake-gh.mjs";
import { CRITERIA, ordinaryFixture, pullBody } from "./lib/ordinary.test-support.mjs";
import { runCli } from "./ordinary-proof.mjs";

const ARGS = ["--repository=o/r", "--pull=62", `--head-sha=${HEAD}`];

function sink() {
  const chunks = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join("") };
}

function prove(fx, argv = ARGS) {
  const stdout = sink();
  const stderr = sink();
  const status = runCli(argv, { runner: fx.runner, stdout, stderr });
  const out = stdout.text();
  return { status, json: out ? JSON.parse(out) : null, stderr: stderr.text() };
}

function writes(fx) {
  return fx.state.calls.filter((args) => args.includes("--method"));
}

test("an ordinary pull request with every criterion checked verifies and exits 0", () => {
  const fx = ordinaryFixture();
  const result = prove(fx);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.json, { outcome: "ordinary", pull: 62, issue: 61, headSha: HEAD });
  assert.deepEqual(writes(fx), []);
});

test("an unchecked criterion is refused with exit 1", () => {
  const fx = ordinaryFixture();
  fx.state.pull.body = pullBody({
    items: [
      [true, CRITERIA[0]],
      [false, CRITERIA[1]],
    ],
  });
  const result = prove(fx);
  assert.equal(result.status, 1);
  assert.equal(result.json.outcome, "refused");
  assert.deepEqual(result.json.reasons, [`acceptance criterion unchecked in the pull request body: ${CRITERIA[1]}`]);
});

test("a pull request at another head, closed, or closing no issue is refused before the issue is read", () => {
  const cases = [
    [(state) => Object.assign(state.pull.head, { sha: "c".repeat(40) }), `head is ${"c".repeat(40)}, not ${HEAD}`],
    [(state) => Object.assign(state.pull, { state: "closed" }), "is not open"],
    [(state) => Object.assign(state.pull, { body: "No keyword here." }), "body closes 0 issues in o/r"],
  ];
  for (const [change, reason] of cases) {
    const fx = ordinaryFixture();
    change(fx.state);
    const result = prove(fx);
    assert.equal(result.status, 1);
    assert.ok(
      result.json.reasons.some((text) => text.includes(reason)),
      JSON.stringify(result.json),
    );
    assert.ok(!fx.state.calls.some((args) => args.includes("repos/o/r/issues/61")));
  }
});

test("an issue with a structured record exits 3, and its finalization proof still stops on the missing records", async () => {
  const fx = ordinaryFixture();
  const body = `${fx.state.issue.body}\n## Implementation notes\n\n### requirements\n\n- R1 It works.\n`;
  fx.state.issue.body = body;
  const result = prove(fx);
  assert.equal(result.status, 3);
  assert.deepEqual(result.json, {
    outcome: "structured",
    pull: 62,
    issue: 61,
    headSha: HEAD,
    markers: ["issue #61 holds structured record requirements"],
  });
  const finalization = await gate("finalization", { body, checkpoint: null });
  assert.deepEqual(
    finalization,
    parseError([
      "missing clarifications record",
      "missing implementation-plan record",
      "missing task-list record",
      "missing lens-ownership record",
      "missing acceptance-evidence record",
      "missing planned-acceptance-matrix record",
    ]),
  );
});

test("a handoff comment sends the ticket to the structured sections even when the body looks ordinary", () => {
  const fx = ordinaryFixture();
  fx.state.comments.push({ id: 7, body: "## Implementation handoff\n\nx\n" });
  const result = prove(fx);
  assert.equal(result.status, 3);
  assert.deepEqual(result.json.markers, ["issue #61 has an implementation handoff comment"]);
});

test("bad options exit 2 with the usage, and a failed read exits 2", () => {
  const fx = ordinaryFixture();
  for (const argv of [[], ["--repository=o/r", "--pull=62", "--head-sha=abc"], ["--pull=x", ...ARGS.slice(1)]]) {
    const result = prove(fx, argv);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.startsWith("usage: ordinary-proof.mjs"), result.stderr);
  }
  const failing = { runner: () => ({ status: 1, stdout: "", stderr: "gh: Bad credentials (HTTP 401)" }) };
  const result = prove(failing);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^ordinary-proof failed: gh: Bad credentials/);
});
