import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceDebrisTableRows } from "./output.js";
import { finding } from "./output.test-support.js";

test(
  "summarizes ignored trees of at least twenty findings only in normal table " +
    "rows",
  () => {
    const findings = [
      ...Array.from({ length: 20 }, (_, index) =>
        finding(`generated/file-${index}.tmp`, "ignored"),
      ),
      finding("logs/one.tmp", "ignored"),
      finding("scratch/old.ts", "untracked"),
    ];
    const before = structuredClone(findings);

    const normalRows = workspaceDebrisTableRows(findings, "normal");
    const verboseRows = workspaceDebrisTableRows(findings, "verbose");

    assert.deepEqual(normalRows, [
      { kind: "ignored-directory-summary", directory: "generated", count: 20 },
      { kind: "finding", finding: findings[20] },
      { kind: "finding", finding: findings[21] },
    ]);
    assert.equal(verboseRows.length, 22);
    assert.deepEqual(
      verboseRows.map((row) => row.kind),
      Array.from({ length: 22 }, () => "finding"),
    );
    assert.deepEqual(findings, before);
  },
);
