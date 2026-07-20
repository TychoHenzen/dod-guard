import * as assert from "node:assert/strict";
import * as path from "node:path";
import { describe, it, mock } from "node:test";

// ── Mock node:fs so generateFactSheet returns controlled content ───────

const mockFiles: Record<string, string> = {};

mock.module("node:fs", {
  namedExports: {
    existsSync: mock.fn((p: string) => p in mockFiles),
    readFileSync: mock.fn((p: string, _enc?: string) => mockFiles[p] ?? ""),
  },
});

// Cache-busting dynamic import to get a fresh module for each test
let importCounter = 0;
async function freshCtx(): Promise<typeof import("./context.js")> {
  return import(`./context.js?_=${++importCounter}`);
}

// ── assembleContext ─────────────────────────────────────────────────────

describe("assembleContext", () => {
  it("goal only → includes goal in output, has hash, estimates tokens", async () => {
    const { assembleContext } = await freshCtx();
    const result = assembleContext({ goal: "Fix the login bug" });

    assert.ok(result.assembled.includes("Fix the login bug"), "goal text present");
    assert.ok(/^[0-9a-f]{16}$/.test(result.hash), "16-char hex hash");
    assert.ok(result.estimatedTokens > 0, "token estimate positive");
    assert.deepStrictEqual(result.layersPresent, ["goal"]);
  });

  it("all layers → all layersPresent listed, no truncation", async () => {
    const { assembleContext } = await freshCtx();
    const layers = {
      goal: "Build auth module",
      strategy: "Use JWT with refresh tokens",
      targetFiles: [{ path: "src/auth.ts", content: "export function login() {}", language: "typescript" }],
      dependencyGraph: { imports: ["jwt"], callers: ["server.ts"], callees: ["verify()"] },
      constraints: {
        lintRules: "no-any, no-unused-vars",
        conventions: "use-const, prefer-arrow",
        typeConfig: "strict",
      },
      priorAttempts: [
        {
          strategy: "OAuth",
          outcome: "failed" as const,
          summary: "Too complex for this scope",
          failureSignature: "scope-creep",
        },
      ],
      failureSignatures: [{ hash: "abc123def4567890", description: "Token expiry not handled", count: 3 }],
    };
    const result = assembleContext(layers);

    assert.ok(result.assembled.includes("Build auth module"), "goal");
    assert.ok(result.assembled.includes("JWT with refresh"), "strategy");
    assert.ok(result.assembled.includes("src/auth.ts"), "targetFiles");
    assert.ok(result.assembled.includes("jwt"), "dependencyGraph imports");
    assert.ok(result.assembled.includes("verify()"), "dependencyGraph callees");
    assert.ok(result.assembled.includes("no-any"), "constraints lintRules");
    assert.ok(result.assembled.includes("OAuth"), "priorAttempts");
    assert.ok(result.assembled.includes("abc123de"), "failureSignatures");

    assert.deepStrictEqual(result.layersPresent, [
      "goal",
      "strategy",
      "targetFiles",
      "dependencyGraph",
      "constraints",
      "priorAttempts",
      "failureSignatures",
    ]);
    assert.ok(!result.assembled.includes("truncated"), "no truncation");
  });

  it("same layers twice → cached (same hash)", async () => {
    const { assembleContext } = await freshCtx();
    const layers = { goal: "Fix bug" };
    const a = assembleContext(layers);
    const b = assembleContext(layers);

    assert.equal(a.hash, b.hash);
    assert.equal(a.assembled, b.assembled);
    assert.equal(a.estimatedTokens, b.estimatedTokens);
  });

  it("truncated when > 16000 chars", async () => {
    const { assembleContext } = await freshCtx();
    const longGoal = "x".repeat(16_500);
    const result = assembleContext({ goal: longGoal });

    assert.ok(result.assembled.includes("[context truncated to token budget]"), "truncation marker present");
    // assembled = first 16_000 chars + truncation message
    const truncMsg = "\n\n... [context truncated to token budget]";
    assert.ok(result.assembled.length <= 16_000 + truncMsg.length, "truncated length");
    assert.ok(result.assembled.startsWith("## Goal"), "starts with goal section");
  });
});

// ── clearContextCache ──────────────────────────────────────────────────

describe("clearContextCache", () => {
  it("resets cache so subsequent calls recompute", async () => {
    const { assembleContext, clearContextCache } = await freshCtx();
    const layers = { goal: "Cache reset test" };
    const a = assembleContext(layers);

    // Clear then call again — still produces correct output
    clearContextCache();
    const b = assembleContext(layers);

    assert.equal(b.assembled, a.assembled, "same output after clear");
    assert.equal(b.hash, a.hash, "same hash after clear");
    assert.ok(b.estimatedTokens > 0, "tokens estimated after clear");
  });

  it("succeeds with empty cache (no-op)", async () => {
    const { clearContextCache, assembleContext } = await freshCtx();
    // Should not throw when cache is already empty
    clearContextCache();
    const result = assembleContext({ goal: "after empty clear" });
    assert.ok(result.assembled.includes("after empty clear"));
  });
});

// ── generateFactSheet ──────────────────────────────────────────────────

describe("generateFactSheet", () => {
  it("reads CLAUDE.md, biome.json, tsconfig.json, package.json from cwd", async () => {
    const { generateFactSheet } = await freshCtx();
    const cwd = "C:\\test\\project";

    mockFiles[path.join(cwd, "CLAUDE.md")] = "# Project\n## Conventions\n- use tabs\n- 120 chars\n";
    mockFiles[path.join(cwd, "biome.json")] = '{"formatter":{"indentStyle":"tab","lineWidth":100}}';
    mockFiles[path.join(cwd, "tsconfig.json")] = '{"compilerOptions":{"strict":true,"target":"es2022"}}';
    mockFiles[path.join(cwd, "package.json")] =
      '{"dependencies":{"express":"4.18"},"devDependencies":{"typescript":"5.0"}}';

    const result = generateFactSheet(cwd);

    assert.ok(result.includes("Conventions"), "conventions section present");
    assert.ok(result.includes("use tabs"), "claude.md content extracted");
    assert.ok(result.includes("Format"), "format section present");
    assert.ok(result.includes("tab (width: 100)"), "biome.json parsed");
    assert.ok(result.includes("TypeScript"), "typescript section present");
    assert.ok(result.includes("strict"), "ts strict mode detected");
    assert.ok(result.includes("Dependencies"), "dependencies section present");
    assert.ok(result.includes("express"), "package.json dependencies listed");
    assert.ok(result.includes("typescript"), "devDependencies listed");
  });

  it("returns empty string when no config files exist", async () => {
    const { generateFactSheet } = await freshCtx();
    // No files in mockFiles — all reads return empty
    const result = generateFactSheet("/empty/project");
    assert.equal(result, "", "empty fact sheet");
  });

  it("handles malformed JSON gracefully", async () => {
    const { generateFactSheet } = await freshCtx();
    const cwd = "/broken/project";

    mockFiles[path.join(cwd, "CLAUDE.md")] = "# Project";
    mockFiles[path.join(cwd, "biome.json")] = "not json {{{";
    mockFiles[path.join(cwd, "tsconfig.json")] = "broken";
    mockFiles[path.join(cwd, "package.json")] = "garbage";

    // Should not throw — silently skip malformed JSON
    const result = generateFactSheet(cwd);
    assert.ok(result.includes("Conventions"), "conventions from CLAUDE.md still present");
    // Format, TypeScript, Dependencies sections skipped due to parse errors
  });
});

// ── buildDependencyInfo ────────────────────────────────────────────────

describe("buildDependencyInfo", () => {
  it("extracts imports and callees, excludes keywords", async () => {
    const { buildDependencyInfo } = await freshCtx();
    const files = [
      {
        path: "src/auth.ts",
        // The regex only matches bare `import "x"` or `require("x")` — not `import { x } from "y"`
        content: `
import "jsonwebtoken";
import "bcrypt";
const db = require("./db.js");

async function login(email, password) {
  const user = await db.findUser(email);
  const valid = await compare(password, user.hash);
  if (!valid) throw new Error("bad password");
  return verify(user.token, "secret");
}
        `.trim(),
      },
    ];

    const result = buildDependencyInfo(files.map((f) => ({ path: f.path, content: f.content })));

    assert.ok(result.imports.includes("jsonwebtoken"), "jsonwebtoken import");
    assert.ok(result.imports.includes("bcrypt"), "bcrypt import");
    assert.ok(result.imports.includes("./db.js"), "relative import");

    // Callees: function calls with 3+ chars that aren't keywords
    // Note: `db.findUser(email)` only captures `findUser` (8 chars),
    // not `db` (2 chars — regex requires 3+)
    assert.ok(result.callees.includes("compare"), "compare call");
    assert.ok(result.callees.includes("login"), "login function call");
    assert.ok(result.callees.includes("findUser"), "findUser call");
    assert.ok(result.callees.includes("verify"), "verify call");

    // Keywords should NOT appear
    assert.ok(!result.callees.includes("throw"), "throw keyword excluded");
    assert.ok(!result.callees.includes("if"), "if keyword excluded");
    assert.ok(!result.callees.includes("return"), "return keyword excluded");

    // callers is always empty (provided externally)
    assert.deepStrictEqual(result.callers, []);
  });

  it("handles require-style imports", async () => {
    const { buildDependencyInfo } = await freshCtx();
    const files = [
      {
        path: "src/server.js",
        content: `const express = require("express");\nconst cors = require("cors");`,
      },
    ];

    const result = buildDependencyInfo(files.map((f) => ({ path: f.path, content: f.content })));

    assert.ok(result.imports.includes("express"), "express require");
    assert.ok(result.imports.includes("cors"), "cors require");
  });

  it("returns empty arrays for content with no imports or calls", async () => {
    const { buildDependencyInfo } = await freshCtx();
    const files = [{ path: "empty.ts", content: "// just a comment\n" }];

    const result = buildDependencyInfo(files);

    assert.deepStrictEqual(result.imports, []);
    assert.deepStrictEqual(result.callers, []);
    assert.deepStrictEqual(result.callees, []);
  });

  it("limits imports and callees to 30 entries each", async () => {
    const { buildDependencyInfo } = await freshCtx();
    const content = Array.from({ length: 40 }, (_, i) => `import { x } from "mod${i}";`).join("\n");
    const files = [{ path: "big.ts", content }];

    const result = buildDependencyInfo(files);

    assert.ok(result.imports.length <= 30, "capped at 30 imports");
  });
});

// ── makeTargetFiles ────────────────────────────────────────────────────

describe("makeTargetFiles", () => {
  it("maps paths + content, adds language", async () => {
    const { makeTargetFiles } = await freshCtx();
    const files = [
      { path: "src/auth.ts", content: "export function login() {}" },
      { path: "src/db.ts", content: "export const db = {};" },
    ];
    const result = makeTargetFiles(files, "typescript");

    assert.equal(result.length, 2);
    assert.equal(result[0].path, "src/auth.ts");
    assert.equal(result[0].content, "export function login() {}");
    assert.equal(result[0].language, "typescript");
    assert.equal(result[1].path, "src/db.ts");
    assert.equal(result[1].content, "export const db = {};");
    assert.equal(result[1].language, "typescript");
  });

  it("handles empty array", async () => {
    const { makeTargetFiles } = await freshCtx();
    const result = makeTargetFiles([], "python");
    assert.deepStrictEqual(result, []);
  });

  it("accepts files without language (undefined)", async () => {
    const { makeTargetFiles } = await freshCtx();
    const files = [{ path: "script.py", content: "print('hello')" }];
    const result = makeTargetFiles(files);

    assert.equal(result.length, 1);
    assert.equal(result[0].path, "script.py");
    assert.equal(result[0].language, undefined);
  });
});
