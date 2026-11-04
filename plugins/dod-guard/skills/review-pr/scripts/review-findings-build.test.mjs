// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { existsSync, readFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { planHash } from "./lib/plan-hash.mjs";
import { buildArgs, buildFlags, HEAD, PLAN } from "./lib/review-findings-build.test-support.mjs";
import { run, withDir, write } from "./lib/review-findings-cli.test-support.mjs";

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

test("build refuses an answers file stamped for another plan and writes nothing", () => {
  withDir((dir) => {
    const paths = buildFlags(dir);
    write(dir, "answers.json", { planHash: "0".repeat(16), headSha: HEAD, answers: [] });
    const result = run(["build", ...buildArgs(paths)]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Answers file is stale: planHash/);
    assert.equal(existsSync(paths.out), false);
  });
});

// The stamp differs from HEAD, which the build receives as --head.
test("build refuses an answers file stamped for another head and writes nothing", () => {
  withDir((dir) => {
    const paths = buildFlags(dir);
    write(dir, "answers.json", { planHash: planHash(PLAN), headSha: "e".repeat(40), answers: [] });
    const result = run(["build", ...buildArgs(paths)]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /stale: headSha/);
    assert.equal(existsSync(paths.out), false);
  });
});

test("build without --answers prints usage", () => {
  withDir((dir) => {
    const flags = buildArgs(buildFlags(dir)).filter((flag) => !flag.startsWith("--answers="));
    const result = run(["build", ...flags]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /--answers=<answers\.json>/);
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
