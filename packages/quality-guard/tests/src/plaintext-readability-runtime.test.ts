import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { runTextstat } from "../../src/plaintext-textstat/index.js";
import {
  easyText,
  textstatResponse,
} from "./plaintext-readability-test-support.js";

test("default textstat uses an isolated interpreter environment and cwd", () => {
  const command = process.env.QUALITY_GUARD_TEXTSTAT_COMMAND;
  const args = process.env.QUALITY_GUARD_TEXTSTAT_ARGS;
  let observedCwd: string | undefined;
  let observedArgs: string[] = [];
  let observedEnv: NodeJS.ProcessEnv | undefined;
  delete process.env.QUALITY_GUARD_TEXTSTAT_COMMAND;
  delete process.env.QUALITY_GUARD_TEXTSTAT_ARGS;
  try {
    const result = runTextstat(easyText, {
      spawn: (_command, spawnArgs, options) => {
        observedCwd = options.cwd;
        observedArgs = spawnArgs;
        observedEnv = options.env;
        return textstatResponse();
      },
    });
    assert.equal(result.status, "ok");
    assert.equal(observedArgs[0], "-I");
    assert.ok(observedCwd);
    assert.notEqual(observedCwd, process.cwd());
    assert.equal(existsSync(observedCwd), false);
    assert.equal(observedEnv?.PYTHONPATH, undefined);
    assert.equal(observedEnv?.PYTHONHOME, undefined);
    const actualPlatform = process.platform;
    let alternateEnv: NodeJS.ProcessEnv | undefined;
    try {
      Object.defineProperty(process, "platform", {
        value: actualPlatform === "win32" ? "linux" : "win32",
      });
      const alternate = runTextstat(easyText, {
        spawn: (_command, _spawnArgs, options) => {
          alternateEnv = options.env;
          return textstatResponse();
        },
      });
      assert.equal(alternate.status, "ok");
      assert.ok(alternateEnv);
    } finally {
      Object.defineProperty(process, "platform", { value: actualPlatform });
    }
  } finally {
    if (command === undefined) delete process.env.QUALITY_GUARD_TEXTSTAT_COMMAND;
    else process.env.QUALITY_GUARD_TEXTSTAT_COMMAND = command;
    if (args === undefined) delete process.env.QUALITY_GUARD_TEXTSTAT_ARGS;
    else process.env.QUALITY_GUARD_TEXTSTAT_ARGS = args;
  }
});
