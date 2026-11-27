// Shared fixtures for the handoff-build.mjs tests: the evidence file for the #904 body, and a
// runner that calls the CLI in this process with its output captured.
import { runCli } from "../handoff-build.mjs";
import { BODY_TEXT, HEAD_904, ROWS_904, withFiles } from "./handoff-proof-harness.mjs";

const TASK_IDS = ["T1", "T2", "T3", "T4"];

// Only what was observed: the planned rows own every identity field, evidence ids included, and the
// commit names its files. Each observation is one short sentence, as the row line limit asks.
function evidenceFor(overrides = {}) {
  return {
    tasks: TASK_IDS.map((id) => ({ id, commit: HEAD_904, result: "ok" })),
    rows: Object.fromEntries(
      ROWS_904.map((row) => [
        row.id,
        {
          observed: `${row.id} was seen at the head.`,
          status: row.status,
          ...(Object.hasOwn(row, "reason") && { reason: row.reason }),
        },
      ]),
    ),
    ...overrides,
  };
}

// previous is the text of the handoff being rebuilt, or null to omit the option.
async function build(evidence, body = BODY_TEXT, previous = null) {
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
    ["body.md", body],
    ["evidence.json", JSON.stringify(evidence)],
  ];
  if (previous !== null) {
    files.push(["previous.md", previous]);
  }
  const code = await withFiles(files, ([bodyFile, evidenceFile, previousFile]) => {
    const args = [`--body-file=${bodyFile}`, `--evidence-file=${evidenceFile}`, `--head-sha=${HEAD_904}`];
    if (previousFile !== undefined) {
      args.push(`--previous-handoff-file=${previousFile}`);
    }
    return runCli(args, io);
  });
  return { code, out, err };
}

export { build, evidenceFor, TASK_IDS };
