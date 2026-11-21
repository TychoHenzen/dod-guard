import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { commitAll, git, initRepo, scratch } from "../../archon-shared/scripts/testing.mjs";
import { advance, approve, bareName, gather, indexRows, NONE, options, report, target } from "./debug.mjs";

const SKILL = "plugins/p/skills/demo/SKILL.md";

function fixture(t) {
  const repo = initRepo(t, "debug-");
  mkdirSync(join(repo, "plugins", "p", "skills", "demo"), { recursive: true });
  mkdirSync(join(repo, "plugins", "p", "agents"), { recursive: true });
  writeFileSync(join(repo, SKILL), "# Demo\n\n1. Run the dry run unless the change is trivial.\n");
  writeFileSync(join(repo, "plugins", "p", "agents", "worker.md"), "Work.\n");
  commitAll(repo);
  return repo;
}

// Stand-ins for skill-debug's scripts: one session with two runs that start
// in the same minute, and one older session.
const INDEX = [
  "runs of demo, newest first",
  "",
  "1    2026-10-17 07:23  aaaa1111  proj",
  "       30 steps, 1 user, 0 err",
  "2    2026-10-16 22:32  aaaa1111  proj",
  "       12 steps, 0 user, 0 err",
  "3    2026-10-16 22:32  aaaa1111  proj",
  "       1 steps, 1 user, 0 err",
  "4    2026-10-01 10:00  bbbb2222  proj",
  "       8 steps, 0 user, 0 err",
].join("\n");
const RUNS = {
  aaaa1111: [
    ["2026-10-16 22:32", 1],
    ["2026-10-16 22:32", 12],
    ["2026-10-17 07:23", 30],
  ],
  bbbb2222: [["2026-10-01 10:00", 8]],
};

function standIns(t) {
  const dir = scratch(t, "debug-");
  writeFileSync(
    join(dir, "find-runs.mjs"),
    `process.stdout.write(${JSON.stringify(`${INDEX}\n`)}); process.exit(0);\n`,
  );
  writeFileSync(
    join(dir, "extract-run.mjs"),
    [
      `const runs = ${JSON.stringify(RUNS)};`,
      "const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];",
      "const list = runs[arg('session')] ?? [];",
      "const run = list[Number(arg('run')) - 1];",
      "if (!run) process.exit(4);",
      "const shown = Math.min(run[1], Number(arg('max-steps')));",
      "const steps = Array.from({ length: shown }, " +
        "(_, i) => `${String(i + 1).padStart(4)}  tool   Read step`).join('\\n');",
      "process.stdout.write(`skill demo\\nstarted ${run[0]}  records 1..2\\nboundary: end\\n" +
        "steps ${run[1]}  tool calls 1\\n\\n${steps}\\n`);",
    ].join("\n"),
  );
  return dir;
}

test("a qualified skill name reaches the same SKILL.md, and an installed copy is never the target", (t) => {
  const repo = fixture(t);
  const dir = scratch(t, "debug-");
  assert.equal(bareName("dod-guard:demo"), "demo");
  assert.equal(target({ dir, repo, skill: "dod-guard:demo" }), SKILL);
  assert.throws(() => target({ dir, repo, skill: "missing" }), /tracks no skills\/missing\/SKILL.md/);
});

test("gather pulls the newest runs by start time and step count, each complete", (t) => {
  const dir = scratch(t, "debug-");
  assert.equal(indexRows(INDEX)[2].steps, 1);
  assert.equal(gather({ dir, skill: "demo", days: "30", runs: "3", scripts: standIns(t) }), "3");
  const { traces } = JSON.parse(readFileSync(join(dir, "traces.json"), "utf8"));
  assert.deepEqual(
    traces.map((trace) => [trace.session, trace.run, trace.steps]),
    [
      ["aaaa1111", 3, 30],
      ["aaaa1111", 2, 12],
      ["aaaa1111", 1, 1],
    ],
  );
  assert.match(readFileSync(join(dir, "trace-1.txt"), "utf8"), /\n {2}30 {2}tool/);
});

function diagnosed(t, findings) {
  const repo = fixture(t);
  const dir = scratch(t, "debug-");
  writeFileSync(
    join(dir, "traces.json"),
    JSON.stringify({
      skill: "demo",
      days: 30,
      traces: [
        { k: 1, steps: 30 },
        { k: 2, steps: 12 },
      ],
    }),
  );
  writeFileSync(join(dir, "findings.json"), JSON.stringify({ findings }));
  return { repo, dir, form: options({ dir, repo }) };
}

const GOOD = {
  id: "f1",
  title: "Skips the dry run",
  cause: "escape hatch",
  file: SKILL,
  evidence: "run 1 steps 4-9, run 2 step 3",
  fix: "replace 'unless the change is trivial' with 'always'",
  expect: "a dry run before every edit",
};

test("a finding must cite steps that exist, a known cause and a tracked file", (t) => {
  const { form, dir } = diagnosed(t, [
    GOOD,
    { ...GOOD, id: "f2", evidence: "run 2 steps 10-14" },
    { ...GOOD, id: "f3", evidence: "run 3 steps 1-2" },
    { ...GOOD, id: "f4", evidence: "the agent skipped it" },
    { ...GOOD, id: "f5", cause: "bad vibes" },
    { ...GOOD, id: "f6", file: "plugins/p/skills/demo/other.md" },
  ]);
  assert.deepEqual(
    form.options.map((option) => option.id),
    ["f1", NONE],
  );
  const { rejected } = JSON.parse(readFileSync(join(dir, "items.json"), "utf8"));
  assert.deepEqual(
    rejected.map((entry) => entry.problem.split(",")[0]),
    [
      "evidence cites steps 10-14 of run 2",
      "evidence cites run 3",
      'evidence cites no "run <k> steps <a>-<b>"',
      'cause "bad vibes" is not a row of the Causes table',
      'file "plugins/p/skills/demo/other.md" is not a tracked Markdown file of this checkout',
    ],
  );
});

test("an accepted edit to the named file is committed; one that strays is reverted", (t) => {
  const second = {
    ...GOOD,
    id: "f2",
    title: "Worker brief",
    cause: "missing step",
    file: "plugins/p/agents/worker.md",
  };
  const { repo, dir } = diagnosed(t, [GOOD, second]);
  approve({ dir, repo, answer: JSON.stringify({ decisions: ["f1", "f2"] }) });
  writeFileSync(join(repo, SKILL), "# Demo\n\n1. Always run the dry run.\n");
  assert.equal(advance({ dir, repo }), false);
  assert.equal(git(repo, ["log", "-1", "--format=%s"]), "skill-debug: Skips the dry run");
  writeFileSync(join(repo, "plugins", "p", "agents", "worker.md"), "Work carefully.\n");
  writeFileSync(join(repo, SKILL), "# Demo\n\nrewritten\n");
  assert.equal(advance({ dir, repo }), true);
  const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  assert.match(state.results.f2.reason, /besides plugins\/p\/agents\/worker.md: plugins\/p\/skills\/demo\/SKILL.md/);
  assert.equal(readFileSync(join(repo, SKILL), "utf8"), "# Demo\n\n1. Always run the dry run.\n");
  assert.equal(git(repo, ["status", "--porcelain"]), "");
});

test("the pull request body carries no evidence or fix text, and expectations only for applied fixes", (t) => {
  const declined = { ...GOOD, id: "f2", title: "Declined", expect: "DECLINED-EXPECT" };
  const { repo, dir } = diagnosed(t, [
    { ...GOOD, evidence: "run 1 steps 4-9 SECRET-STEP-TEXT", fix: "FIX-TEXT" },
    declined,
  ]);
  approve({ dir, repo, answer: JSON.stringify({ decisions: ["f1"] }) });
  writeFileSync(join(repo, SKILL), "# Demo\n\n1. Always run the dry run.\n");
  advance({ dir, repo });
  const body = report({ dir });
  assert.match(body, /Skips the dry run \(escape hatch, plugins\/p\/skills\/demo\/SKILL.md\): applied in \w+/);
  assert.match(body, /Declined \(escape hatch, .*\): not accepted/);
  assert.match(body, /- Skips the dry run: a dry run before every edit/);
  assert.doesNotMatch(body, /SECRET-STEP-TEXT|FIX-TEXT|DECLINED-EXPECT/);
});
