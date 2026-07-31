import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { compareToBaseline, readBaseline, writeBaseline } from "./baseline-lib.mjs";
import { gate } from "./quality-guard.mjs";

/**
 * A file whose file-length violation sits past the 450-line new-file
 * ceiling, so a genuinely new file would block and a pre-existing one
 * would not.
 */
const OVER_CEILING_LINES = 452;

function tempRepo() {
  const root = mkdtempSync(join(tmpdir(), "qg-tracked-"));
  mkdirSync(join(root, ".github", "quality"), { recursive: true });
  return root;
}

/**
 * findRepoRoot walks up from the file looking for a `.git` entry and falls
 * back to the file's own directory when none is found. The target file must
 * therefore sit directly in the temp repo root, so that fallback lines up
 * with where writeBaselineFile put `.github/quality/quality-baseline.json`.
 */
function writeTargetFile(root, relName, lineCount) {
  const filePath = join(root, relName);
  writeFileSync(filePath, "const x = 1;\n".repeat(lineCount));
  return filePath;
}

function writeBaselineFile(root, files, counts) {
  const baselinePath = join(root, ".github", "quality", "quality-baseline.json");
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ version: 2, total: 0, files, counts }, null, 2)}\n`,
  );
  return baselinePath;
}

function fakeInput(filePath) {
  return { tool_name: "Edit", tool_input: { file_path: filePath } };
}

test("a git-tracked, baseline-unseen file over the ceiling is adopted, not blocked", () => {
  const root = tempRepo();
  const filePath = writeTargetFile(root, "big.js", OVER_CEILING_LINES);
  const baselinePath = writeBaselineFile(root, [], {});

  const code = gate(fakeInput(filePath), filePath, {
    readBaseline, compareToBaseline, writeBaseline, isTracked: () => true,
  });

  assert.equal(code, 0, "a tracked pre-existing file must not block on the new-file ceiling");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  assert.ok(baseline.files.includes("big.js"), "the file must be adopted into the baseline");
  assert.ok(baseline.counts["big.js::file-length"] >= 1, "its current count must be recorded");

  rmSync(root, { recursive: true, force: true });
});

test("negative control: the same file, same metrics, but untracked, is blocked", () => {
  const root = tempRepo();
  const filePath = writeTargetFile(root, "big.js", OVER_CEILING_LINES);
  const baselinePath = writeBaselineFile(root, [], {});

  const code = gate(fakeInput(filePath), filePath, {
    readBaseline, compareToBaseline, writeBaseline, isTracked: () => false,
  });

  assert.equal(code, 2, "an untracked file past the ceiling must still block");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  assert.deepEqual(baseline.files, [], "a blocked write must not adopt the file");

  rmSync(root, { recursive: true, force: true });
});

test("a tracked file the baseline already knows still blocks on a regression", () => {
  const root = tempRepo();
  // line-length violations scale with the number of over-long lines, so five
  // of them reads as a real regression against a baseline that recorded four.
  const overLongLine = `const x = "${"a".repeat(130)}";\n`;
  const filePath = join(root, "known.js");
  writeFileSync(filePath, overLongLine.repeat(5));
  writeBaselineFile(root, ["known.js"], { "known.js::line-length": 4 });

  const code = gate(fakeInput(filePath), filePath, {
    readBaseline, compareToBaseline, writeBaseline, isTracked: () => true,
  });

  assert.equal(code, 2, "the ratchet must still block a file the baseline already tracks");

  rmSync(root, { recursive: true, force: true });
});

test(
  "an additive edit on a tracked, baseline-unseen file does not report its pre-existing "
    + "violations as new (Case 5)",
  () => {
    const root = tempRepo();
    // Build a file that mirrors the reported shape. It has 66 plain lines,
    // three over-length lines (line-length), then a 68-line Expand()
    // function (function-length) the edit never touched. Padding pushes it
    // past the file-length bound. An additive edit to this file would leave
    // every one of these violations exactly as they already are at HEAD. A
    // baseline that has never scanned the file must adopt them. It must not
    // report them as regressions from zero.
    const lines = [];
    for (let i = 0; i < 66; i++) lines.push(`const filler${i} = ${i};`);
    for (let i = 0; i < 3; i++) lines.push(`const longLine${i} = "${"a".repeat(130)}";`);
    lines.push("function Expand() {");
    for (let i = 0; i < 65; i++) lines.push(`  const step${i} = ${i};`);
    lines.push("  return step0;");
    lines.push("}");
    while (lines.length < 588) lines.push(`const pad${lines.length} = 0;`);
    const filePath = join(root, "additive.js");
    writeFileSync(filePath, `${lines.join("\n")}\n`);
    const baselinePath = writeBaselineFile(root, [], {});

    const code = gate(fakeInput(filePath), filePath, {
      readBaseline, compareToBaseline, writeBaseline, isTracked: () => true,
    });

    assert.equal(
      code,
      0,
      "pre-existing line-length, file-length and function-length violations on an unseen "
        + "tracked file must not block",
    );
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    assert.ok(baseline.files.includes("additive.js"), "the file must be adopted into the baseline");
    assert.equal(
      baseline.counts["additive.js::line-length"],
      3,
      "all three pre-existing line-length violations are recorded, not blocked as new regressions",
    );
    assert.equal(baseline.counts["additive.js::file-length"], 1);
    assert.equal(baseline.counts["additive.js::function-length"], 1);

    rmSync(root, { recursive: true, force: true });
  },
);

test(
  "a pure deletion on a tracked, baseline-unseen file that still trips the file-length "
    + "bound is adopted, not blocked (Case 2)",
  () => {
    const root = tempRepo();
    // Reported shape: a deletion removed a 41-line duplicate helper, taking the
    // file from 539 lines to 498. That deletion also removed the file's one
    // complexity violation outright. What remains is a file-length violation,
    // since 498 is still over the 300-line hard bound. 498 also exceeds the
    // 450-line new-file ceiling (300 * 1.5). A gate that still routes an unseen
    // tracked file through the new-file ceiling blocks this pure improvement.
    const filePath = writeTargetFile(root, "case2.js", 498);
    const baselinePath = writeBaselineFile(root, [], {});

    const code = gate(fakeInput(filePath), filePath, {
      readBaseline, compareToBaseline, writeBaseline, isTracked: () => true,
    });

    assert.equal(
      code,
      0,
      "a pure deletion that shrinks a tracked file and removes a violation must never block",
    );
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    assert.ok(baseline.files.includes("case2.js"), "the file must be adopted into the baseline");
    assert.equal(
      baseline.counts["case2.js::file-length"],
      1,
      "the surviving file-length violation is recorded once",
    );
    assert.equal(
      baseline.counts["case2.js::complexity"],
      undefined,
      "the removed complexity violation must not be recorded",
    );

    rmSync(root, { recursive: true, force: true });
  },
);

test("git unavailable or failing falls back to today's new-file behaviour", () => {
  const root = tempRepo();
  const filePath = writeTargetFile(root, "big.js", OVER_CEILING_LINES);
  writeBaselineFile(root, [], {});

  // No isTracked override: the real isGitTracked runs against a directory
  // that is not a git work tree, so the git call fails and reports untracked.
  const code = gate(fakeInput(filePath), filePath, { readBaseline, compareToBaseline, writeBaseline });

  assert.equal(code, 2, "an unreadable tracking answer must behave like today's new-file ceiling");

  rmSync(root, { recursive: true, force: true });
});
