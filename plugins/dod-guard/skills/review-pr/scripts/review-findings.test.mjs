// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";
import { findingsFixture, pbiJson } from "./lib/review-pr.test-support.mjs";

const SCRIPT = fileURLToPath(new URL("review-findings.mjs", import.meta.url));
const run = (args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    shell: false,
  });

function withDir(body) {
  const dir = mkdtempSync(join(tmpdir(), "review-findings-"));
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function write(dir, name, value) {
  const path = join(dir, name);
  writeFileSync(path, typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  return path;
}

const DIFF = [
  "diff --git a/src/a.mjs b/src/a.mjs",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/a.mjs",
  "@@ -0,0 +1 @@",
  "+x",
  "",
].join("\n");
const PBI_JSON = pbiJson();

function inputs(dir) {
  return {
    diff: write(dir, "unified0.diff", DIFF),
    pbi: write(dir, "pbi.json", PBI_JSON),
    subs: write(dir, "sub-issues.json", [[]]),
    out: join(dir, "slots.json"),
  };
}

function slotFlags(paths) {
  return [`--diff=${paths.diff}`, `--pbi=${paths.pbi}`, `--sub-issues=${paths.subs}`, `--out=${paths.out}`];
}

test("slots writes the slot list and prints counts", () => {
  withDir((dir) => {
    const paths = inputs(dir);
    const result = run(["slots", ...slotFlags(paths)]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      out: paths.out,
      slots: 3,
      files: 1,
      criteria: 2,
      subIssues: 0,
    });
    const slots = JSON.parse(readFileSync(paths.out, "utf8"));
    assert.deepEqual(
      slots.map((slot) => slot.slot),
      ["file:src/a.mjs", "criterion:1", "criterion:2"],
    );
  });
});

test("slots names a missing PBI file", () => {
  withDir((dir) => {
    const paths = inputs(dir);
    const missing = join(dir, "missing.json");
    const result = run(["slots", ...slotFlags({ ...paths, pbi: missing })]);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(missing), result.stderr);
  });
});

test("slots names a malformed sub-issue file", () => {
  withDir((dir) => {
    const paths = inputs(dir);
    const subs = write(dir, "sub-issues.json", "{not json");
    const result = run(["slots", ...slotFlags({ ...paths, subs })]);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(subs), result.stderr);
    assert.match(result.stderr, /Cannot read JSON from/);
  });
});

test("slots names a sub-issue listing with the wrong shape", () => {
  withDir((dir) => {
    const paths = inputs(dir);
    const subs = write(dir, "sub-issues.json", {});
    const result = run(["slots", ...slotFlags({ ...paths, subs })]);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(subs), result.stderr);
    assert.match(result.stderr, /must be a JSON array/);
  });
});

test("violations reads a scan file with a UTF-8 byte-order mark and a diff saved as marked UTF-16", () => {
  withDir((dir) => {
    const scanText = Buffer.from(JSON.stringify({ violations: [] }));
    const scan = write(dir, "scan.json", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), scanText]));
    const diff = write(dir, "unified0.diff", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(DIFF, "utf16le")]));
    const out = join(dir, "violations.json");
    const result = run(["violations", `--scan=${scan}`, `--diff=${diff}`, `--out=${out}`]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { out, violations: 0, files: 0 });
  });
});

test("slots names the PBI when it has no criteria", () => {
  withDir((dir) => {
    const paths = inputs(dir);
    write(dir, "pbi.json", {
      ...PBI_JSON,
      body: "## Acceptance criteria\n\n- plain\n",
    });
    const result = run(["slots", ...slotFlags(paths)]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PBI TychoHenzen\/dod-guard#837 has no checkbox item/);
  });
});

test("slots without a required flag prints usage", () => {
  withDir((dir) => {
    const flags = slotFlags(inputs(dir)).filter((flag) => !flag.startsWith("--sub-issues="));
    const result = run(["slots", ...flags]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Usage:/);
  });
});

const HEAD = "f".repeat(40);
const ASSIGNED = {
  "review-pr-feature": ["file:src/a.mjs"],
  "review-pr-design": ["file:src/a.mjs"],
  "review-pr-reliability": ["criterion:1"],
  "review-pr-hygiene": ["criterion:2"],
};
const RESULTS = findingsFixture.REVIEWERS.map((reviewer) => ({
  reviewer,
  rulings: ASSIGNED[reviewer].map((slot) => ({
    slot,
    status: "VERIFIED",
    evidence: "ok",
  })),
  findings: [],
}));
const question = (id, lens) => ({
  id,
  lens,
  question: `Does ${lens} hold?`,
  files: ["src/a.mjs"],
  status: "verified",
});
const PLAN = [
  {
    slot: "file:src/a.mjs",
    questions: [question("F1", "review-pr-feature"), question("D1", "review-pr-design")],
  },
  { slot: "criterion:1", questions: [question("R1", "review-pr-reliability")] },
  { slot: "criterion:2", questions: [question("H1", "review-pr-hygiene")] },
];

// build takes the slot inputs plus the scan, the reviewer results, the plan,
// the merge pass output, and the head.
function buildFlags(dir) {
  return {
    ...inputs(dir),
    out: join(dir, "payload.json"),
    scan: write(dir, "scan.json", { violations: [] }),
    results: write(dir, "results.json", RESULTS),
    plan: write(dir, "plan.json", PLAN),
    merge: write(dir, "merge.json", { groups: [], scanner: [] }),
  };
}

function buildArgs(paths) {
  return [
    `--head=${HEAD}`,
    `--scan=${paths.scan}`,
    `--diff=${paths.diff}`,
    `--pbi=${paths.pbi}`,
    `--sub-issues=${paths.subs}`,
    `--plan=${paths.plan}`,
    `--results=${paths.results}`,
    `--merge=${paths.merge}`,
    `--out=${paths.out}`,
  ];
}

test("build writes a COMMENT payload with the slot block", () => {
  withDir((dir) => {
    const paths = buildFlags(dir);
    const result = run(["build", ...buildArgs(paths)]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(readFileSync(paths.out, "utf8"));
    assert.equal(payload.event, "COMMENT");
    assert.ok(payload.body.includes("<summary>Review plan slots (3)</summary>"), payload.body);
  });
});

test("build refuses a merge output naming an unknown J id and writes nothing", () => {
  withDir((dir) => {
    const groups = [{ members: ["J9"], representative: "J9" }];
    const merge = write(dir, "unknown-merge.json", { groups, scanner: [] });
    const paths = { ...buildFlags(dir), merge };
    const result = run(["build", ...buildArgs(paths)]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /merge pass output is refused; do not post: .*unknown J id "J9"/);
    assert.equal(existsSync(paths.out), false);
  });
});

test("build refuses a scanner DROP for a pre-existing reason and writes nothing", () => {
  withDir((dir) => {
    const where = { file: "src/a.mjs", line: 1, rule: "line-length" };
    const violation = { ...where, severity: "high", message: "line is 121 chars" };
    const scanner = [{ ids: ["S1"], status: "DROP", reason: "pre-existing", answer: "D1" }];
    const scan = write(dir, "violation-scan.json", { violations: [violation] });
    const merge = write(dir, "drop-merge.json", { groups: [], scanner });
    const paths = { ...buildFlags(dir), scan, merge };
    const result = run(["build", ...buildArgs(paths)]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /do not post: .*S1 DROP reason "pre-existing"/);
    assert.equal(existsSync(paths.out), false);
  });
});

test("build without --merge prints usage", () => {
  withDir((dir) => {
    const flags = buildArgs(buildFlags(dir)).filter((flag) => !flag.startsWith("--merge="));
    const result = run(["build", ...flags]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /--merge=<merge\.json>/);
  });
});

test("build names a malformed sub-issue file", () => {
  withDir((dir) => {
    const paths = buildFlags(dir);
    const subs = write(dir, "sub-issues.json", "{not json");
    const result = run(["build", ...buildArgs({ ...paths, subs })]);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(subs), result.stderr);
  });
});

test("build names a missing PBI file", () => {
  withDir((dir) => {
    const paths = buildFlags(dir);
    const missing = join(dir, "missing.json");
    const result = run(["build", ...buildArgs({ ...paths, pbi: missing })]);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(missing), result.stderr);
  });
});

test("build refuses a flag it does not take", () => {
  withDir((dir) => {
    const result = run(["build", ...buildArgs(buildFlags(dir)), "--extra=1"]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Usage:/);
  });
});
