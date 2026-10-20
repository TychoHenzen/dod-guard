import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { issue855Shape } from "./structured-workflow-fixtures.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "handoff-proof.mjs");
const fixture = (name) => path.join(here, "fixtures", name);
const PRE_CORRECTION = fixture("issue-855-shape-body.md");
const CORRECTED = fixture("issue-855-shape-corrected-body.md");
const BODY_904 = path.join(here, "..", "..", "..", "lib", "fixtures", "issue-904-body.md");
const HEAD_904 = "e7e22c4c54840c7983af67f8d631396cf5484999";
const ROWS_904 = JSON.parse(readFileSync(fixture("issue-904-handoff.json"), "utf8")).acceptanceMatrix;
const STALE_ROW_ID = /\bR1\b/;
const STALE_LENS = /review lens is not bound to handoff head/;
const buildHandoff = (rows) =>
  `## Implementation handoff\n\n## Acceptance matrix\n\n\`\`\`json\n${JSON.stringify(rows)}\n\`\`\`\n`;

function run(...args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  const lines = result.stdout.split("\n").filter(Boolean);
  assert.equal(lines.length, 1, `one JSON line on stdout, got ${result.stdout}`);
  return { status: result.status, json: JSON.parse(lines[0]) };
}

async function withTempFile(name, content, use) {
  const dir = await mkdtemp(path.join(tmpdir(), "handoff-proof-"));
  try {
    const file = path.join(dir, name);
    await writeFile(file, content);
    return await use(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("the committed #855-shape bodies hold the records of the shared fixture builder", async () => {
  for (const [file, corrected] of [
    [PRE_CORRECTION, false],
    [CORRECTED, true],
  ]) {
    const { input, errors, remainder } = parseIssueBodyRecords(await readFile(file, "utf8"));
    const expected = issue855Shape({ corrected });

    assert.deepEqual(errors, []);
    assert.deepEqual(remainder, []);
    for (const key of ["tasks", "reviewLenses", "acceptance", "plannedAcceptanceMatrix"]) {
      assert.deepEqual(input[key], expected[key], key);
    }
  }
});

test("rejects the #855 pre-correction body and accepts it after the record correction", () => {
  assert.deepEqual(run("refinement", `--body-file=${PRE_CORRECTION}`), {
    status: 1,
    json: {
      outcome: "actionable remainder",
      remainder: ["reliability review lens must cover required path(s): recovery"],
    },
  });
  assert.deepEqual(run("refinement", `--body-file=${CORRECTED}`), {
    status: 0,
    json: { outcome: "verified", remainder: [] },
  });
  assert.deepEqual(run("refinement", `--body-file=${BODY_904}`), {
    status: 0,
    json: { outcome: "verified", remainder: [] },
  });
});

test("passes linked functional-slice children from --children", async () => {
  await withTempFile("children.json", '[{"id": "orphan-slice", "evidence": "slice-proof"}]', (children) => {
    assert.deepEqual(run("refinement", `--body-file=${CORRECTED}`, `--children=${children}`), {
      status: 1,
      json: { outcome: "actionable remainder", remainder: ["orphan-slice slice needs an owning task"] },
    });
  });
});

test("exits 2 and names the record on a body it cannot parse", async () => {
  const body = await readFile(CORRECTED, "utf8");
  const withoutPlanned = body.replace("### planned-acceptance-matrix\n", "### planned-matrix\n");
  await withTempFile("body.md", withoutPlanned, (file) => {
    assert.deepEqual(run("refinement", `--body-file=${file}`), {
      status: 2,
      json: { outcome: "parse error", remainder: ["missing planned-acceptance-matrix record"] },
    });
  });
  const withoutEvidence = body.replace("### acceptance-evidence\n", "### evidence\n");
  await withTempFile("body.md", withoutEvidence, (file) => {
    assert.deepEqual(run("refinement", `--body-file=${file}`), {
      status: 2,
      json: { outcome: "parse error", remainder: ["missing acceptance-evidence record"] },
    });
  });
  const invalidTasks = body.replace('[\n  {"id":"T1"', '[\n  {"id":"T1",,');
  await withTempFile("body.md", invalidTasks, (file) => {
    assert.deepEqual(run("refinement", `--body-file=${file}`), {
      status: 2,
      json: { outcome: "parse error", remainder: ["task-list record is not valid JSON"] },
    });
  });
});

test("exits 2 on a file that is not UTF-8 and reads UTF-8 with a byte-order mark", async () => {
  const body = await readFile(CORRECTED, "utf8");
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const notUtf8 = [
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, "utf16le")]),
    Buffer.from(body, "utf16le"),
    Buffer.from([0x41, 0xe9, 0x0a]),
  ];
  for (const bytes of notUtf8) {
    await withTempFile("body.md", bytes, (file) => {
      assert.deepEqual(run("refinement", `--body-file=${file}`), {
        status: 2,
        json: { outcome: "usage error", remainder: [`--body-file ${file} is not UTF-8 text; save it as UTF-8`] },
      });
    });
  }
  await withTempFile("body.md", Buffer.concat([bom, Buffer.from(body, "utf8")]), (file) => {
    assert.deepEqual(run("refinement", `--body-file=${file}`), {
      status: 0,
      json: { outcome: "verified", remainder: [] },
    });
  });
  const children = Buffer.concat([bom, Buffer.from('[{"id": "orphan-slice", "evidence": "slice-proof"}]')]);
  await withTempFile("children.json", children, (file) => {
    assert.deepEqual(run("refinement", `--body-file=${CORRECTED}`, `--children=${file}`), {
      status: 1,
      json: { outcome: "actionable remainder", remainder: ["orphan-slice slice needs an owning task"] },
    });
  });
});

test("reads only local files: no network, process, or GitHub module is imported", async () => {
  const source = await readFile(script, "utf8");
  const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);

  assert.deepEqual(imports, [
    "node:fs",
    "node:path",
    "node:url",
    "../../../lib/args.mjs",
    "../../../lib/handoff-matrix.mjs",
    "../../../lib/issue-body-records.mjs",
    "./structured-workflow-proof.mjs",
  ]);
  assert.doesNotMatch(source, /\bimport\(|\bfetch\(|\brequire\(/);
});

test("exits 2 on a usage error and names the argument", async () => {
  const usage = (remainder) => ({ status: 2, json: { outcome: "usage error", remainder } });
  const missing = path.join(here, "fixtures", "no-such-body.md");

  assert.deepEqual(run("refinement"), usage(["--body-file=<path> is required"]));
  assert.deepEqual(run(), usage(["the first argument must be the refinement or post-push subcommand"]));
  assert.deepEqual(
    run("finalization", `--body-file=${CORRECTED}`),
    usage(["the first argument must be the refinement or post-push subcommand"]),
  );
  assert.deepEqual(run("refinement", CORRECTED), usage([`unexpected argument ${CORRECTED}`]));
  assert.deepEqual(run("refinement", `--body-file=${CORRECTED}`, "--head=abc"), usage(["unknown option --head"]));
  assert.deepEqual(run("refinement", `--body-file=${missing}`), usage([`cannot read --body-file ${missing}`]));
  await withTempFile("children.json", '{"id": "slice"}', (children) => {
    assert.deepEqual(
      run("refinement", `--body-file=${CORRECTED}`, `--children=${children}`),
      usage(["--children file must hold a JSON array"]),
    );
  });
});

test("post-push verifies the 904 body with the handoff rows at their head", async () => {
  await withTempFile("handoff.md", buildHandoff(ROWS_904), (handoff) => {
    assert.deepEqual(
      run("post-push", `--body-file=${BODY_904}`, `--handoff-file=${handoff}`, `--head-sha=${HEAD_904}`),
      { status: 0, json: { outcome: "verified", remainder: [] } },
    );
  });
});

test("post-push names a stale row", async () => {
  const rows = ROWS_904.map((row) => {
    if (row.id === "R1") {
      return { ...row, headSha: "deadbeef" };
    }
    return row;
  });
  await withTempFile("handoff.md", buildHandoff(rows), (handoff) => {
    const { status, json } = run(
      "post-push",
      `--body-file=${BODY_904}`,
      `--handoff-file=${handoff}`,
      `--head-sha=${HEAD_904}`,
    );

    assert.equal(status, 1);
    assert.equal(json.outcome, "actionable remainder");
    assert.ok(
      json.remainder.some((entry) => STALE_ROW_ID.test(entry)),
      JSON.stringify(json.remainder),
    );
  });
});

test("post-push names a stale lens", async () => {
  await withTempFile("handoff.md", buildHandoff(ROWS_904), (handoff) => {
    const { status, json } = run(
      "post-push",
      `--body-file=${BODY_904}`,
      `--handoff-file=${handoff}`,
      "--head-sha=0123456789abcdef",
    );

    assert.equal(status, 1);
    assert.ok(
      json.remainder.some((entry) => STALE_LENS.test(entry)),
      JSON.stringify(json.remainder),
    );
  });
});

test("post-push exits 2 on a missing option, a missing matrix block, or an unreadable handoff", async () => {
  await withTempFile("handoff.md", buildHandoff(ROWS_904), (handoff) => {
    assert.deepEqual(run("post-push", `--body-file=${BODY_904}`, `--head-sha=${HEAD_904}`), {
      status: 2,
      json: { outcome: "usage error", remainder: ["--handoff-file=<path> is required"] },
    });
    assert.deepEqual(run("post-push", `--body-file=${BODY_904}`, `--handoff-file=${handoff}`), {
      status: 2,
      json: { outcome: "usage error", remainder: ["--head-sha=<sha> is required"] },
    });
    assert.deepEqual(run("refinement", `--body-file=${BODY_904}`, `--head-sha=${HEAD_904}`), {
      status: 2,
      json: { outcome: "usage error", remainder: ["--head-sha only applies to post-push"] },
    });
  });
  await withTempFile("handoff.md", "## Implementation handoff\n\nNo matrix block.\n", (handoff) => {
    assert.deepEqual(
      run("post-push", `--body-file=${BODY_904}`, `--handoff-file=${handoff}`, `--head-sha=${HEAD_904}`),
      {
        status: 2,
        json: { outcome: "parse error", remainder: ["handoff has no ## Acceptance matrix section"] },
      },
    );
  });
});
