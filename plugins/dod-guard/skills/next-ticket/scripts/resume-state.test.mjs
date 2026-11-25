import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runCli } from "./resume-state.mjs";
import { classify, pickTip } from "./resume-state-classify.mjs";

const ME = "TychoHenzen";
const TIP = "6d6c8aa1b2c3d4e5f60718293a4b5c6d7e8f9012";
const TIP_DATE = "2026-11-05T10:00:00Z";
const BEFORE = "2026-11-05T09:00:00Z";
const AFTER = "2026-11-05T12:00:00Z";
const STRANGER = { login: "stranger", association: "NONE" };
const MATRIX = (head) => `## Acceptance matrix\n\n\`\`\`json\n[{"id":"R1","headSha":"${head}"}]\n\`\`\`\n`;

function comment({ id, createdAt, body, login = ME, association = "OWNER" }) {
  return { id, created_at: createdAt, user: { login }, author_association: association, body };
}
const handoffBody = (head) => `## Implementation handoff\n\n- task-1 done\n\n${MATRIX(head)}`;
const handoff = (id, head, login = ME) => comment({ id, createdAt: AFTER, body: handoffBody(head), login });
const planBody = (task) => `## Step plan: ${task}\n\nbody`;
const plan = (id, createdAt, { task = "task-2", login = ME, association = "OWNER" } = {}) =>
  comment({ id, createdAt, body: planBody(task), login, association });
const stateOf = (comments, ahead = 3) => classify({ comments, login: ME, tip: TIP, tipDate: TIP_DATE, ahead }).state;

test("a handoff by the author that names the tip is live", () => {
  assert.equal(stateOf([handoff(1, "6d6c8aa")]), "live-handoff");
  assert.equal(stateOf([handoff(1, "6d6c8aa"), plan(2, BEFORE), plan(3, AFTER)]), "live-handoff");
});

test("a handoff at another head, or by another author, is not live", () => {
  assert.equal(stateOf([handoff(1, "1111111")]), "resumable");
  assert.equal(stateOf([handoff(1, "6d6c8aa", "someone-else")]), "resumable");
});

test("a task plan replaced after the tip on a branch that holds work is superseded", () => {
  const result = classify({
    comments: [plan(5, BEFORE), plan(6, AFTER)],
    login: ME,
    tip: TIP,
    tipDate: TIP_DATE,
    ahead: 3,
  });
  assert.equal(result.state, "superseded");
  assert.match(result.reason, /step plan comment 6 for task-2 replaced an earlier plan/);
});

test("a first plan for a task posted after the tip is not a replacement", () => {
  assert.equal(stateOf([plan(5, AFTER)]), "resumable");
  assert.equal(stateOf([plan(5, AFTER, { task: "task-1" }), plan(6, AFTER)]), "resumable");
});

test("a replacement before the tip, a branch with no work, or an untrusted author is not superseded", () => {
  assert.equal(stateOf([plan(5, "2026-11-05T08:00:00Z"), plan(6, BEFORE)]), "resumable");
  assert.equal(stateOf([plan(5, BEFORE), plan(6, AFTER)], 0), "resumable");
  assert.equal(stateOf([plan(5, BEFORE, STRANGER), plan(6, AFTER, STRANGER)]), "resumable");
});

function run(t, comments, extra = []) {
  const dir = mkdtempSync(path.join(tmpdir(), "resume-state-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "comments.json");
  writeFileSync(file, comments);
  const out = [];
  const err = [];
  const argv = [
    `--comments-file=${file}`,
    `--author=${ME}`,
    `--tip=${TIP}`,
    `--tip-date=${TIP_DATE}`,
    "--ahead=3",
    ...extra,
  ];
  const code = runCli(argv, {
    stdout: { write: (text) => out.push(text) },
    stderr: { write: (text) => err.push(text) },
  });
  return { code, out: out.join(""), err: err.join("") };
}

test("the command prints one JSON line for slurped pages and a plain array", (t) => {
  const pages = JSON.stringify([[plan(5, BEFORE)], [plan(6, AFTER)]]);
  const result = run(t, pages);
  assert.equal(result.code, 0, result.err);
  assert.equal(JSON.parse(result.out).state, "superseded");
  assert.equal(JSON.parse(run(t, "[]").out).state, "resumable");
});

test("the command exits 2 on malformed JSON, a non-array, and a bad --ahead", (t) => {
  assert.equal(run(t, "{oops").code, 2);
  assert.equal(run(t, "{}").code, 2);
  const bad = run(t, "[]", ["--ahead=-1"]);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /usage: node resume-state\.mjs/);
});

const ORIGIN = { tip: TIP, tipDate: TIP_DATE, ahead: 0 };
const LOCAL_TIP = "90177339aabbccddeeff00112233445566778899";
const LOCAL_DATE = "2026-11-05T11:00:00Z";
const local = (unpushed, behind) => ({ tip: LOCAL_TIP, tipDate: LOCAL_DATE, ahead: 2, unpushed, behind });

test("the tip is the local branch only when it holds commits its origin lacks", () => {
  assert.deepEqual(pickTip(ORIGIN, undefined), ORIGIN);
  assert.deepEqual(pickTip(ORIGIN, local(0, 0)), ORIGIN);
  assert.deepEqual(pickTip(ORIGIN, local(0, 4)), ORIGIN);
  assert.deepEqual(pickTip(ORIGIN, local(2, 0)), { tip: LOCAL_TIP, tipDate: LOCAL_DATE, ahead: 2 });
  assert.throws(() => pickTip(ORIGIN, local(2, 1)), /diverged \(2 unpushed, 1 not pulled\)/);
});

const LOCAL_FLAGS = (unpushed, behind) => [
  `--local-tip=${LOCAL_TIP}`,
  `--local-tip-date=${LOCAL_DATE}`,
  "--local-ahead=2",
  `--unpushed=${unpushed}`,
  `--behind=${behind}`,
];

test("unpushed work written before a replaced plan reads superseded although origin holds no work", (t) => {
  const replaced = JSON.stringify([plan(5, BEFORE), plan(6, AFTER)]);
  assert.equal(JSON.parse(run(t, replaced, ["--ahead=0"]).out).state, "resumable");
  const result = run(t, replaced, ["--ahead=0", ...LOCAL_FLAGS(2, 0)]);
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(JSON.parse(result.out), {
    state: "superseded",
    reason: `step plan comment 6 for task-2 replaced an earlier plan after the branch tip ${LOCAL_TIP}`,
  });
});

test("a local branch at its origin keeps the pushed tip, so its handoff stays live", (t) => {
  const result = run(t, JSON.stringify([handoff(1, "6d6c8aa")]), LOCAL_FLAGS(0, 0));
  assert.equal(JSON.parse(result.out).state, "live-handoff");
});

test("the command exits 2 on partial local flags, a bad local count, and a diverged branch", (t) => {
  assert.equal(run(t, "[]", LOCAL_FLAGS(2, 0).slice(1)).code, 2);
  assert.equal(run(t, "[]", LOCAL_FLAGS(-1, 0)).code, 2);
  const diverged = run(t, "[]", LOCAL_FLAGS(2, 1));
  assert.equal(diverged.code, 2);
  assert.match(diverged.err, /have diverged/);
});
