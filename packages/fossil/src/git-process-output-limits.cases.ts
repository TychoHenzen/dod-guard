import assert from "node:assert/strict";
import { test } from "node:test";
import { collectBoundedGitOutput } from "./git-process.js";
import { assertResourceLimit, pipedChild } from "./git-process.test-support.js";

test(
  "terminates Git ingestion when stdout exceeds its limit without resolving " +
    "partial output",
  async () => {
    const exact = pipedChild();
    const exactResult = collectBoundedGitOutput(exact.child, {
      limits: { maximumStdoutBytes: 3 },
    });
    exact.emitStdout("abc");
    exact.close(0);
    assert.equal((await exactResult).stdout, "abc");
    assert.equal(exact.killCalls, 0);

    const process = pipedChild();
    const result = collectBoundedGitOutput(process.child, {
      limits: { maximumStdoutBytes: 3 },
    });
    let resolved = false;
    result.then(
      () => {
        resolved = true;
      },
      () => undefined,
    );

    process.emitStdout("ab");
    process.emitStdout("cd");
    process.close(0);

    await assertResourceLimit(result, "Git stdout limit exceeded.");
    assert.equal(process.killCalls, 1);
    assert.equal(resolved, false);
  },
);

test("terminates Git ingestion when stderr exceeds its limit", async () => {
  const process = pipedChild();
  const result = collectBoundedGitOutput(process.child, {
    limits: { maximumStderrBytes: 2 },
  });

  process.emitStderr("ab");
  process.emitStderr("c");

  await assertResourceLimit(result, "Git stderr limit exceeded.");
  assert.equal(process.killCalls, 1);
});
