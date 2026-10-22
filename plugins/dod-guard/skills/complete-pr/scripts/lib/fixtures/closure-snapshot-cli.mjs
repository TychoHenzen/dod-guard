// Runs the snapshot command against the healthy or a departed route table in a
// scratch directory. It also names the errors a failed read leaves.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../closure.mjs";
import { ENDPOINT, fakeRest } from "../closure-snapshot.test-support.mjs";
import { HEAD, REJECTED_NAMES } from "./closure-snapshot-pages.mjs";
import { buildFailure, fixtureRoutes } from "./closure-snapshot-routes.mjs";
import { REPO } from "./rest-shapes.mjs";

const ERROR_PREFIX = /^closure snapshot read failed: /u;
const MISSING_BODY = /must carry body/u;
const USAGE_LINE =
  /closure\.mjs snapshot --repository=<owner\/name> --output=<file\.json>/u;

async function withTempDir(work) {
  const dir = await mkdtemp(join(tmpdir(), "closure-snapshot-"));
  try {
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function capture() {
  const text = { out: "", err: "" };
  return {
    text,
    stdout: {
      write: (chunk) => {
        text.out += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        text.err += chunk;
      },
    },
  };
}

function runSnapshot(dir, variant) {
  const io = capture();
  const output = join(dir, "snapshot.json");
  const code = runCli(
    ["snapshot", `--repository=${REPO}`, `--output=${output}`],
    { runner: fakeRest(fixtureRoutes(variant)).runner, ...io },
  );
  return { code, stdout: io.text.out, stderr: io.text.err, output };
}

// The error a failed read leaves: the endpoint it names, then the colon that
// ends it.
const failedAt = (endpoint) => `closure snapshot read failed: ${endpoint}:`;

function buildFailureWith(overrides) {
  return buildFailure({ ...fixtureRoutes(), ...overrides });
}

const LINKED_AT = failedAt(ENDPOINT.linkedProjects);
const ONE_PROJECT = "expected exactly one open linked Project, found";
const FAULTS = [
  ["repository", [failedAt(ENDPOINT.repository)]],
  ["items", [failedAt(ENDPOINT.values(2))]],
  ["missing-page", [failedAt(ENDPOINT.values(2)), "missing page"]],
  [
    "no-parent-field",
    [
      failedAt(ENDPOINT.fields(2)),
      'must include exactly one "Parent issue" field, found 0',
    ],
  ],
  ["no-linked-project", [LINKED_AT, `${ONE_PROJECT} none`]],
  ["two-linked-projects", [LINKED_AT, `${ONE_PROJECT} 2 (#2, #4)`]],
  [
    "protection-failure",
    [failedAt(ENDPOINT.protection)],
    "protection-failure (a non-404 protection read is a failure, " +
      "not an empty requirement list)",
  ],
  ["check-runs-failure", [failedAt(ENDPOINT.checkRuns(HEAD[21]))]],
  ["status-failure", [failedAt(ENDPOINT.statuses(HEAD[21]))]],
  ...REJECTED_NAMES.map((variant) => [variant, [failedAt(ENDPOINT.values(2))]]),
];

export {
  buildFailureWith,
  capture,
  ERROR_PREFIX,
  failedAt,
  FAULTS,
  MISSING_BODY,
  runSnapshot,
  USAGE_LINE,
  withTempDir,
};
