import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import type { fetchInstructions as FetchInstructions } from "./fetch-instructions.js";

let fetchInstructions: typeof FetchInstructions;
let lastArgs: string[] | null;

before(async () => {
  lastArgs = null;
  mock.module("node:child_process", {
    namedExports: {
      execFile: mock.fn(
        (
          _cmd: string,
          args: string[],
          _opts: unknown,
          cb: (err: Error | null, result: { stdout: string; stderr: string } | null) => void,
        ) => {
          lastArgs = args;
          const joined = args.join(" ");
          if (joined.includes("--change broken-change")) {
            cb(new Error("Unknown change: broken-change"), null);
            return;
          }
          if (joined.includes("--change not-json")) {
            cb(null, { stdout: "not json at all", stderr: "" });
            return;
          }
          cb(null, { stdout: '{"changeName":"real-change","resolvedOutputPath":"C:/x/dod.md"}', stderr: "" });
        },
      ),
    },
  });
  ({ fetchInstructions } = await import("./fetch-instructions.js"));
});

describe("fetchInstructions", () => {
  it("parses the openspec CLI's JSON output into OpenSpecInstructions", async () => {
    const instructions = await fetchInstructions("real-change", "C:/repo");
    assert.equal(instructions.changeName, "real-change");
    assert.equal(instructions.resolvedOutputPath, "C:/x/dod.md");
  });

  it("runs 'openspec instructions dod --change <id> --json' through the shell", async () => {
    await fetchInstructions("real-change", "C:/repo");
    const joined = (lastArgs ?? []).join(" ");
    assert.match(joined, /openspec instructions dod --change real-change --json/);
  });

  it("throws a clear error when the openspec CLI itself fails", async () => {
    await assert.rejects(() => fetchInstructions("broken-change", "C:/repo"), /Unknown change: broken-change/);
  });

  it("throws a clear error when the CLI's stdout is not valid JSON", async () => {
    await assert.rejects(() => fetchInstructions("not-json", "C:/repo"), /did not print valid JSON/);
  });
});
