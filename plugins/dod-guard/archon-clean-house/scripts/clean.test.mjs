import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { commitAll, git, initRepo, scratch } from "../../archon-shared/scripts/testing.mjs";
import { approve, changes, checks, gate, NONE, options, ports, report } from "./clean.mjs";

function fixture(t) {
  const repo = initRepo(t, "clean-");
  mkdirSync(join(repo, "src"));
  const files = {
    "src/parser.js": "export const parse = (s) => s.trim();\n",
    "src/parser-v1.js": "export const parse = (s) => s;\n",
    "src/index.js": 'export { parse } from "./parser-v1.js";\n',
    "src/other.js": "export const other = 1;\n",
    "package.json": '{ "dependencies": { "left-pad": "1.0.0" } }\n',
  };
  for (const [path, text] of Object.entries(files)) {
    writeFileSync(join(repo, path), text);
  }
  commitAll(repo);
  return repo;
}

const GOOD = {
  id: "c1",
  label: "parser v1",
  confidence: "Strong",
  delete: ["src/parser-v1.js"],
  keep: ["src/parser.js"],
  edits: ["src/index.js"],
  dependencies: ["left-pad"],
  ports: ["abc1234 trims input"],
  created: "2026-01-01 vs 2026-03-01",
  references: 1,
  evidence: "only index.js imports it",
};

function candidates(dir, items, extra = {}) {
  writeFileSync(join(dir, "candidates.json"), JSON.stringify({ checks: "npm test", items, weak: ["w1"], ...extra }));
}

test("the form offers only valid Strong and Fair items, plus Delete nothing", (t) => {
  const repo = fixture(t);
  const dir = scratch(t, "clean-");
  candidates(dir, [
    GOOD,
    { ...GOOD, id: "c2", confidence: "Fair", gap: "" },
    { ...GOOD, id: "c3", confidence: "Weak" },
    { ...GOOD, id: "c4", delete: ["src/missing.js"] },
    { ...GOOD, id: "c5", edits: ["src/parser-v1.js"] },
    { ...GOOD, id: "c1" },
    { ...GOOD, id: "c6", confidence: "Fair", gap: "no test covers the old side" },
  ]);
  const form = options({ dir, repo });
  assert.deepEqual(
    form.options.map((choice) => choice.id),
    ["c1", "c6", NONE],
  );
  assert.equal(form.count, "2");
  assert.match(form.message, /A partial pick binds/);
  assert.match(form.message, /gap: no test covers the old side/);
  const { rejected } = JSON.parse(readFileSync(join(dir, "items.json"), "utf8"));
  assert.deepEqual(
    rejected.map((entry) => entry.id),
    ["c2", "c3", "c4", "c5", "c1"],
  );
  assert.equal(checks({ dir }), "npm test");
});

test("an answer approves the picked items, and Delete nothing approves none", (t) => {
  const repo = fixture(t);
  const dir = scratch(t, "clean-");
  candidates(dir, [GOOD, { ...GOOD, id: "c2", delete: ["src/other.js"], edits: [], ports: [] }]);
  options({ dir, repo });
  assert.deepEqual(approve({ dir, answer: JSON.stringify({ decisions: ["c1"], text: "" }) }), {
    count: "1",
    ports: "1",
  });
  assert.deepEqual(approve({ dir, answer: JSON.stringify({ decisions: ["c1", NONE] }) }), { count: "0", ports: "0" });
  assert.deepEqual(approve({ dir, answer: JSON.stringify({ decisions: [] }) }), { count: "0", ports: "0" });
});

test("the deletion gate keeps approved deletions, edits and manifests, and reverts the rest", (t) => {
  const repo = fixture(t);
  const dir = scratch(t, "clean-");
  candidates(dir, [GOOD]);
  options({ dir, repo });
  approve({ dir, answer: JSON.stringify({ decisions: ["c1"] }) });
  git(repo, ["rm", "-q", "src/parser-v1.js"]);
  writeFileSync(join(repo, "src/index.js"), 'export { parse } from "./parser.js";\n');
  writeFileSync(join(repo, "package.json"), '{ "dependencies": {} }\n');
  unlinkSync(join(repo, "src/other.js"));
  writeFileSync(join(repo, "src/new.js"), "new\n");
  const reverted = gate({ dir, repo });
  assert.deepEqual(reverted.map((entry) => entry.path).sort(), ["src/new.js", "src/other.js"]);
  assert.equal(existsSync(join(repo, "src/other.js")), true);
  assert.equal(existsSync(join(repo, "src/new.js")), false);
  assert.deepEqual(
    changes(repo)
      .map((entry) => `${entry.kind} ${entry.path}`)
      .sort(),
    ["deleted src/parser-v1.js", "modified package.json", "modified src/index.js"],
  );
});

test("the port gate reverts deletions and edits to dying files", (t) => {
  const repo = fixture(t);
  const dir = scratch(t, "clean-");
  candidates(dir, [GOOD]);
  options({ dir, repo });
  approve({ dir, answer: JSON.stringify({ decisions: ["c1"] }) });
  writeFileSync(join(repo, "src/parser.js"), "export const parse = (s) => s.trim().toLowerCase();\n");
  writeFileSync(join(repo, "src/parser-v1.js"), "changed\n");
  unlinkSync(join(repo, "src/other.js"));
  const reverted = ports({ dir, repo });
  assert.deepEqual(reverted.map((entry) => entry.path).sort(), ["src/other.js", "src/parser-v1.js"]);
  assert.deepEqual(
    changes(repo).map((entry) => entry.path),
    ["src/parser.js"],
  );
});

test("the report lists deletions, restorations, declined, rejected and weak items", (t) => {
  const repo = fixture(t);
  const dir = scratch(t, "clean-");
  candidates(dir, [
    GOOD,
    { ...GOOD, id: "c2", label: "other", delete: ["src/other.js"], edits: [], ports: [] },
    { id: "bad" },
  ]);
  options({ dir, repo });
  approve({ dir, answer: JSON.stringify({ decisions: ["c1"] }) });
  git(repo, ["rm", "-q", "src/parser-v1.js"]);
  const text = report({ dir, repo });
  assert.match(text, /c1 parser v1: deleted src\/parser-v1\.js; superseded by src\/parser\.js/);
  assert.match(text, /c1: abc1234 trims input/);
  assert.match(text, /c2 other: not approved/);
  assert.match(text, /bad : not offered/);
  assert.match(text, /Weak, left alone: w1/);
  git(repo, ["checkout", "HEAD", "--", "src/parser-v1.js"]);
  assert.match(report({ dir, repo }), /kept src\/parser-v1\.js, restored after the checks failed/);
});
