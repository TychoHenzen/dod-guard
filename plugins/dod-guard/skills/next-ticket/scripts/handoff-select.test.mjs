import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runCli } from "./handoff-select.mjs";

const ME = "TychoHenzen";

function comment(id, createdAt, text) {
  return { id, created_at: createdAt, user: { login: ME }, body: `## Implementation handoff\n\n${text}\n` };
}

function sink() {
  const chunks = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join("") };
}

function run(pages, extra = []) {
  const dir = mkdtempSync(path.join(tmpdir(), "handoff-select-"));
  const comments = path.join(dir, "comments.json");
  writeFileSync(comments, JSON.stringify(pages));
  const stdout = sink();
  const stderr = sink();
  const code = runCli(
    [`--comments-file=${comments}`, `--author=${ME}`, `--output-dir=${path.join(dir, "out")}`, ...extra],
    { stdout, stderr },
  );
  return { code, dir, stdout: stdout.text(), stderr: stderr.text() };
}

test("writes the demoted text of the stale handoff and names the kept one", () => {
  const stale = comment(10, "2026-10-29T11:17:35Z", "- stale");
  const current = comment(11, "2026-10-29T11:24:06Z", "- current");
  const result = run([[stale], [current]]);
  try {
    assert.equal(result.code, 0);
    const plan = JSON.parse(result.stdout);
    assert.deepEqual(plan.keep, { id: 11 });
    assert.equal(plan.superseded.length, 1);
    assert.match(readFileSync(plan.superseded[0].file, "utf8"), /^## Superseded handoff \(head unknown\)/);
  } finally {
    rmSync(result.dir, { recursive: true, force: true });
  }
});

function cleanup(result) {
  rmSync(result.dir, { recursive: true, force: true });
}

test("accepts one plain array as well as paginated pages", () => {
  const result = run([
    comment(10, "2026-10-29T11:17:35Z", "- stale"),
    comment(11, "2026-10-29T11:24:06Z", "- current"),
  ]);
  try {
    assert.equal(result.code, 0);
    const plan = JSON.parse(result.stdout);
    assert.deepEqual(plan.keep, { id: 11 });
    assert.deepEqual(
      plan.superseded.map(({ id }) => id),
      [10],
    );
  } finally {
    cleanup(result);
  }
});

test("lists a handoff-headed comment by another author as ignored and writes no file for it", () => {
  const foreign = { ...comment(12, "2026-10-29T11:30:00Z", "- foreign"), user: { login: "someone-else" } };
  const result = run([[comment(11, "2026-10-29T11:24:06Z", "- current"), foreign]]);
  try {
    assert.equal(result.code, 0);
    const plan = JSON.parse(result.stdout);
    assert.deepEqual(plan.keep, { id: 11 });
    assert.deepEqual(plan.superseded, []);
    assert.deepEqual(plan.ignored, [12]);
  } finally {
    cleanup(result);
  }
});

test("exits 1 and writes no file when a handoff comment has no usable id or time", () => {
  const broken = { ...comment(10, "2026-10-29T11:17:35Z", "- broken"), created_at: "not a time" };
  const result = run([[broken, comment(11, "2026-10-29T11:24:06Z", "- current")]]);
  try {
    assert.equal(result.code, 1);
    assert.match(result.stderr, /handoff comment 10 has no numeric id or no created_at time/);
    assert.equal(result.stdout, "");
    assert.equal(existsSync(path.join(result.dir, "out")), false);
  } finally {
    cleanup(result);
  }
});

test("a second run over the demoted readback plans nothing more", () => {
  const first = run([
    [comment(10, "2026-10-29T11:17:35Z", "- stale"), comment(11, "2026-10-29T11:24:06Z", "- current")],
  ]);
  try {
    const plan = JSON.parse(first.stdout);
    const demoted = readFileSync(plan.superseded[0].file, "utf8");
    const readback = [
      { id: 10, created_at: "2026-10-29T11:17:35Z", user: { login: ME }, body: demoted },
      comment(11, "2026-10-29T11:24:06Z", "- current"),
    ];
    const second = run([readback]);
    try {
      assert.equal(second.code, 0);
      assert.deepEqual(JSON.parse(second.stdout), { keep: { id: 11 }, superseded: [], ignored: [] });
    } finally {
      cleanup(second);
    }
  } finally {
    cleanup(first);
  }
});

test("exits 1 and names the problem when no handoff comment exists", () => {
  const result = run([[{ id: 1, created_at: "2026-10-29T11:17:35Z", user: { login: ME }, body: "hello" }]]);
  try {
    assert.equal(result.code, 1);
    assert.match(result.stderr, /no comment by TychoHenzen starts with the ## Implementation handoff heading/);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(result.dir, { recursive: true, force: true });
  }
});

test("exits 2 on an unknown option or a missing one", () => {
  const unknown = run([[]], ["--force=true"]);
  const missing = runCli([], { stdout: sink(), stderr: sink() });
  try {
    assert.equal(unknown.code, 2);
    assert.match(unknown.stderr, /unknown option --force/);
    assert.equal(missing, 2);
  } finally {
    rmSync(unknown.dir, { recursive: true, force: true });
  }
});
