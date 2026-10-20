// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { CompletionError } from "./completion-error.mjs";
import { errorMessage, ghJsonPages, isHttpNotFound, isHttpNotFoundText, readNamed, runGh } from "./gh-runner.mjs";

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

test("ghJsonPages flattens the named array of every page", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return { status: 0, stderr: "", stdout: JSON.stringify([{ items: [1, 2] }, { items: [3] }]) };
  };

  assert.deepEqual(ghJsonPages("repos/o/r/x", "items", runner), [1, 2, 3]);
  assert.deepEqual(calls[0], ["api", "--paginate", "--slurp", "repos/o/r/x"]);
});

test("ghJsonPages names the endpoint and field when a page lacks the array", () => {
  const shape = {
    code: "github_response_shape",
    message: "GitHub response for repos/o/r/x must include an array items.",
  };
  const withoutArray = () => ({ status: 0, stderr: "", stdout: JSON.stringify([{ items: "no" }]) });
  const empty = () => ({ status: 0, stderr: "", stdout: "" });

  assert.throws(() => ghJsonPages("repos/o/r/x", "items", withoutArray), shape);
  assert.throws(() => ghJsonPages("repos/o/r/x", "items", empty), shape);
});

test("readNamed adds the endpoint to a plain failure and passes a CompletionError through", () => {
  assert.throws(
    () =>
      readNamed("branch protection", "repos/o/r/p", () => {
        throw new Error("HTTP 500");
      }),
    { message: "Failed to read branch protection at repos/o/r/p: HTTP 500" },
  );

  const kept = new CompletionError("x_code", "kept");
  assert.throws(
    () =>
      readNamed("branch protection", "repos/o/r/p", () => {
        throw kept;
      }),
    (error) => error === kept,
  );
});

test("errorMessage and isHttpNotFound", () => {
  assert.equal(errorMessage(new Error("a")), "a");
  assert.equal(errorMessage("b"), "b");

  assert.equal(isHttpNotFound({ status: 1, stderr: "gh: Not Found (HTTP 404)" }), true);
  assert.equal(isHttpNotFound({ status: 1, stderr: "HTTP 403: Forbidden" }), false);
  assert.equal(isHttpNotFound({ status: 0, stderr: "HTTP 404" }), false);
  assert.equal(isHttpNotFound({ status: 2, stderr: "HTTP 404" }), false);
});

test("the text-only 404 matcher ignores the exit status", () => {
  assert.equal(isHttpNotFoundText("gh: Not Found (HTTP 404)"), true);
  assert.equal(isHttpNotFoundText("HTTP 403: Forbidden"), false);
  assert.equal(isHttpNotFoundText(undefined), false);
  assert.equal(isHttpNotFoundText(null), false);
});
