import assert from "node:assert/strict";
import { test } from "node:test";
import { main } from "./check-coverage.mjs";

test("coverage reports metrics without deciding or writing a threshold", () => {
  let output = "";
  let errors = "";
  const result = main([], {
    measure: () => ({
      qualityGuard: { statements: 80, branches: 70, functions: 90, lines: 80 },
    }),
    stdout: {
      write: (chunk) => {
        output += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        errors += chunk;
      },
    },
  });

  assert.equal(result, 0);
  assert.match(output, /qualityGuard/);
  assert.match(output, /coverage advisory/);
  assert.equal(errors, "");
});

test("coverage rejects obsolete writer arguments without touching the workspace", () => {
  let output = "";
  const result = main(["--write-baseline"], {
    stdout: {
      write: (chunk) => {
        output += chunk;
      },
    },
    stderr: { write: () => {} },
  });

  assert.equal(result, 3);
  assert.equal(output, "");
});
