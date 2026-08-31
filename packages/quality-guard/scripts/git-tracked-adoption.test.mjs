import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { compareToBaseline, readBaseline, writeBaseline } from "./baseline-lib.mjs";
import { gate } from "./quality-guard.mjs";

/**
 * A file whose file-length violation is over the normal 300-line hard bound.
 */
const OVER_BOUND_LINES = 301;

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

// covers: quality-guard/write-gate :: A new file is held to normal hard bounds :: New file exceeds normal file limit
test("an unseen source file over the normal bound blocks without changing the baseline", () => {
  const root = tempRepo();
  const filePath = writeTargetFile(root, "big.js", OVER_BOUND_LINES);
  const baselinePath = writeBaselineFile(root, [], {});
  const before = readFileSync(baselinePath, "utf8");

  const code = gate(fakeInput(filePath), filePath, {
    readBaseline, compareToBaseline, writeBaseline, isTracked: () => true,
  });

  assert.equal(code, 2);
  assert.equal(readFileSync(baselinePath, "utf8"), before, "a blocked write must not update the tracked baseline");

  rmSync(root, { recursive: true, force: true });
});

// covers: quality-guard/write-gate :: A blocked write records nothing :: Oversized new file is blocked
test("a blocked tracked source write preserves the tracked baseline byte-for-byte", () => {
  const root = tempRepo();
  const filePath = writeTargetFile(root, "blocked.js", OVER_BOUND_LINES);
  const baselinePath = writeBaselineFile(root, [], {});
  const before = readFileSync(baselinePath, "utf8");

  const code = gate(fakeInput(filePath), filePath, {
    readBaseline, compareToBaseline, writeBaseline, isTracked: () => true,
  });

  assert.equal(code, 2);
  assert.equal(readFileSync(baselinePath, "utf8"), before, "a blocked write must not update the tracked baseline");

  rmSync(root, { recursive: true, force: true });
});

test("an untracked source file is held to the same normal bound", () => {
  const root = tempRepo();
  const filePath = writeTargetFile(root, "big.js", OVER_BOUND_LINES);
  const baselinePath = writeBaselineFile(root, [], {});

  const code = gate(fakeInput(filePath), filePath, {
    readBaseline, compareToBaseline, writeBaseline, isTracked: () => false,
  });

  assert.equal(code, 2, "an untracked file past the normal bound must block");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  assert.deepEqual(baseline.files, [], "a blocked write must not adopt the file");

  rmSync(root, { recursive: true, force: true });
});

// covers: quality-guard/write-gate :: A new file is held to normal hard bounds :: New file contains a second top-level type
test("an unseen source file with two top-level types blocks without baseline adoption", () => {
  const root = tempRepo();
  const filePath = join(root, "two-types.js");
  writeFileSync(filePath, "class One {}\nclass Two {}\n");
  const baselinePath = writeBaselineFile(root, [], {});
  const before = readFileSync(baselinePath, "utf8");

  const code = gate(fakeInput(filePath), filePath, { readBaseline, compareToBaseline, writeBaseline });

  assert.equal(code, 2);
  assert.equal(readFileSync(baselinePath, "utf8"), before);
  rmSync(root, { recursive: true, force: true });
});

test("a tracked file the baseline already knows still blocks on a regression", () => {
  const root = tempRepo();
  // todo-marker violations scale with the number of markers, so five of them
  // reads as a real regression against a baseline that recorded four. The hook
  // leaves line-length to the formatter, so it cannot carry this test.
  const marked = "// TODO: left behind\n";
  const filePath = join(root, "known.js");
  writeFileSync(filePath, marked.repeat(5));
  writeBaselineFile(root, ["known.js"], { "known.js::todo-marker": 4 });

  const code = gate(fakeInput(filePath), filePath, {
    readBaseline, compareToBaseline, writeBaseline, isTracked: () => true,
  });

  assert.equal(code, 2, "the ratchet must still block a file the baseline already tracks");

  rmSync(root, { recursive: true, force: true });
});

// covers: quality-guard/write-gate :: Write-time success is not commit evidence :: File-local write passes
test("a clean file-local write passes without changing the baseline", () => {
  const root = tempRepo();
  const filePath = writeTargetFile(root, "file-local.js", 10);
  const baselinePath = writeBaselineFile(root, [], {});
  const before = readFileSync(baselinePath, "utf8");

  const code = gate(fakeInput(filePath), filePath, {
    readBaseline, compareToBaseline, writeBaseline, isTracked: () => false,
  });

  assert.equal(code, 0, "a clean file-local write should be allowed");
  assert.equal(readFileSync(baselinePath, "utf8"), before);

  rmSync(root, { recursive: true, force: true });
});

// covers: quality-guard/write-gate :: A blocked write records nothing :: Write is allowed after adoption
test("an allowed tracked source write preserves the adopted baseline byte-for-byte", () => {
  const root = tempRepo();
  const filePath = writeTargetFile(root, "allowed.js", 10);
  const baselinePath = writeBaselineFile(root, ["allowed.js"], {});
  const before = readFileSync(baselinePath, "utf8");

  const code = gate(fakeInput(filePath), filePath, {
    readBaseline, compareToBaseline, writeBaseline, isTracked: () => true,
  });

  assert.equal(code, 0, "a clean adopted file should be allowed");
  assert.equal(readFileSync(baselinePath, "utf8"), before);

  rmSync(root, { recursive: true, force: true });
});

// covers: quality-guard/write-gate :: Gate declines work it cannot judge :: Repository has no baseline
test("a missing baseline still runs file-local hard-bound checks", () => {
    const root = tempRepo();
    const filePath = writeTargetFile(root, "no-baseline.js", OVER_BOUND_LINES);

    const code = gate(fakeInput(filePath), filePath, {
      readBaseline, compareToBaseline, writeBaseline, isTracked: () => true,
    });

    assert.equal(code, 2, "the normal hard bound applies even when baseline comparison is unavailable");
    assert.equal(existsSync(join(root, ".github", "quality", "quality-baseline.json")), false);

    rmSync(root, { recursive: true, force: true });
});

test("git unavailable or failing falls back to today's new-file behaviour", () => {
  const root = tempRepo();
  const filePath = writeTargetFile(root, "big.js", OVER_BOUND_LINES);
  writeBaselineFile(root, [], {});

  // No isTracked override: the real isGitTracked runs against a directory
  // that is not a git work tree, so the git call fails and reports untracked.
  const code = gate(fakeInput(filePath), filePath, { readBaseline, compareToBaseline, writeBaseline });

  assert.equal(code, 2, "an unreadable tracking answer does not weaken normal hard bounds");

  rmSync(root, { recursive: true, force: true });
});
