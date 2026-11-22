import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { checkPluginVersion } from "./plugin-version-check.mjs";

const MANIFEST_ENDPOINT = "repos/TychoHenzen/dod-guard/contents/plugins/dod-guard";
const UNREADABLE_EXIT = 3;
const manifest = (version) => JSON.stringify({ name: "dod-guard", version });

function respond(value) {
  if (value instanceof Error) {
    throw value;
  }
  return value;
}

// Each side is the text a read returns, or an Error it throws. The calls are kept so a case can assert the reads.
function fakeIo({ installed, published }) {
  const calls = { read: [], run: [] };
  return {
    calls,
    read: (file) => {
      calls.read.push(file);
      return respond(installed);
    },
    run: (args) => {
      calls.run.push(args);
      return { stdout: respond(published) };
    },
  };
}

function check(client, sides) {
  const io = fakeIo(sides);
  return { result: checkPluginVersion({ client, root: "/loaded/root" }, io), io };
}

test("a loaded copy older than the published release is stale and lists the Claude refresh commands", () => {
  const { result, io } = check("claude", { installed: manifest("5.4.61"), published: manifest("5.13.4") });
  assert.equal(result.status, "stale");
  assert.equal(result.installed, "5.4.61");
  assert.equal(result.published, "5.13.4");
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.refresh, ["/plugin marketplace update dod-guard", "/reload-plugins"]);
  assert.deepEqual(io.calls.read, [path.join("/loaded/root", ".claude-plugin/plugin.json")]);
  assert.deepEqual(io.calls.run, [
    ["api", "-H", "Accept: application/vnd.github.raw+json", `${MANIFEST_ENDPOINT}/.claude-plugin/plugin.json`],
  ]);
});

test("Codex reads the Codex manifest on both sides and lists the Codex refresh commands", () => {
  const { result, io } = check("codex", { installed: manifest("5.13.3"), published: manifest("5.13.4") });
  assert.equal(result.status, "stale");
  assert.equal(result.refresh[0], "codex plugin marketplace upgrade dod-guard-monorepo");
  assert.equal(io.calls.read[0], path.join("/loaded/root", ".codex-plugin/plugin.json"));
  assert.equal(io.calls.run[0].at(-1), `${MANIFEST_ENDPOINT}/.codex-plugin/plugin.json`);
});

test("equal and newer loaded versions pass with nothing to refresh", () => {
  for (const [installed, status] of [
    ["5.13.4", "current"],
    ["5.14.0", "ahead"],
  ]) {
    const { result } = check("claude", { installed: manifest(installed), published: manifest("5.13.4") });
    assert.deepEqual([result.status, result.exitCode, result.refresh, result.problems], [status, 0, [], []]);
  }
});

test("a failed GitHub read is unreadable, keeps the loaded version and names the failure", () => {
  const { result } = check("claude", { installed: manifest("5.13.4"), published: new Error("HTTP 404") });
  assert.deepEqual(
    [result.status, result.exitCode, result.installed, result.published],
    ["unreadable", UNREADABLE_EXIT, "5.13.4", null],
  );
  assert.deepEqual(result.problems, ["HTTP 404"]);
});

test("a rerun after a failed GitHub read gives the real verdict because no state is kept", () => {
  const failed = check("claude", { installed: manifest("5.4.61"), published: new Error("HTTP 502") });
  const rerun = check("claude", { installed: manifest("5.4.61"), published: manifest("5.13.4") });
  assert.deepEqual([failed.result.status, rerun.result.status], ["unreadable", "stale"]);
  assert.deepEqual(rerun.result.problems, []);
});

test("an unreadable loaded manifest is unreadable and the published read still happens", () => {
  const { result, io } = check("claude", { installed: new Error("ENOENT"), published: manifest("5.13.4") });
  assert.deepEqual([result.status, result.installed, result.published], ["unreadable", null, "5.13.4"]);
  assert.deepEqual(result.problems, ["ENOENT"]);
  assert.equal(io.calls.run.length, 1);
});

test("a manifest with no version string or with malformed JSON is unreadable with one problem", () => {
  for (const text of [JSON.stringify({ name: "dod-guard" }), "{not json"]) {
    const { result } = check("claude", { installed: text, published: manifest("5.13.4") });
    assert.equal(result.status, "unreadable");
    assert.equal(result.problems.length, 1);
  }
});
