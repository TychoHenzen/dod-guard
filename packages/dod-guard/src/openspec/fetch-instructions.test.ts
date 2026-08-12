import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import type { fetchInstructions as FetchInstructions, fetchStatus as FetchStatus } from "./fetch-instructions.js";

let fetchInstructions: typeof FetchInstructions;
let fetchStatus: typeof FetchStatus;
let lastArgs: string[] | null;

type ExecFileCallback = (err: Error | null, result: { stdout: string; stderr: string } | null) => void;

/** Stand in for the openspec CLI, keyed off the command the shell was handed. */
function fakeOpenSpec(joined: string, cb: ExecFileCallback): void {
  if (joined.includes("--change broken-change")) {
    cb(new Error("Unknown change: broken-change"), null);
    return;
  }
  if (joined.includes("--change not-json")) {
    cb(null, { stdout: "not json at all", stderr: "" });
    return;
  }
  if (joined.includes("openspec status")) {
    cb(null, { stdout: '{"artifacts":[{"id":"dod","status":"done"}]}', stderr: "" });
    return;
  }
  cb(null, { stdout: '{"changeName":"real-change","resolvedOutputPath":"C:/x/dod.md"}', stderr: "" });
}

before(async () => {
  lastArgs = null;
  mock.module("node:child_process", {
    namedExports: {
      execFile: mock.fn((_cmd: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
        lastArgs = args;
        fakeOpenSpec(args.join(" "), cb);
      }),
    },
  });
  ({ fetchInstructions, fetchStatus } = await import("./fetch-instructions.js"));
});

describe("fetchInstructions", () => {
  it("parses the openspec CLI's JSON output into OpenSpecInstructions", async () => {
    const instructions = await fetchInstructions("real-change", "C:/repo", "dod");
    assert.equal(instructions.changeName, "real-change");
    assert.equal(instructions.resolvedOutputPath, "C:/x/dod.md");
  });

  it("runs 'openspec instructions <artifact> --change <id> --json' through the shell", async () => {
    await fetchInstructions("real-change", "C:/repo", "dod");
    assert.match((lastArgs ?? []).join(" "), /openspec instructions dod --change real-change --json/);
  });

  it("asks for the artifact the caller named, not a hardcoded one", async () => {
    await fetchInstructions("real-change", "C:/repo", "steps");
    assert.match((lastArgs ?? []).join(" "), /openspec instructions steps --change real-change --json/);
  });

  it("throws a clear error when the openspec CLI itself fails", async () => {
    await assert.rejects(() => fetchInstructions("broken-change", "C:/repo", "dod"), /Unknown change: broken-change/);
  });

  it("throws a clear error when the CLI's stdout is not valid JSON", async () => {
    await assert.rejects(() => fetchInstructions("not-json", "C:/repo", "dod"), /did not print valid JSON/);
  });
});

describe("fetchStatus", () => {
  it("returns the change's artifact graph from 'openspec status --json --change <id>'", async () => {
    const status = await fetchStatus("real-change", "C:/repo");
    assert.match((lastArgs ?? []).join(" "), /openspec status --json --change real-change/);
    assert.deepEqual(status.artifacts, [{ id: "dod", status: "done" }]);
  });
});
