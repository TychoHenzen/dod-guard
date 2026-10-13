// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { runGh } from "./gh-runner.mjs";

function spawnReturning(result) {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return result;
  };
  return { calls, spawn };
}

test("allows Project CLI output above Node's default buffer", () => {
  const oversizedOutput = "x".repeat(1024 * 1024 + 1);
  let spawnOptions;
  const result = runGh(["api"], [0], (_command, _args, options) => {
    spawnOptions = options;
    return { status: 0, stderr: "", stdout: oversizedOutput };
  });

  assert.equal(result.stdout, oversizedOutput);
  assert.ok(spawnOptions.maxBuffer >= Buffer.byteLength(oversizedOutput));
});

test("starts gh with the arguments as given, as UTF-8 text, and with no window", () => {
  const { calls, spawn } = spawnReturning({ status: 0, stderr: "", stdout: "{}" });

  runGh(["api", "repos/owner/repo"], [0], spawn);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "gh");
  assert.deepEqual(calls[0].args, ["api", "repos/owner/repo"]);
  assert.equal(calls[0].options.encoding, "utf8");
  assert.equal(calls[0].options.windowsHide, true);
});

test("returns a non-zero exit the caller accepts, so the caller can read it", () => {
  const notFound = { status: 1, stderr: "gh: Not Found (HTTP 404)", stdout: "" };
  const { spawn } = spawnReturning(notFound);

  assert.equal(runGh(["api", "x"], [0, 1], spawn), notFound);
});

test("throws on any non-zero exit by default, with stderr, then stdout, then the exit code", () => {
  const cases = [
    [{ status: 1, stderr: " gh: Server Error (HTTP 500)\n", stdout: "body" }, "gh: Server Error (HTTP 500)"],
    [{ status: 1, stderr: "  ", stdout: ' {"message":"Bad"} ' }, '{"message":"Bad"}'],
    [{ status: 4, stderr: "", stdout: "" }, "gh exited with 4"],
    [{ status: null, stderr: "", stdout: "" }, "gh exited with null"],
  ];
  for (const [result, message] of cases) {
    const { spawn } = spawnReturning(result);
    assert.throws(() => runGh(["api", "x"], undefined, spawn), { message });
  }
});

test("rethrows a spawn error, such as gh missing from PATH", () => {
  const missing = new Error("spawnSync gh ENOENT");
  const { spawn } = spawnReturning({ error: missing, status: null, stderr: "", stdout: "" });

  assert.throws(
    () => runGh(["api", "x"], [0], spawn),
    (error) => error === missing,
  );
});
