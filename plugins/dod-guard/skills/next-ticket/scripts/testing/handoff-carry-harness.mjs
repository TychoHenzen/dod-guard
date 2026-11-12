// Shared fixtures for the carry-forward CLI tests: a repository whose commits are A (the base),
// B (a comment, blank line and re-indent change), C (a code change), D (a trailing comment on a
// code line) and E (an edit inside a template literal), the evidence file, and a runner that
// starts handoff-build.mjs as a child process over the #904 body.
// biome-ignore lint/correctness/noNodejsModules: test fixture runs the CLI as a child process
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: test fixture removes its temporary repository
import { rmSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: test fixture builds the CLI path
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: test fixture runs the CLI under the current node
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: test fixture builds the CLI path
import { fileURLToPath } from "node:url";
import { commitFiles, makeRepo } from "./carry-forward-repo.mjs";
import { BODY_TEXT, HEAD_904, ROWS_904, withFiles } from "./handoff-proof-harness.mjs";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "handoff-build.mjs");
const TASK_IDS = ["T1", "T2", "T3", "T4"];
const PATHS = ["src/a.mjs"];
const TEMPLATE_PATHS = ["src/t.mjs"];
const SRC_A = "export function a() {\n  return 1;\n}\n";
const SRC_B = "// the same function, annotated\n\nexport function a() {\n    return 1;\n}\n";
const SRC_C = "export function a() {\n  return 2;\n}\n";
const SRC_D = "export function a() {\n  return 1; // one\n}\n";
const TEMPLATE_A = "export const t = `\n// a\n`;\n";
const TEMPLATE_E = "export const t = `\n// b\n`;\n";

async function withRepo(use) {
  const { root, head: A } = makeRepo({ "src/a.mjs": SRC_A, "src/t.mjs": TEMPLATE_A, "README.md": "one\n" });
  try {
    const B = commitFiles(root, { "src/a.mjs": SRC_B, "README.md": "two\n" });
    const C = commitFiles(root, { "src/a.mjs": SRC_C });
    const D = commitFiles(root, { "src/a.mjs": SRC_D });
    const E = commitFiles(root, { "src/t.mjs": TEMPLATE_E });
    return await use({ root, baseHead: A, commentHead: B, codeHead: C, trailingHead: D, templateHead: E });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Only what was observed; the planned rows own every identity field. R1 takes the carryForward.
function evidenceFor(carryForward) {
  const rows = ROWS_904.map((row) => [
    row.id,
    { observed: row.observed, status: row.status, ...(Object.hasOwn(row, "reason") && { reason: row.reason }) },
  ]);
  const evidence = {
    tasks: TASK_IDS.map((id) => ({ id, commit: HEAD_904, files: [`${id}.mjs`], result: "ok" })),
    rows: Object.fromEntries(rows),
  };
  if (carryForward !== undefined) {
    evidence.rows.R1.carryForward = carryForward;
  }
  return evidence;
}

// Runs the CLI over the #904 body; --root is passed only when a root is given.
async function build(evidence, { head, root }) {
  const files = [
    ["body.md", BODY_TEXT],
    ["evidence.json", JSON.stringify(evidence)],
  ];
  return await withFiles(files, ([bodyFile, evidenceFile]) => {
    const args = [CLI, `--body-file=${bodyFile}`, `--evidence-file=${evidenceFile}`, `--head-sha=${head}`];
    if (root !== undefined) {
      args.push(`--root=${root}`);
    }
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    return { code: result.status, out: result.stdout, err: result.stderr };
  });
}

export { build, evidenceFor, PATHS, TEMPLATE_PATHS, withRepo };
