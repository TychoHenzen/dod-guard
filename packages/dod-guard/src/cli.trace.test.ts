/**
 * The 'trace' command's full happy/blocked/no-dod paths, through runCli.
 * Split out from cli.test.ts because it needs node:child_process mocked
 * before cli.js (and its openspec/fetch-instructions.js dependency) load -
 * see the "ESM mock.module ordering" rule in the repo CLAUDE.md.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import type { EXIT as ExitT, runCli as RunCli } from "./cli.js";
import type * as StoreModule from "./store.js";
import type { DodDocument } from "./types.js";

let runCli: typeof RunCli;
let EXIT: typeof ExitT;
let store: typeof StoreModule;

/** Path in the mocked `openspec instructions dod --change <id> --json` output.
 * Never touched on disk - findByPath only ever compares this string. */
function targetPathFor(changeId: string): string {
  return join(os.tmpdir(), `dod-guard-trace-target-${changeId}.md`);
}

before(async () => {
  mock.module("node:child_process", {
    namedExports: {
      // checker-vcs.ts and snapshot.ts (pulled in transitively through
      // cli.js) import `exec` too - mock.module replaces every named
      // export of the module, so it has to stay present even unused here.
      exec: mock.fn(),
      execFile: mock.fn(
        (
          _cmd: string,
          args: string[],
          _opts: unknown,
          cb: (err: Error | null, result: { stdout: string; stderr: string } | null) => void,
        ) => {
          const joined = args.join(" ");
          const match = joined.match(/--change (\S+)/);
          const changeId = match ? match[1] : "unknown-change";
          cb(null, {
            stdout: JSON.stringify({
              changeName: changeId,
              artifactId: "dod",
              schemaName: "default",
              changeDir: os.tmpdir(),
              outputPath: "dod.md",
              resolvedOutputPath: targetPathFor(changeId),
              existingOutputPaths: [],
              description: "test change",
              instruction: "",
              template: "",
              dependencies: [],
              unlocks: [],
              root: { path: os.tmpdir(), source: "test" },
            }),
            stderr: "",
          });
        },
      ),
    },
  });
  ({ runCli, EXIT } = await import("./cli.js"));
  store = await import("./store.js");
});

let storeDir: string;

beforeEach(async () => {
  storeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-store-"));
  process.env.DOD_STORE_DIR = storeDir;
});

afterEach(async () => {
  delete process.env.DOD_STORE_DIR;
  await fs.rm(storeDir, { recursive: true, force: true });
});

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { write: (s: string) => out.push(s), writeErr: (s: string) => err.push(s) },
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

function minimalDoc(changeId: string, overrides: Partial<DodDocument> = {}): DodDocument {
  return {
    id: store.generateId(),
    title: "A traced DoD",
    goal: "prove something",
    date: "2026-08-11",
    cwd: os.tmpdir(),
    markdown_path: targetPathFor(changeId),
    created_at: "2026-08-11T00:00:00.000Z",
    sections: { requirements: "" },
    roots: [],
    amendments: [],
    ...overrides,
  };
}

describe("runCli trace", () => {
  it("exits ERROR and reports no DoD when none is registered for the change", async () => {
    const { io, err } = captureIo();
    const code = await runCli(["trace", "change-no-dod"], io);
    assert.equal(code, EXIT.ERROR);
    assert.match(err(), /No DoD found for change "change-no-dod"/);
  });

  it("exits FAIL and lists the untraced leaf when a DoD leaf traces to no scenario", async () => {
    const doc = minimalDoc("change-blocked", {
      roots: [
        {
          id: "group-1",
          title: "Some requirement",
          refinement: "draft",
          last_status: "draft",
          children: [
            {
              id: "leaf-1",
              title: "An untraced leaf",
              refinement: "concrete",
              command: "npm --version",
              predicate: { type: "exit_code", value: 0 },
              description: "some behavior",
              category: "other",
              last_status: "pending",
            },
          ],
        },
      ],
    });
    await store.save(doc);

    const { io, out } = captureIo();
    const code = await runCli(["trace", "change-blocked"], io);

    assert.equal(code, EXIT.FAIL);
    assert.match(out(), /UNTRACED LEAVES \(blocking\):/);
    assert.match(out(), /Some requirement > An untraced leaf/);
  });

  it("exits PASS when every DoD leaf traces to a scenario", async () => {
    const doc = minimalDoc("change-ok", { roots: [] });
    await store.save(doc);

    const { io, out } = captureIo();
    const code = await runCli(["trace", "change-ok"], io);

    assert.equal(code, EXIT.PASS);
    assert.match(out(), /All leaves trace to a scenario\./);
  });
});
