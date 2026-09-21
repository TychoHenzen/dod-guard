import assert from "node:assert/strict";
import { test } from "node:test";
import { runTextstat } from "../../src/plaintext-textstat/index.js";
import {
  easyText,
  textstatResponse,
} from "./plaintext-readability-test-support.js";

test("validates configured textstat arguments", () => {
  const previous = process.env.QUALITY_GUARD_TEXTSTAT_ARGS;
  const response = textstatResponse();
  try {
    process.env.QUALITY_GUARD_TEXTSTAT_ARGS = "not json";
    assert.equal(
      runTextstat(easyText, { spawn: () => response }).status,
      "unavailable",
    );
    process.env.QUALITY_GUARD_TEXTSTAT_ARGS = JSON.stringify(["-c", "ok"]);
    const configured = runTextstat(easyText, {
      spawn: (_command, args) => {
        assert.deepEqual(args, ["-c", "ok"]);
        return response;
      },
    });
    assert.equal(configured.status, "ok");
    process.env.QUALITY_GUARD_TEXTSTAT_ARGS = JSON.stringify(["-c", 1]);
    assert.equal(
      runTextstat(easyText, { spawn: () => response }).status,
      "unavailable",
    );
  } finally {
    if (previous === undefined) delete process.env.QUALITY_GUARD_TEXTSTAT_ARGS;
    else process.env.QUALITY_GUARD_TEXTSTAT_ARGS = previous;
  }
});
