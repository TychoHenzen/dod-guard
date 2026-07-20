import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

// ── Mock state ────────────────────────────────────────────────────────────

let fsExistsSyncReturn = true;
let fsReadFileReturn = "{}";
let execSyncOutput = "output";
let execSyncThrows = false;
let execSyncError: any = { status: 1, stderr: "cmd failed" };
const spawnExitCode = 0;
let spawnThrows = false;
const spawnCallArgs: any[][] = [];

mock.module("node:child_process", {
  namedExports: {
    execSync: mock.fn((_cmd: string, _opts?: any) => {
      if (execSyncThrows) throw execSyncError;
      return execSyncOutput;
    }),
    spawn: mock.fn((_cmd: string, _args: string[], _opts?: any) => {
      spawnCallArgs.push([_cmd, _args, _opts]);
      const listeners: Record<string, (...args: any[]) => void> = {};
      const child: any = {
        stdin: {
          write: mock.fn(() => true),
          end: mock.fn(() => {}),
          setDefaultEncoding: mock.fn(() => {}),
        },
        stdout: {
          on: (_e: string, fn: any) => {
            listeners.stdoutData = fn;
          },
        },
        stderr: {
          on: (_e: string, fn: any) => {
            listeners.stderrData = fn;
          },
        },
        on: (event: string, fn: any) => {
          listeners[event] = fn;
        },
        kill: () => {},
        unref: () => {},
      };
      setTimeout(() => {
        if (spawnThrows) {
          listeners.error?.(new Error("ENOENT"));
        } else {
          listeners.stdoutData?.(Buffer.from("out"));
          listeners.stderrData?.(Buffer.from("err"));
          listeners.close?.(spawnExitCode);
        }
      }, 5);
      return child;
    }),
  },
});

mock.module("node:fs", {
  namedExports: {
    existsSync: mock.fn((_p: string) => fsExistsSyncReturn),
    readFileSync: mock.fn((_p: string, _enc?: string) => fsReadFileReturn),
    writeFileSync: mock.fn(() => {}),
    unlinkSync: mock.fn(() => {}),
  },
});

mock.module("node:os", {
  namedExports: {
    homedir: mock.fn(() => "C:\\Users\\test"),
    tmpdir: mock.fn(() => "C:\\Users\\test\\AppData\\Local\\Temp"),
  },
});

// Helper: fresh ESM import via cache-busting query string
let _importCounter = 0;
async function importFresh(): Promise<any> {
  return import(`./agent.js?_=${++_importCounter}`);
}

// ── getBackendApiKey branches (fresh module each test) ────────────────────

describe("getBackendApiKey — valid", () => {
  it("returns key from backends.json", async () => {
    fsExistsSyncReturn = true;
    fsReadFileReturn = JSON.stringify({ default: "ds", backends: { ds: { apiKey: "sk-abc" } } });
    const m = await importFresh();
    assert.equal(m.getBackendApiKey(), "sk-abc");
  });
});

describe("getBackendApiKey — file missing", () => {
  it("returns null", async () => {
    fsExistsSyncReturn = false;
    const m = await importFresh();
    assert.equal(m.getBackendApiKey(), null);
  });
});

describe("getBackendApiKey — no default key", () => {
  it("returns null", async () => {
    fsExistsSyncReturn = true;
    fsReadFileReturn = JSON.stringify({ backends: { ds: { apiKey: "sk" } } });
    const m = await importFresh();
    assert.equal(m.getBackendApiKey(), null);
  });
});

describe("getBackendApiKey — no backends field", () => {
  it("returns null", async () => {
    fsExistsSyncReturn = true;
    fsReadFileReturn = JSON.stringify({ default: "ds" });
    const m = await importFresh();
    assert.equal(m.getBackendApiKey(), null);
  });
});

describe("getBackendApiKey — backend missing apiKey", () => {
  it("returns null", async () => {
    fsExistsSyncReturn = true;
    fsReadFileReturn = JSON.stringify({ default: "ds", backends: { ds: {} } });
    const m = await importFresh();
    assert.equal(m.getBackendApiKey(), null);
  });
});

describe("getBackendApiKey — JSON parse error", () => {
  it("returns null on malformed JSON", async () => {
    fsExistsSyncReturn = true;
    fsReadFileReturn = "not json {{{";
    const m = await importFresh();
    assert.equal(m.getBackendApiKey(), null);
  });
});

describe("getBackendApiKey — re-probes after null", () => {
  it("picks up late-created backends.json", async () => {
    fsExistsSyncReturn = false; // no file yet
    const m = await importFresh();

    assert.equal(m.getBackendApiKey(), null); // first call: null

    // Now the file appears
    fsExistsSyncReturn = true;
    fsReadFileReturn = JSON.stringify({ default: "ds", backends: { ds: { apiKey: "sk-late" } } });

    assert.equal(m.getBackendApiKey(), "sk-late"); // re-probes and finds it
  });
});

describe("resolveApiKey — empty fallback", () => {
  it("returns empty when nothing configured", async () => {
    fsExistsSyncReturn = false;
    delete process.env.DEEPSEEK_API_KEY;
    const m = await importFresh();
    assert.equal(m.resolveApiKey(), "");
    assert.equal(m.apiKeySource(), "none");
  });
});

describe("apiKeySource — backends_json", () => {
  it("returns backends_json when key from file", async () => {
    fsExistsSyncReturn = true;
    fsReadFileReturn = JSON.stringify({ default: "ds", backends: { ds: { apiKey: "sk-b" } } });
    delete process.env.DEEPSEEK_API_KEY;
    const m = await importFresh();
    assert.equal(m.apiKeySource(), "backends_json");
  });
});

// ── Main agent tests (single shared import) ───────────────────────────────

describe("agent — pure functions", () => {
  let mod: any;
  before(async () => {
    mod = await importFresh();
  });

  describe("hashFailure", () => {
    it("hex output", () => assert.ok(/^[0-9a-f]+$/.test(mod.hashFailure("err"))));
    it("normalizes timestamps", () =>
      assert.equal(mod.hashFailure("2024-03-15T14:30:00 x"), mod.hashFailure("2025-01-01T00:00:00 x")));
    it("normalizes file:line", () =>
      assert.equal(mod.hashFailure("/a/foo.ts:42: x"), mod.hashFailure("/b/bar.ts:99: x")));
    it("normalizes hex", () => assert.equal(mod.hashFailure("0x7f8a x"), mod.hashFailure("0xdead x")));
    it("normalizes durations", () => assert.equal(mod.hashFailure("150.5ms x"), mod.hashFailure("9999.9ms x")));
    it("different errors differ", () => assert.notEqual(mod.hashFailure("TypeError"), mod.hashFailure("RefErr")));
    it("two distinct long failures don't collide", () => {
      const longA =
        "Error: Connection refused\n  at Socket._onTimeout (node:net:1234:56)\n  at /home/user/project/src/db.ts:42:10\n  at connect (/home/user/project/src/db.ts:100:20)\n  [cause: 0x7f8a9b0c] 150.2ms\n".repeat(
          100,
        );
      const longB =
        "Error: Timeout exceeded\n  at Client.request (node:http:789:12)\n  at /home/user/project/src/api.ts:30:5\n  at fetchData (/home/user/project/src/api.ts:80:15)\n  [cause: 0xdeadbeef] 9999.9ms\n".repeat(
          100,
        );
      assert.notEqual(mod.hashFailure(longA), mod.hashFailure(longB));
    });
    it("normalizes temp paths", () =>
      assert.equal(mod.hashFailure("/tmp/abc123/file.ts: err"), mod.hashFailure("/tmp/xyz789/file.ts: err")));
  });

  describe("computeFailureSignals", () => {
    it("all-false for single entry", () => {
      const s = mod.computeFailureSignals(["abc"]);
      assert.equal(s.stuck, false);
      assert.equal(s.oscillating, false);
      assert.equal(s.noProgress, false);
    });
    it("all-false for empty history", () => {
      const s = mod.computeFailureSignals([]);
      assert.equal(s.stuck, false);
      assert.equal(s.oscillating, false);
      assert.equal(s.noProgress, false);
    });
    it("all-false for two different entries", () => {
      const s = mod.computeFailureSignals(["a", "b"]);
      assert.equal(s.stuck, false);
      assert.equal(s.oscillating, false);
      assert.equal(s.noProgress, false);
    });
    it("K-repeat flagged stuck", () => {
      // K=3 same consecutive hashes → stuck
      const s = mod.computeFailureSignals(["a", "a", "a"]);
      assert.equal(s.stuck, true);
    });
    it("K=3 not enough entries does not flag stuck", () => {
      // Only 2 entries, K=3 → not stuck
      const s = mod.computeFailureSignals(["a", "a"]);
      assert.equal(s.stuck, false);
    });
    it("A→B→A sequence flagged oscillating", () => {
      const s = mod.computeFailureSignals(["a", "b", "a"]);
      assert.equal(s.oscillating, true);
    });
    it("A→B→C not oscillating", () => {
      const s = mod.computeFailureSignals(["a", "b", "c"]);
      assert.equal(s.oscillating, false);
    });
    it("noProgress when all recent unique", () => {
      // K=3, last 3 all unique → noProgress
      const s = mod.computeFailureSignals(["a", "b", "c", "d"]);
      assert.equal(s.noProgress, true);
    });
    it("noProgress false when repeat exists", () => {
      const s = mod.computeFailureSignals(["a", "b", "a"]);
      assert.equal(s.noProgress, false);
    });
    it("larger K value works", () => {
      const s = mod.computeFailureSignals(["x", "y", "z", "w"], 4);
      assert.equal(s.stuck, false);
      assert.equal(s.noProgress, true);
    });
    it("stuck overrides oscillating", () => {
      // [a, a, a] — also satisfies A→B→A with a→a→a but stuck takes priority
      const s = mod.computeFailureSignals(["a", "a", "a"]);
      assert.equal(s.stuck, true);
      // oscillating is false because the last two entries must differ for oscillating
      assert.equal(s.oscillating, false);
    });
  });

  describe("extractScore", () => {
    it("last number", () => assert.equal(mod.extractScore("Score: 42.5"), 42.5));
    it("null for text", () => assert.equal(mod.extractScore("pass"), null));
    it("negative", () => assert.equal(mod.extractScore("-3"), -3));
    it("last from mixed", () => assert.equal(mod.extractScore("150, Score: 92"), 92));
    it("empty", () => assert.equal(mod.extractScore(""), null));
  });

  describe("toVerdict", () => {
    it("exit 0 passed", () => {
      const v = mod.toVerdict({ output: "ok", exitCode: 0, durationMs: 100 });
      assert.equal(v.passed, true);
      assert.equal(v.exit_code, 0);
    });
    it("exit 1 failed", () => assert.equal(mod.toVerdict({ output: "f", exitCode: 1, durationMs: 50 }).passed, false));
  });

  describe("strategyPrompts", () => {
    it("N prompts", () => assert.equal(mod.strategyPrompts("t", 3).length, 3));
    it("task included", () => {
      for (const p of mod.strategyPrompts("Add X", 2)) assert.ok(p.includes("Add X"));
    });
    it("context", () => assert.ok(mod.strategyPrompts("t", 1, "ctx")[0].includes("ctx")));
  });

  describe("repairPrompt", () => {
    it("task+failure+attempt", () => {
      const diags = [{ file: "test.ts", line: 1, severity: "error" as const, message: "type error", context: "" }];
      const p = mod.repairPrompt("Fix", diags, 2);
      assert.ok(p.includes("Fix"));
      assert.ok(p.includes("type error"));
      assert.ok(p.includes("error"));
      assert.ok(p.includes("attempt #2"));
    });
  });

  describe("mutationPrompt", () => {
    it("goal+code+fitness", () => {
      const p = mod.mutationPrompt("Opt", "code", 42.5, []);
      assert.ok(p.includes("Opt"));
      assert.ok(p.includes("42.50"));
    });
    it("elites", () => assert.ok(mod.mutationPrompt("G", "c", 50, [{ code: "fast", score: 95 }]).includes("Elite #1")));
    it("no elites", () => assert.ok(!mod.mutationPrompt("G", "c", 50, []).includes("Elite")));
  });

  describe("resolveApiKey", () => {
    it("explicit key", () => {
      assert.equal(mod.resolveApiKey("explicit"), "explicit");
      assert.equal(mod.apiKeySource("explicit"), "option");
    });
    it("env key", () => {
      const p = process.env.DEEPSEEK_API_KEY;
      process.env.DEEPSEEK_API_KEY = "ek";
      assert.equal(mod.resolveApiKey(), "ek");
      assert.equal(mod.apiKeySource(), "env");
      process.env.DEEPSEEK_API_KEY = p;
    });
  });

  describe("checkProxyHealth", () => {
    it("healthy", async () => {
      process.env.DEEPSEEK_API_KEY = "sk";
      globalThis.fetch = mock.fn(async () => ({ ok: true, json: async () => ({ mode: "ds" }) })) as any;
      assert.equal(await mod.checkProxyHealth(), true);
    });
    it("not ok", async () => {
      globalThis.fetch = mock.fn(async () => ({ ok: false, json: async () => ({}) })) as any;
      assert.equal(await mod.checkProxyHealth(), false);
    });
    it("fetch throws", async () => {
      globalThis.fetch = mock.fn(async () => {
        throw new Error("ECONNREFUSED");
      }) as any;
      assert.equal(await mod.checkProxyHealth(), false);
    });
    it("no mode", async () => {
      globalThis.fetch = mock.fn(async () => ({ ok: true, json: async () => ({}) })) as any;
      assert.equal(await mod.checkProxyHealth(), false);
    });
  });

  describe("runCommand", () => {
    it("success", () => {
      execSyncOutput = "hello";
      const r = mod.runCommand("echo", process.cwd());
      assert.equal(r.output, "hello");
      assert.equal(r.exitCode, 0);
    });
    it("truncates >10K", () => {
      execSyncOutput = "x".repeat(15000);
      assert.ok(mod.runCommand("cat", process.cwd()).output.length <= 10000);
    });
    it("error", () => {
      execSyncThrows = true;
      execSyncError = { status: 2, stdout: "partial", stderr: "err" };
      const r = mod.runCommand("bad", process.cwd());
      assert.equal(r.exitCode, 2);
      execSyncThrows = false;
    });
  });

  describe("spawnClaude", () => {
    it("success", async () => {
      spawnThrows = false;
      process.env.DEEPSEEK_API_KEY = "sk";
      const r = await mod.spawnClaude("p", { cwd: process.cwd() });
      assert.equal(r.exitCode, 0);
    });
    it("error", async () => {
      spawnThrows = true;
      process.env.DEEPSEEK_API_KEY = "sk";
      const r = await mod.spawnClaude("p", { cwd: process.cwd() });
      assert.equal(r.exitCode, -1);
    });
    it("system prompt", async () => {
      spawnThrows = false;
      process.env.DEEPSEEK_API_KEY = "sk";
      const r = await mod.spawnClaude("p", { cwd: process.cwd(), systemPrompt: "Help" });
      assert.equal(r.exitCode, 0);
    });
    it("custom model", async () => {
      process.env.DEEPSEEK_API_KEY = "sk";
      const r = await mod.spawnClaude("p", { cwd: process.cwd(), model: "h" });
      assert.equal(r.exitCode, 0);
    });
    it("oversized prompt >32K chars", async () => {
      spawnThrows = false;
      spawnCallArgs.length = 0;
      process.env.DEEPSEEK_API_KEY = "sk";
      const bigPrompt = "x".repeat(40000);
      const r = await mod.spawnClaude(bigPrompt, { cwd: process.cwd() });
      assert.equal(r.exitCode, 0);
      // Verify spawn args no longer contain the prompt text
      assert.equal(spawnCallArgs.length, 1, "spawn was called once");
      const args = spawnCallArgs[0][1];
      assert.ok(Array.isArray(args));
      assert.equal(args[0], "-p");
      assert.equal(args.includes(bigPrompt), false, "prompt should not be in argv");
    });
    it("throws when no API key found", async () => {
      const saved = process.env.DEEPSEEK_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      fsExistsSyncReturn = false;
      const m = await importFresh();
      await assert.rejects(m.spawnClaude("prompt", { cwd: process.cwd() }), /No API key found/);
      process.env.DEEPSEEK_API_KEY = saved;
    });
  });

  describe("ensureProxy", () => {
    it("healthy", async () => {
      process.env.DEEPSEEK_API_KEY = "sk";
      globalThis.fetch = mock.fn(async () => ({ ok: true, json: async () => ({ mode: "ds" }) })) as any;
      assert.equal(await mod.ensureProxy(), true);
    });
    it("no dir", async () => {
      process.env.DEEPSEEK_API_KEY = "sk";
      globalThis.fetch = mock.fn(async () => ({ ok: false, json: async () => ({}) })) as any;
      fsExistsSyncReturn = false;
      assert.equal(await mod.ensureProxy(), false);
    });
  });
});
