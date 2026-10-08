import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import {
  renderJson,
  renderText,
  sortViolations,
  summarize,
  toWorkUnits,
} from "../../../../../skills/quality-refactor/scripts/lib/report.mjs";
import { resultFor } from "../../../../../skills/quality-refactor/scripts/quality-scan-output.mjs";
import { scan } from "../../../../../skills/quality-refactor/scripts/quality-scan-run.mjs";

test("comment findings keep stable fields through text, JSON, and units", () => {
  const root = mkdtempSync(
    join(process.env.TEMP ?? process.cwd(), "quality-surfaces-"),
  );
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "src", "subject.ts"),
      "// @see src/missing.ts#Missing\n// ???\nexport const value = 1;\n",
    );
    const scanned = scan(
      {
        paths: ["src"],
        root,
        excludes: [],
        testPaths: [],
        rules: ["comment-missing-reference", "comment-placeholder"],
      },
      buildConfig("default"),
    );
    const violations = sortViolations(scanned.violations);
    const result = resultFor({
      options: { profile: "strict" },
      files: scanned.files,
      sorted: violations,
      summary: summarize(violations),
    });
    assert.equal(result.profile, "advisory");
    const json = JSON.parse(renderJson(result));
    const units = toWorkUnits(violations);
    assert.deepEqual(Object.keys(json.summary).sort(), [
      "byFile",
      "byRule",
      "high",
      "low",
      "medium",
      "total",
    ]);
    assert.deepEqual(Object.keys(units[0]).sort(), [
      "file",
      "high",
      "items",
      "low",
      "medium",
      "rules",
    ]);
    assert.equal(violations.length, 2);
    assert.deepEqual(
      json.violations.map(
        ({ file, line, rule, severity, metric, message }) => ({
          file,
          line,
          rule,
          severity,
          metric,
          message,
        }),
      ),
      violations,
    );
    assert.match(renderText(result, 20), /comment-missing-reference/);
    assert.deepEqual(units[0].items[0], violations[0]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
