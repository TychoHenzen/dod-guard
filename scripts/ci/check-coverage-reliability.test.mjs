import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";

import { main, writeBaseline } from "./check-coverage.mjs";

const baseline = {
  "quality-guard": {
    statements: 95,
    branches: 89,
    functions: 96,
    lines: 95,
  },
};
const current = { "quality-guard": { ...baseline["quality-guard"] } };
const PARTIAL_BYTES = 12;
const MISSING_BASELINE_ERROR = /baseline.*missing/;
const VALID_JSON_ERROR = /must contain valid JSON/;
const FINITE_VALUE_ERROR = /must be a finite number/;
const CURRENT_COVERAGE_ERROR = /current coverage/;
const PARTIAL_WRITE_ERROR = /simulated partial write/;
const RENAME_ERROR = /simulated rename failure/;

function withTemporaryBaseline(callback) {
  const directory = mkdtempSync(join(tmpdir(), "check-coverage-reliability-"));
  const path = join(directory, "coverage-baseline.json");
  try {
    writeBaseline(baseline, path);
    return callback(path, readFileSync(path));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("check-only refuses malformed current data before comparison", () => {
  withTemporaryBaseline((path, before) => {
    let error = "";
    const exitCode = main([], {
      measure: () => ({
        ...current,
        "quality-guard": { ...current["quality-guard"], statements: "95" },
      }),
      baselinePath: path,
      stderr: {
        write(message) {
          error += message;
        },
      },
    });

    assert.equal(exitCode, 1);
    assert.match(error, CURRENT_COVERAGE_ERROR);
    assert.deepEqual(readFileSync(path), before);
  });
});

test("missing baseline fails before coverage measurement in both modes", () => {
  const directory = mkdtempSync(join(tmpdir(), "check-coverage-missing-"));
  const path = join(directory, "coverage-baseline.json");
  try {
    for (const argv of [[], ["--write-baseline"]]) {
      let measured = false;
      let error = "";
      const exitCode = main(argv, {
        measure: () => {
          measured = true;
          return current;
        },
        baselinePath: path,
        stderr: {
          write(message) {
            error += message;
          },
        },
      });

      assert.equal(exitCode, 1);
      assert.equal(measured, false);
      assert.match(error, MISSING_BASELINE_ERROR);
      assert.equal(existsSync(path), false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("malformed stored JSON and metric values preserve baseline bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "check-coverage-invalid-"));
  const path = join(directory, "coverage-baseline.json");
  try {
    for (const contents of [
      "{\n",
      JSON.stringify({ packages: { "quality-guard": { ...baseline["quality-guard"], lines: "95" } } }),
    ]) {
      writeFileSync(path, contents);
      const before = readFileSync(path);
      let error = "";
      const exitCode = main(["--write-baseline"], {
        measure: () => current,
        baselinePath: path,
        stderr: {
          write(message) {
            error += message;
          },
        },
      });

      assert.equal(exitCode, 1);
      if (contents === "{\n") {
        assert.match(error, VALID_JSON_ERROR);
      } else {
        assert.match(error, FINITE_VALUE_ERROR);
      }
      assert.deepEqual(readFileSync(path), before);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("atomic writer preserves baseline hash and cleans up failed temporary writes", () => {
  withTemporaryBaseline((path, before) => {
    const originalHash = hash(before);
    const temporaryPrefix = `.${basename(path)}-`;
    const temporaryFiles = () => readdirSync(dirname(path)).filter((name) => name.startsWith(temporaryPrefix));

    assert.throws(
      () =>
        writeBaseline(baseline, path, {
          writeFileSync(temporaryPath, content) {
            writeFileSync(temporaryPath, content.slice(0, PARTIAL_BYTES));
            throw new Error("simulated partial write");
          },
        }),
      PARTIAL_WRITE_ERROR,
    );
    assert.equal(hash(readFileSync(path)), originalHash);
    assert.deepEqual(temporaryFiles(), []);

    assert.throws(
      () =>
        writeBaseline(baseline, path, {
          renameSync() {
            throw new Error("simulated rename failure");
          },
        }),
      RENAME_ERROR,
    );
    assert.equal(hash(readFileSync(path)), originalHash);
    assert.deepEqual(temporaryFiles(), []);
  });
});
