import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fixture, run, usage, withTempFile } from "./testing/handoff-proof-harness.mjs";

const CORRECTED = fixture("issue-855-shape-corrected-body.md");
const PLAN = (files) => `## Step plan: T1\n\n\`\`\`text\n${files}\nProxy check: alpha in lib\n\`\`\`\n`;

async function withRoot(use) {
  const root = await mkdtemp(path.join(tmpdir(), "handoff-proof-root-"));
  try {
    await mkdir(path.join(root, "lib"));
    await writeFile(path.join(root, "lib", "a.mjs"), "alpha\n");
    await writeFile(path.join(root, "lib", "b.mjs"), "alpha\n");
    return await use(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const refine = (plans, root) => run("refinement", `--body-file=${CORRECTED}`, `--plans=${plans}`, `--root=${root}`);

test("fails the refinement proof for a proxy hit that no File line names", () =>
  withRoot((root) =>
    withTempFile("plans.md", PLAN("File: lib/a.mjs"), (plans) => {
      assert.deepEqual(refine(plans, root), {
        status: 1,
        json: {
          outcome: "actionable remainder",
          remainder: ['step plan T1 proxy check "alpha" in lib hits lib/b.mjs, which no File line names'],
        },
      });
    }),
  ));

test("verifies the same plan once every hit is a File line", () =>
  withRoot((root) =>
    withTempFile("plans.md", PLAN("File: lib/a.mjs\nFile: lib/b.mjs"), (plans) => {
      assert.deepEqual(refine(plans, root), { status: 0, json: { outcome: "verified", remainder: [] } });
    }),
  ));

test("exits 2 for a missing --root or --plans, a plans file with no heading, and --plans on post-push", () =>
  withTempFile("plans.md", "File: lib/a.mjs\n", (plans) => {
    const body = `--body-file=${CORRECTED}`;
    assert.deepEqual(run("refinement", body, "--root=."), usage(["--root only applies with --plans"]));
    assert.deepEqual(
      run("refinement", body, `--plans=${plans}`),
      usage(["--plans needs --root=<dir>, the checkout the plans' paths resolve in"]),
    );
    assert.deepEqual(
      run("refinement", body, `--plans=${plans}`, "--root=."),
      usage(["--plans file holds no '## Step plan: <task-id>' heading"]),
    );
    assert.deepEqual(run("post-push", `--plans=${plans}`), usage(["unknown option --plans"]));
  }));
