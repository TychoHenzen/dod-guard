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
const UNPUSHED_HEAD = "cccccccccccccccccccccccccccccccccccccccc";
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
    "../../complete-pr/scripts/finalization-gate.mjs",
    "./structured-workflow-proof.mjs",
  ]);
  assert.doesNotMatch(source, /\bimport\(|\bfetch\(|\brequire\(/);
});

test("exits 2 on a usage error and names the argument", async () => {
  const usage = (remainder) => ({ status: 2, json: { outcome: "usage error", remainder } });
  const missing = path.join(here, "fixtures", "no-such-body.md");

  assert.deepEqual(run("refinement"), usage(["--body-file=<path> is required"]));
  const subcommandError = ["the first argument must be the refinement, post-push, or finalization subcommand"];
  assert.deepEqual(run(), usage(subcommandError));
  assert.deepEqual(run("finalize", `--body-file=${CORRECTED}`), usage(subcommandError));
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
  // The #904 body stores no lens head, so a stale lens needs a body that stores one.
  const oneStale = bodyWithLensRecords(({ headSha, ...lens }, index) =>
    index === 0 ? { ...lens, headSha: HEAD_904 } : lens,
  );
  await withTempFile("body.md", oneStale, async (bodyFile) => {
    await withTempFile("handoff.md", buildHandoff(ROWS_904), (handoff) => {
      const { status, json } = run(
        "post-push",
        `--body-file=${bodyFile}`,
        `--handoff-file=${handoff}`,
        `--head-sha=${UNPUSHED_HEAD}`,
      );

      assert.equal(status, 1);
      assert.ok(
        json.remainder.some((entry) => STALE_LENS.test(entry)),
        JSON.stringify(json.remainder),
      );
    });
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

test("finalization verifies the 904 body at the head the handoff names", async () => {
  await withTempFile("handoff.md", buildHandoff(ROWS_904), (handoff) => {
    assert.deepEqual(
      run("finalization", `--body-file=${BODY_904}`, `--handoff-file=${handoff}`, `--head-sha=${HEAD_904}`),
      { status: 0, json: { outcome: "verified", remainder: [] } },
    );
  });
});

test("finalization stops on a stale head", async () => {
  await withTempFile("handoff.md", buildHandoff(ROWS_904), (handoff) => {
    const { status, json } = run(
      "finalization",
      `--body-file=${BODY_904}`,
      `--handoff-file=${handoff}`,
      `--head-sha=${UNPUSHED_HEAD}`,
    );

    assert.equal(status, 1);
    assert.equal(json.outcome, "actionable remainder");
    assert.ok(json.remainder.length > 0, JSON.stringify(json));
  });
});

test("finalization exits 2 with no --head-sha", async () => {
  await withTempFile("handoff.md", buildHandoff(ROWS_904), (handoff) => {
    assert.deepEqual(run("finalization", `--body-file=${BODY_904}`, `--handoff-file=${handoff}`), {
      status: 2,
      json: { outcome: "usage error", remainder: ["--head-sha=<sha> is required"] },
    });
  });
});

test("finalization and post-push agree on the same inputs", async () => {
  const staleRows = ROWS_904.map((row) => {
    if (row.id !== "R1") {
      return row;
    }
    return { ...row, headSha: "deadbeef" };
  });
  const cases = [ROWS_904, staleRows];
  await Promise.all(
    cases.map((rows) =>
      withTempFile("handoff.md", buildHandoff(rows), (handoff) => {
        const args = [`--body-file=${BODY_904}`, `--handoff-file=${handoff}`, `--head-sha=${HEAD_904}`];
        const postPush = run("post-push", ...args);
        const finalization = run("finalization", ...args);

        assert.equal(finalization.status, postPush.status);
        assert.equal(finalization.json.outcome, postPush.json.outcome);
      }),
    ),
  );
});

const HEAD_B = "1111111111111111111111111111111111111111";
const LENS_OWNERSHIP_BLOCK = /### lens-ownership\r?\n[\s\S]*?```json\r?\n([\s\S]*?)\r?\n```/;
const bodyWithLensRecords = (transform) => {
  const body = readFileSync(BODY_904, "utf8");
  const [, block] = LENS_OWNERSHIP_BLOCK.exec(body);
  const records = JSON.parse(block).map(transform);
  return body.replace(block, JSON.stringify(records, null, 2));
};

test("a lens that stores no head passes, one that stores an older head fails", async () => {
  const headless = bodyWithLensRecords(({ headSha, ...lens }) => lens);
  await withTempFile("body.md", headless, async (bodyFile) => {
    await withTempFile("handoff.md", buildHandoff(ROWS_904), (handoff) => {
      assert.deepEqual(
        run("finalization", `--body-file=${bodyFile}`, `--handoff-file=${handoff}`, `--head-sha=${HEAD_904}`),
        { status: 0, json: { outcome: "verified", remainder: [] } },
      );
    });
  });

  const oneStale = bodyWithLensRecords(({ headSha, ...lens }, index) => {
    if (index === 0) {
      return { ...lens, headSha: HEAD_904 };
    }
    return lens;
  });
  await withTempFile("body.md", oneStale, async (bodyFile) => {
    await withTempFile("handoff.md", buildHandoff(ROWS_904.map((row) => ({ ...row, headSha: HEAD_B }))), (handoff) => {
      const { status, json } = run(
        "finalization",
        `--body-file=${bodyFile}`,
        `--handoff-file=${handoff}`,
        `--head-sha=${HEAD_B}`,
      );
      assert.equal(status, 1);
      assert.ok(
        json.remainder.some((entry) => STALE_LENS.test(entry)),
        JSON.stringify(json.remainder),
      );
    });
  });
});

test("post-push verifies a body whose lenses store no head", async () => {
  await withTempFile("handoff.md", buildHandoff(ROWS_904), (handoff) => {
    const { status } = run(
      "post-push",
      `--body-file=${BODY_904}`,
      `--handoff-file=${handoff}`,
      `--head-sha=${HEAD_904}`,
    );
    assert.equal(status, 0);
  });
});

// The CardCleaner 282 replay: the #904 body was checked at head A, and a merge
// of head B must stop. The #904 body stores no lens head, so re-observing it at B
// only moves the handoff rows. The lens heads rebound below model a body that
// still stores one, which the proof must accept once it matches head B.
test("recovers the CardCleaner 282 case: rows and lenses re-observed at the new head pass", async () => {
  await withTempFile("handoff.md", buildHandoff(ROWS_904), (handoff) => {
    const { status, json } = run(
      "finalization",
      `--body-file=${BODY_904}`,
      `--handoff-file=${handoff}`,
      `--head-sha=${HEAD_B}`,
    );
    assert.equal(status, 1);
    assert.equal(json.outcome, "actionable remainder");
  });

  const bodyAtB = bodyWithLensRecords((lens) => ({ ...lens, headSha: HEAD_B }));
  const rowsAtB = ROWS_904.map((row) => ({ ...row, headSha: HEAD_B }));
  await withTempFile("body.md", bodyAtB, async (bodyFile) => {
    await withTempFile("handoff.md", buildHandoff(rowsAtB), (handoff) => {
      assert.deepEqual(
        run("finalization", `--body-file=${bodyFile}`, `--handoff-file=${handoff}`, `--head-sha=${HEAD_B}`),
        { status: 0, json: { outcome: "verified", remainder: [] } },
      );
    });
  });
});
