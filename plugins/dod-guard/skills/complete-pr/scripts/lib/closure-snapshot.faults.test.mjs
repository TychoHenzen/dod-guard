import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { runCli } from "../closure.mjs";
import * as support from "./closure-snapshot.test-support.mjs";
import {
  buildFailureWith,
  capture,
  FAULTS,
  failedAt,
  runSnapshot,
  USAGE_LINE,
  withTempDir,
} from "./fixtures/closure-snapshot-cli.mjs";
import { HEAD } from "./fixtures/closure-snapshot-pages.mjs";
import { build, buildFailure, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { ok, REPO } from "./fixtures/rest-shapes.mjs";

const { ENDPOINT, fakeRest, linkedProjectNode, linkedProjectsReply, SERVER_ERROR } = support;

test("the linked-Project read names itself once for a failed, erroring, or untrustworthy answer", () => {
  const errors = ok({ errors: [{ message: "Something went wrong" }] });
  const project = linkedProjectNode(2);
  const cases = [
    [SERVER_ERROR, "gh: Server Error (HTTP 500)"],
    [errors, "returned errors: Something went wrong"],
    [ok({ data: { repository: null } }), "named no repository"],
    [linkedProjectsReply([project], { hasNextPage: true }), "is incomplete"],
    [linkedProjectsReply([project, null]), "malformed Project node null"],
    [{ status: 0, stdout: "not json", stderr: "" }, "did not return JSON"],
  ];
  const prefix = failedAt(ENDPOINT.linkedProjects);
  for (const [reply, detail] of cases) {
    const error = buildFailureWith({ [ENDPOINT.linkedProjects]: reply });
    const label = `${detail}: ${error?.message}`;
    assert.ok(error?.message.startsWith(prefix), label);
    assert.ok(error.message.includes(detail), `${detail}: ${error.message}`);
    const parts = error.message.split("closure snapshot read failed:");
    assert.equal(parts.length - 1, 1, error.message);
  }
});

// A failed required-check read is reported once, at the endpoint that failed, and is not restated
// at the commit endpoint that requested it.
for (const [variant, endpoint] of [
  ["protection-failure", ENDPOINT.protection],
  ["check-runs-failure", ENDPOINT.checkRuns(HEAD[21])],
  ["status-failure", ENDPOINT.statuses(HEAD[21])],
]) {
  test(`AC-11: ${variant} names the failing endpoint first and only once`, () => {
    const error = buildFailure(fixtureRoutes(variant));
    assert.ok(error, `${variant}: the build should have failed`);
    assert.ok(error.message.startsWith(failedAt(endpoint)), error.message);
    assert.equal(error.message.split("closure snapshot read failed:").length - 1, 1, error.message);
  });
}

for (const [variant, expected, label = variant] of FAULTS) {
  test(`AC-11: ${label} exits 1, names its endpoint, leaves no file, and recovers on rerun`, async () => {
    await withTempDir(async (dir) => {
      const failure = runSnapshot(dir, variant);
      assert.equal(failure.code, 1, failure.stderr);
      for (const text of expected) {
        assert.ok(failure.stderr.includes(text), `stderr lacks "${text}": ${failure.stderr}`);
      }
      assert.deepEqual(await readdir(dir), [], "a failed run left a file behind");

      const healthy = runSnapshot(dir, "healthy");
      assert.equal(healthy.code, 0, healthy.stderr);
      assert.deepEqual(JSON.parse(healthy.stdout), {
        output: healthy.output,
        repository: REPO,
        projectNumber: 2,
        items: 4,
        issues: 3,
        pullRequests: 3,
      });
      assert.deepEqual(JSON.parse(await readFile(healthy.output, "utf8")), build(fixtureRoutes()));
      assert.deepEqual(await readdir(dir), ["snapshot.json"]);
    });
  });
}

test("AC-11: a failed rebuild removes the earlier snapshot at its output, so nothing stale is read", async () => {
  await withTempDir(async (dir) => {
    const earlier = join(dir, "snapshot.json");
    await writeFile(earlier, `${JSON.stringify({ ...build(fixtureRoutes()), defaultBranch: "stale" }, null, 2)}\n`);
    const failure = runSnapshot(dir, "repository");
    assert.equal(failure.code, 1, failure.stderr);
    assert.ok(failure.stderr.includes(ENDPOINT.repository), failure.stderr);
    assert.deepEqual(await readdir(dir), [], "a failed rebuild left the earlier snapshot in place");

    const healthy = runSnapshot(dir, "healthy");
    assert.equal(healthy.code, 0, healthy.stderr);
    assert.deepEqual(await readdir(dir), ["snapshot.json"]);
    assert.deepEqual(JSON.parse(await readFile(earlier, "utf8")), build(fixtureRoutes()));
  });
});

test("AC-11: snapshot without a valid --repository or --output is a usage error", () => {
  const invalid = [
    ["snapshot", `--repository=${REPO}`],
    ["snapshot", "--output=snapshot.json"],
    ["snapshot", "--repository=not-a-repository", "--output=snapshot.json"],
  ];
  for (const argv of invalid) {
    const io = capture();
    const { runner, calls } = fakeRest(fixtureRoutes());
    assert.equal(runCli(argv, { runner, ...io }), 2, argv.join(" "));
    assert.match(io.text.err, USAGE_LINE);
    assert.deepEqual(calls, [], argv.join(" "));
  }
});
