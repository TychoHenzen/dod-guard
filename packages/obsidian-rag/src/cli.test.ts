import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

// ── Mock state ────────────────────────────────────────────────────────────

let execFileResult: { stdout: string; stderr: string } = { stdout: "", stderr: "" };
let execFileThrows = false;
const execFileError = new Error("CLI failed");

mock.module("node:child_process", {
  namedExports: {
    execFile: mock.fn((_cmd: string, _args?: string[], _opts?: any, _cb?: any) => {
      // promisify(execFile) expects signature (cmd, args?, opts?, callback)
      // We return the callback directly if provided, otherwise we return something
      // that promisify can work with
      // On first call during module init, execFile(null) is called by the real code?
      // Actually execFileP = promisify(execFile), which creates a function that
      // calls execFile(cmd, args, opts, callback). So we need to handle that.
      // If a 4th arg (callback) is present, call it
      const cb = typeof _opts === "function" ? _opts : typeof _args === "function" ? _args : _cb;
      if (typeof cb === "function") {
        if (execFileThrows) {
          cb(execFileError);
        } else {
          cb(null, execFileResult.stdout, execFileResult.stderr);
        }
        return undefined as any;
      }
      // execFile called without callback (for launching GUI)
      return { unref: () => {} } as any;
    }),
  },
});

mock.module("node:util", {
  namedExports: {
    promisify: mock.fn((fn: (...args: any[]) => any) => {
      return (...args: any[]) => {
        return new Promise((resolve, reject) => {
          fn(...args, (err: any, stdout: string, stderr: string) => {
            if (err) reject(err);
            else resolve({ stdout: stdout || "", stderr: stderr || "" });
          });
        });
      };
    }),
  },
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("cli", () => {
  let mod: any;

  before(async () => {
    execFileResult = { stdout: "", stderr: "" };
    execFileThrows = false;
    mod = await import("./cli.js");
  });

  function reset() {
    execFileResult = { stdout: "", stderr: "" };
    execFileThrows = false;
  }

  describe("cliAvailable", () => {
    it("returns true when exec succeeds", async () => {
      reset();
      execFileResult = { stdout: "obsidian 1.0", stderr: "" };
      assert.equal(await mod.cliAvailable(), true);
    });

    it("returns false when exec fails", async () => {
      reset();
      execFileThrows = true;
      assert.equal(await mod.cliAvailable(), false);
    });
  });

  describe("listVaults", () => {
    it("parses vaults verbose output", async () => {
      reset();
      execFileResult = { stdout: "VAULT1\t/path/1\nVAULT2\t/path/2\n", stderr: "" };
      const vaults = await mod.listVaults();
      assert.equal(vaults.length, 2);
      assert.equal(vaults[0].name, "VAULT1");
      assert.equal(vaults[1].path, "/path/2");
    });

    it("returns empty array for empty output", async () => {
      reset();
      execFileResult = { stdout: "", stderr: "" };
      const vaults = await mod.listVaults();
      assert.equal(vaults.length, 0);
    });
  });

  describe("cliReadNote", () => {
    it("returns stdout from read command", async () => {
      reset();
      execFileResult = { stdout: "note content here", stderr: "" };
      const content = await mod.cliReadNote("v1", "notes/test.md");
      assert.equal(content, "note content here");
    });
  });

  describe("cliListFiles", () => {
    it("parses newline-delimited file list", async () => {
      reset();
      execFileResult = { stdout: "notes/a.md\nnotes/b.md\n", stderr: "" };
      const files = await mod.cliListFiles("v1");
      assert.deepStrictEqual(files, ["notes/a.md", "notes/b.md"]);
    });

    it("throws on Error: prefix in output", async () => {
      reset();
      execFileResult = { stdout: "Error: Unknown command", stderr: "" };
      await assert.rejects(() => mod.cliListFiles("v1"), /obsidian CLI files failed/);
    });

    it("throws on 'Did you mean:' in output", async () => {
      reset();
      execFileResult = { stdout: "Did you mean: files?", stderr: "" };
      await assert.rejects(() => mod.cliListFiles("v1"), /obsidian CLI files failed/);
    });

    it("includes folder arg when directory provided", async () => {
      reset();
      execFileResult = { stdout: "notes/a.md\n", stderr: "" };
      const files = await mod.cliListFiles("v1", "notes");
      assert.deepStrictEqual(files, ["notes/a.md"]);
    });
  });

  describe("cliGetBacklinks", () => {
    it("parses backlinks output", async () => {
      reset();
      execFileResult = { stdout: "linked-note-1\nlinked-note-2\n", stderr: "" };
      const links = await mod.cliGetBacklinks("v1", "test.md");
      assert.deepStrictEqual(links, ["linked-note-1", "linked-note-2"]);
    });
  });

  describe("cliGetLinks", () => {
    it("parses links output", async () => {
      reset();
      execFileResult = { stdout: "target-1\ntarget-2\n", stderr: "" };
      const links = await mod.cliGetLinks("v1", "test.md");
      assert.deepStrictEqual(links, ["target-1", "target-2"]);
    });
  });

  describe("cliGetTags", () => {
    it("parses tab-separated tags with counts", async () => {
      reset();
      execFileResult = { stdout: "#dev\t5\n#ops\t3\n", stderr: "" };
      const tags = await mod.cliGetTags("v1");
      assert.equal(tags.get("dev"), 5);
      assert.equal(tags.get("ops"), 3);
    });

    it("handles empty output", async () => {
      reset();
      execFileResult = { stdout: "", stderr: "" };
      const tags = await mod.cliGetTags("v1");
      assert.equal(tags.size, 0);
    });
  });

  describe("cliCreateNote", () => {
    it("calls obsidian create without error", async () => {
      reset();
      execFileResult = { stdout: "", stderr: "" };
      await mod.cliCreateNote("v1", "new.md", "hello world");
      // Should not throw
    });
  });

  describe("cliAppendNote", () => {
    it("calls obsidian append without error", async () => {
      reset();
      execFileResult = { stdout: "", stderr: "" };
      await mod.cliAppendNote("v1", "note.md", "appended text");
      // Should not throw
    });
  });
});
