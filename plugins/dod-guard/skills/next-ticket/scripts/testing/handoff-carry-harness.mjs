// Shared fixtures for the carry-forward CLI tests: a three-commit repository (A is the
// base, B a comment and re-indent change, C a code change), the evidence file, and the
// CLI runner over the #904 body.
// biome-ignore lint/correctness/noNodejsModules: test fixture removes its temporary repository
import { rmSync } from "node:fs";
import { runCli } from "../handoff-build.mjs";
import { commitFiles, makeRepo } from "./carry-forward-repo.mjs";
import { BODY_TEXT, HEAD_904, ROWS_904, withFiles } from "./handoff-proof-harness.mjs";

const TASK_IDS = ["T1", "T2", "T3", "T4"];
const PATHS = ["src/a.mjs"];
const SRC_A = "export function a() {\n  return 1;\n}\n";
const SRC_B = "// the same function, annotated\nexport function a() {\n    return 1;\n}\n";
const SRC_C = "export function a() {\n  return 2;\n}\n";

async function withRepo(use) {
  const { root, head: A } = makeRepo({ "src/a.mjs": SRC_A, "README.md": "one\n" });
  try {
    const B = commitFiles(root, { "src/a.mjs": SRC_B, "README.md": "two\n" });
    const C = commitFiles(root, { "src/a.mjs": SRC_C, "README.md": "two\n" });
    return await use({ root, baseHead: A, commentHead: B, codeHead: C });
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
  let out = "";
  let err = "";
  const io = {
    stdout: {
      write: (chunk) => {
        out += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        err += chunk;
      },
    },
  };
  const files = [
    ["body.md", BODY_TEXT],
    ["evidence.json", JSON.stringify(evidence)],
  ];
  const code = await withFiles(files, ([bodyFile, evidenceFile]) => {
    const args = [`--body-file=${bodyFile}`, `--evidence-file=${evidenceFile}`, `--head-sha=${head}`];
    if (root !== undefined) {
      args.push(`--root=${root}`);
    }
    return runCli(args, io);
  });
  return { code, out, err };
}

export { build, evidenceFor, PATHS, withRepo };
