import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runCli } from "./handoff-select.mjs";

const ME = "TychoHenzen";
const STALE = ["2026-10-29T11:17:35Z", "- stale"];
const CURRENT = ["2026-10-29T11:24:06Z", "- current"];

function comment(id, [createdAt, text], login = ME) {
  return { id, created_at: createdAt, user: { login }, body: `## Implementation handoff\n\n${text}\n` };
}

function sink() {
  const chunks = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join("") };
}

function run(t, pages, extra = []) {
  const dir = mkdtempSync(path.join(tmpdir(), "handoff-select-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const comments = path.join(dir, "comments.json");
  writeFileSync(comments, JSON.stringify(pages));
  const stdout = sink();
  const stderr = sink();
  const argv = [`--comments-file=${comments}`, `--author=${ME}`, `--output-dir=${path.join(dir, "out")}`, ...extra];
  const code = runCli(argv, { stdout, stderr });
  return { code, dir, stdout: stdout.text(), stderr: stderr.text() };
}

test("writes the demoted text of the stale handoff and names the kept one", (t) => {
  const result = run(t, [[comment(10, STALE)], [comment(11, CURRENT)]]);
  assert.equal(result.code, 0);
  const plan = JSON.parse(result.stdout);
  assert.deepEqual(plan.keep, { id: 11 });
  assert.equal(plan.superseded.length, 1);
  assert.match(readFileSync(plan.superseded[0].file, "utf8"), /^## Superseded handoff \(head unknown\)/);
});

test("accepts one plain array as well as paginated pages", (t) => {
  const result = run(t, [comment(10, STALE), comment(11, CURRENT)]);
  assert.equal(result.code, 0);
  const plan = JSON.parse(result.stdout);
  assert.deepEqual(plan.keep, { id: 11 });
  assert.deepEqual(
    plan.superseded.map(({ id }) => id),
    [10],
  );
});

test("lists a handoff-headed comment by another author as ignored and plans nothing for it", (t) => {
  const result = run(t, [[comment(11, CURRENT), comment(12, CURRENT, "someone-else")]]);
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), { keep: { id: 11 }, superseded: [], ignored: [12] });
});

test("exits 1 and writes no file when a handoff comment has no usable time", (t) => {
  const broken = { ...comment(10, STALE), created_at: "not a time" };
  const result = run(t, [[broken, comment(11, CURRENT)]]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /handoff comment 10 has no numeric id or no created_at time/);
  assert.equal(result.stdout, "");
  assert.equal(existsSync(path.join(result.dir, "out")), false);
});

test("a second run over the demoted readback plans nothing more", (t) => {
  const first = run(t, [[comment(10, STALE), comment(11, CURRENT)]]);
  const demoted = readFileSync(JSON.parse(first.stdout).superseded[0].file, "utf8");
  const second = run(t, [[{ ...comment(10, STALE), body: demoted }, comment(11, CURRENT)]]);
  assert.equal(second.code, 0);
  assert.deepEqual(JSON.parse(second.stdout), { keep: { id: 11 }, superseded: [], ignored: [] });
});

test("exits 1 and names the problem when no handoff comment exists", (t) => {
  const result = run(t, [[{ id: 1, created_at: STALE[0], user: { login: ME }, body: "hello" }]]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /no comment by TychoHenzen starts with the ## Implementation handoff heading/);
  assert.equal(result.stdout, "");
});

test("exits 2 on an unknown option or a missing one", (t) => {
  const unknown = run(t, [[]], ["--force=true"]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /unknown option --force/);
  assert.equal(runCli([], { stdout: sink(), stderr: sink() }), 2);
});
