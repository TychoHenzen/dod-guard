import { EventEmitter } from "node:events";
import { readdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

// A fake spawn stands in for Codex, so no real process starts.

export const WORKDIR_PREFIX = "dod-guard-codex-advisor-";

function fakeChild(script) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  // child.pid stays undefined, so cancelProcessTree is a no-op.
  setImmediate(() => script(child));
  return child;
}

export function spawnFor(handlers = {}, beforeReturn = () => {}) {
  const calls = [];
  const spawnImpl = (executable, args, options) => {
    const kind = args.includes("--version") ? "version" : args.includes("--help") ? "help" : "exec";
    calls.push({ kind, executable, args, options });
    beforeReturn(kind);
    const handler = handlers[kind] ?? ((child) => child.emit("close", 0, null));
    return fakeChild((child) => handler(child, args));
  };
  return { calls, spawnImpl };
}

// Records the temp root's entries while the reviewer runs, so a later empty-root
// assertion proves a real work directory existed and was removed.
export function watchWorkdir(root) {
  const seen = [];
  const hook = (kind) => {
    if (kind === "exec") seen.push(...readdirSync(root));
  };
  return { seen, hook };
}

export async function makeRoot(t) {
  const root = await mkdtemp(join(tmpdir(), "advisor-branches-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

export function fakeReviewerExec(child, args) {
  writeFileSync(args[args.indexOf("--output-last-message") + 1], JSON.stringify({ advice: "x" }));
  child.stdout.emit("data", `${JSON.stringify({ type: "turn.started" })}\n`);
  child.stdout.emit("data", `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "a" } })}\n`);
  child.emit("close", 0, null);
}
