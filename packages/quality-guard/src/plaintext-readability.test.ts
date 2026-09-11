import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import {
  checkPlaintextReadability,
  READABILITY_POLICY,
  readabilityExitCode,
  runTextstat,
  unavailableReadabilityResult,
} from "./plaintext-readability.js";

const easyText =
  "This short guide explains the change in plain language. " +
  "Each sentence has a clear subject and a direct verb. " +
  "Readers can scan the steps, understand the reason, and choose the next action. " +
  "The wording avoids dense terms and keeps the main idea visible.";

test("passes easy text with the documented measure policy", () => {
  const result = checkPlaintextReadability(easyText, () => ({
    status: "ok",
    measures: { fleschReadingEase: 72, fleschKincaidGrade: 8 },
  }));

  assert.equal(result.status, "pass");
  assert.equal(result.score, 100);
  assert.equal(result.threshold, READABILITY_POLICY.threshold);
  assert.deepEqual(result.constraintFailures, []);
});

test("reports measured values, threshold, and context for failing text", () => {
  const result = checkPlaintextReadability(easyText, () => ({
    status: "ok",
    measures: { fleschReadingEase: 20, fleschKincaidGrade: 14 },
  }));

  assert.equal(result.status, "fail");
  assert.equal(result.measures?.fleschReadingEase, 20);
  assert.equal(result.measures?.fleschKincaidGrade, 14);
  assert.equal(result.score, 20);
  assert.match(result.message, /combined score 20; threshold 80/);
  assert.match(result.message, /Context:/);
});

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
        return {
          pid: 1,
          output: [],
          stdout: JSON.stringify({
            measures: { fleschReadingEase: 70, fleschKincaidGrade: 8 },
          }),
          stderr: "",
          status: 0,
          signal: null,
        };
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
          return {
            pid: 1,
            output: [],
            stdout: JSON.stringify({
              measures: { fleschReadingEase: 70, fleschKincaidGrade: 8 },
            }),
            stderr: "",
            status: 0,
            signal: null,
          };
        },
      });
      assert.equal(alternate.status, "ok");
      assert.ok(alternateEnv);
    } finally {
      Object.defineProperty(process, "platform", { value: actualPlatform });
    }
  } finally {
    if (command === undefined)
      delete process.env.QUALITY_GUARD_TEXTSTAT_COMMAND;
    else process.env.QUALITY_GUARD_TEXTSTAT_COMMAND = command;
    if (args === undefined) delete process.env.QUALITY_GUARD_TEXTSTAT_ARGS;
    else process.env.QUALITY_GUARD_TEXTSTAT_ARGS = args;
  }
});

test("reports textstat start failures and maps readability exit codes", () => {
  const errorResult = runTextstat(easyText, {
    spawn: () => {
      throw new Error("python missing");
    },
  });
  assert.equal(errorResult.status, "unavailable");
  if (errorResult.status === "unavailable") {
    assert.match(errorResult.reason, /python missing/);
  }

  const valueResult = runTextstat(easyText, {
    spawn: () => {
      throw "python missing";
    },
  });
  assert.equal(valueResult.status, "unavailable");
  if (valueResult.status === "unavailable") {
    assert.match(valueResult.reason, /python missing/);
  }
  assert.equal(readabilityExitCode("fail"), 2);
  assert.equal(readabilityExitCode("pass"), 0);
});

test("unavailable results report unavailable rather than skipped", () => {
  const result = unavailableReadabilityResult("stdin broke");
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /Readability check unavailable: stdin broke/);
  assert.doesNotMatch(result.message, /skipped/);
});

test("skips empty and short input without invoking textstat", () => {
  let called = false;
  const provider = () => {
    called = true;
    return {
      status: "ok" as const,
      measures: { fleschReadingEase: 70, fleschKincaidGrade: 8 },
    };
  };

  assert.equal(checkPlaintextReadability("", provider).status, "skipped");
  assert.equal(
    checkPlaintextReadability("Only a few words.", provider).status,
    "skipped",
  );
  assert.equal(called, false);
});

test("normalizes Markdown, code, identifiers, citations, and keeps non-ASCII prose", () => {
  let checked = "";
  const result = checkPlaintextReadability(
    [
      "# A guide",
      "This is a readable sentence with café and naïve terms for a reader.",
      "Use [the next step](https://example.invalid/next) after this sentence.",
      "The `internalName` value is not prose and should not affect the score.",
      "```js",
      "const hidden_identifier = true;",
      "```",
      "The citation [1] supports the sentence and the words stay clear.",
    ].join("\n"),
    (text) => {
      checked = text;
      return {
        status: "ok",
        measures: { fleschReadingEase: 70, fleschKincaidGrade: 8 },
      };
    },
  );

  assert.equal(result.status, "pass");
  assert.match(checked, /café/);
  assert.doesNotMatch(checked, /hidden_identifier|internalName/);
  assert.doesNotMatch(checked, /```|\[1\]|https:\/\//);
});

test("keeps soft line breaks inside one sentence and reports its context", () => {
  const longSentence = [
    "laterMarker",
    ...Array.from({ length: 25 }, () => "plain"),
  ].join(" ");
  const result = checkPlaintextReadability(
    `Intro sentence.\n${longSentence}`,
    () => ({
      status: "ok",
      measures: { fleschReadingEase: 70, fleschKincaidGrade: 8 },
    }),
  );

  assert.equal(result.status, "fail");
  assert.match(result.constraintFailures[0], /26 words/);
  assert.match(result.context ?? "", /laterMarker/);
});

test("reports an unsupported language and missing textstat as unavailable", () => {
  const unsupportedScript = checkPlaintextReadability("中文", () => {
    throw new Error("provider should not run for an unsupported script");
  });
  assert.equal(unsupportedScript.status, "unavailable");

  const unsupported = checkPlaintextReadability(easyText, () => ({
    status: "unavailable",
    reason: "textstat reported that the input language is unsupported",
  }));
  assert.equal(unsupported.status, "unavailable");

  const missing = runTextstat(easyText, {
    command: "quality-guard-textstat-missing",
  });
  assert.equal(missing.status, "unavailable");
});

test("validates configured textstat arguments", () => {
  const previous = process.env.QUALITY_GUARD_TEXTSTAT_ARGS;
  const response = {
    pid: 1,
    output: [],
    stdout: JSON.stringify({
      measures: { fleschReadingEase: 70, fleschKincaidGrade: 8 },
    }),
    stderr: "",
    status: 0,
    signal: null,
  };
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

test("fails open for malformed, timed-out, and internally failing providers", () => {
  const malformed = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "process.stdout.write('not json')"],
  });
  assert.equal(malformed.status, "unavailable");

  const scalar = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "process.stdout.write('null')"],
  });
  assert.equal(scalar.status, "unavailable");

  const unsupported = runTextstat(easyText, {
    command: process.execPath,
    args: [
      "-e",
      "process.stdout.write(JSON.stringify({ languageSupported: false }))",
    ],
  });
  assert.equal(unsupported.status, "unavailable");

  const invalidMeasures = runTextstat(easyText, {
    command: process.execPath,
    args: [
      "-e",
      "process.stdout.write(JSON.stringify({ measures: { fleschReadingEase: null, fleschKincaidGrade: 8 } }))",
    ],
  });
  assert.equal(invalidMeasures.status, "unavailable");

  const missingMeasures = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "process.stdout.write(JSON.stringify({ measures: null }))"],
  });
  assert.equal(missingMeasures.status, "unavailable");

  const timedOut = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 10000)"],
  });
  assert.equal(timedOut.status, "unavailable");

  const internalFailure = checkPlaintextReadability(easyText, () => {
    throw new Error("provider failure");
  });
  assert.equal(internalFailure.status, "unavailable");

  const valueFailure = checkPlaintextReadability(easyText, () => {
    throw "provider failure";
  });
  assert.equal(valueFailure.status, "unavailable");
});
