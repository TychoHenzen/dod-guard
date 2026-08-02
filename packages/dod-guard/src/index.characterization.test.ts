// quality-guard: off
// Characterization tests for index.ts's MCP boundary.
//
// These drive the COMPILED server (dist/index.js) over real MCP stdio
// JSON-RPC, the same way a real client does. Run `npm run build` first.
// The package's `npm test` script always builds before running
// dist/*.test.js, so this file only needs to sit next to the other
// src/*.test.ts files.
//
// Transport plumbing is modeled on scripts/ci/smoke-bundle.mjs.
//
// Every test gets its own DOD_STORE_DIR under os.tmpdir(). Every test
// also gets its own server child process. No test can see another
// test's documents. Nothing here touches the real ~/.claude/dod-store.

import assert from "node:assert/strict";
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Proof commands run on the host OS, so a `exit /b 0` written for cmd.exe
// exits 2 under /bin/sh. `node` is on PATH on both, and dod_create rejects a
// command whose first name it cannot find, which rules out shell builtins.
const PASS_CMD = 'node -e "process.exit(0)"';
const FAIL_CMD = 'node -e "process.exit(1)"';

const DIST_INDEX = fileURLToPath(new URL("./index.js", import.meta.url));
const PROTOCOL_VERSION = "2025-06-18";
const TIMEOUT_MS = 15_000;
// Built from a code point, not typed literally. This file stays plain
// ASCII. A raw em dash byte gets mangled by this machine's re-encoding.
const DASH = String.fromCharCode(0x2014);
const ARROW = String.fromCharCode(0x2192);

let nextId = 1;

interface JsonRpcResponse {
  id?: number;
  result?: any;
  error?: { code: number; message: string };
}

interface Harness {
  storeDir: string;
  init: () => Promise<void>;
  request: (method: string, params: Record<string, unknown>) => Promise<JsonRpcResponse>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<any>;
  text: (result: any) => string;
  stop: () => void;
}

function startServer(): Harness {
  const storeDir = mkdtempSync(join(tmpdir(), "dod-guard-char-"));
  const env = { ...process.env, DOD_STORE_DIR: storeDir };
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [DIST_INDEX], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const waiters = new Map<number, (msg: JsonRpcResponse) => void>();
  let buffer = "";
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined) {
        const waiter = waiters.get(msg.id);
        if (waiter) {
          waiters.delete(msg.id);
          waiter(msg);
        }
      }
    }
  });

  function send(message: Record<string, unknown>): void {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = nextId++;
    const promise = new Promise<JsonRpcResponse>((resolvePromise, rejectPromise) => {
      waiters.set(id, resolvePromise);
      const timer = setTimeout(() => {
        waiters.delete(id);
        const label = `timeout waiting for ${method} (id ${id})`;
        const tail = stderr.trim() || "(empty)";
        rejectPromise(new Error(`${label}\nstderr: ${tail}`));
      }, TIMEOUT_MS);
      timer.unref();
    });
    send({ jsonrpc: "2.0", id, method, params });
    return promise;
  }

  function notify(method: string): void {
    send({ jsonrpc: "2.0", method });
  }

  async function init(): Promise<void> {
    const res = await request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "characterization", version: "1.0.0" },
    });
    if (res.error) throw new Error(`initialize failed: ${JSON.stringify(res.error)}`);
    notify("notifications/initialized");
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<any> {
    const res = await request("tools/call", { name, arguments: args });
    if (res.error) {
      throw new Error(`tools/call ${name} failed: ${JSON.stringify(res.error)}`);
    }
    return res.result;
  }

  function text(result: any): string {
    return (result.content ?? []).map((c: { text: string }) => c.text).join("\n");
  }

  function stop(): void {
    child.kill();
    rmSync(storeDir, { recursive: true, force: true });
  }

  return { storeDir, init, request, callTool, text, stop };
}

// ── Fixture builders ─────────────────────────────────────────────────

function baseSections() {
  return { requirements: "Sample requirements text." };
}

function passingLeaf(title = "leaf") {
  return {
    title,
    refinement: "concrete" as const,
    command: PASS_CMD,
    predicate: { type: "exit_code", value: 0 },
    description: `${title} description`,
    category: "behavioral" as const,
  };
}

function failingLeaf(title = "leaf") {
  return {
    title,
    refinement: "concrete" as const,
    command: FAIL_CMD,
    predicate: { type: "exit_code", value: 0 },
    description: `${title} description`,
    category: "behavioral" as const,
  };
}

function draftLeaf(title = "draft") {
  return {
    title,
    refinement: "draft" as const,
    intent: `Prove ${title} works`,
  };
}

function writeImportFixture(mdPath: string, title: string): void {
  const md = [
    `# ${title}`,
    "",
    "## Definition of Done",
    "",
    "<definition_of_done>",
    "",
    `- [ ] Proof: \`${PASS_CMD}\` ${ARROW} Sample proof <!--p:{"type":"exit_code","value":0}-->`,
    "",
    "</definition_of_done>",
    "",
  ].join("\n");
  writeFileSync(mdPath, md, "utf-8");
}

function legacyDocFixture(legacyId: string, storeDir: string) {
  return {
    id: legacyId,
    title: "Legacy Doc",
    goal: "old goal",
    date: "2020-01-01",
    cwd: storeDir,
    markdown_path: join(storeDir, "legacy.md"),
    created_at: "2020-01-01T00:00:00.000Z",
    execution_confirmed: true,
    sections: baseSections(),
    amendments: [],
    steps: [legacyStepFixture()],
  };
}

function legacyStepFixture() {
  return {
    id: "step-1",
    title: "Step One",
    proofs: [legacyProofFixture()],
  };
}

function legacyProofFixture() {
  return {
    id: "proof-1",
    title: "proof-1",
    command: PASS_CMD,
    predicate: { type: "exit_code", value: 0 },
    description: "legacy proof",
  };
}

function extractId(responseText: string): string {
  const m = responseText.match(/ID:\s*(\S+)/);
  if (!m) throw new Error(`no ID found in response text: ${responseText}`);
  return m[1];
}

async function amendThreeTimes(s: Harness, id: string, command: string): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await s.callTool("dod_amend", {
      dod_id: id,
      node_path: "0",
      new_command: command,
      reason: `edit ${i}`,
    });
  }
}

async function createDod(
  s: Harness,
  workDir: string,
  overrides: Record<string, unknown> = {},
): Promise<{ text: string; id: string }> {
  const args = {
    title: "Sample DoD",
    goal: "Ship the sample feature",
    type: "general",
    cwd: workDir,
    markdown_path: join(workDir, "dod.md"),
    sections: baseSections(),
    roots: [passingLeaf("proof-a")],
    ...overrides,
  };
  const result = await s.callTool("dod_create", args);
  const responseText = s.text(result);
  return { text: responseText, id: extractId(responseText) };
}

// ── tools/list ──────────────────────────────────────────────────────

test("tools/list returns exactly the 12 documented tools", async () => {
  const s = startServer();
  try {
    await s.init();
    const listed = await s.request("tools/list", {});
    const tools = (listed.result?.tools ?? []).map((t: any) => t.name);
    const expected = [
      "dod_create",
      "dod_check",
      "dod_refine",
      "dod_add_node",
      "dod_remove_node",
      "dod_status",
      "dod_tree",
      "dod_amend",
      "dod_list",
      "dod_import",
      "dod_store_migrate",
      "dod_adversarial_gate",
    ];
    assert.equal(tools.length, 12);
    for (const name of expected) {
      assert.ok(tools.includes(name), `missing tool ${name}`);
    }
  } finally {
    s.stop();
  }
});

// ── dod_create ──────────────────────────────────────────────────────

test("dod_create success reports id, roots, and proof counts", async () => {
  const s = startServer();
  try {
    await s.init();
    const { text } = await createDod(s, s.storeDir, {
      roots: [passingLeaf("a"), draftLeaf("b")],
    });
    assert.match(text, /DoD created\./);
    assert.match(text, /Roots: 2/);
    assert.match(text, /Concrete proofs: 1/);
    assert.match(text, /Draft nodes: 1/);
  } finally {
    s.stop();
  }
});

test("dod_create rejects a caller-supplied dod_id", async () => {
  const s = startServer();
  try {
    await s.init();
    const args = {
      title: "X",
      goal: "Y",
      type: "general",
      cwd: s.storeDir,
      markdown_path: join(s.storeDir, "x.md"),
      sections: baseSections(),
      roots: [passingLeaf()],
      dod_id: "some-existing-id",
    };
    const result = await s.callTool("dod_create", args);
    const text = s.text(result);
    assert.match(text, /^ERROR: dod_create creates NEW DoDs\./);
    assert.match(text, /dod_id parameter is not accepted here/);
  } finally {
    s.stop();
  }
});

test("dod_create warns when a non-minimal DoD has no behavioral proof", async () => {
  const s = startServer();
  try {
    await s.init();
    const wiringLeaf = { ...passingLeaf("w"), category: "wiring" as const };
    const { text } = await createDod(s, s.storeDir, { roots: [wiringLeaf] });
    assert.match(text, /No behavioral predicate proofs/);
  } finally {
    s.stop();
  }
});

test("dod_create rejects a command whose tool is missing on this OS", async () => {
  const s = startServer();
  try {
    await s.init();
    const badLeaf = {
      title: "bad",
      refinement: "concrete" as const,
      command: "totally-fake-tool-xyz-123",
      predicate: { type: "exit_code", value: 0 },
      description: "bad description",
    };
    const badArgs = {
      title: "X",
      goal: "Y",
      type: "general",
      cwd: s.storeDir,
      markdown_path: join(s.storeDir, "x.md"),
      sections: baseSections(),
      roots: [badLeaf],
    };
    const created = s.text(await s.callTool("dod_create", badArgs));
    assert.match(created, /ERROR: 1 proof command\(s\) invoke tool\(s\) not available/);
    assert.match(created, /totally-fake-tool-xyz-123/);
  } finally {
    s.stop();
  }
});

// ── dod_check ───────────────────────────────────────────────────────

test("dod_check reports not found for an unknown dod_id", async () => {
  const s = startServer();
  try {
    await s.init();
    const result = await s.callTool("dod_check", { dod_id: "no-such-id" });
    const text = s.text(result);
    assert.match(text, /^ERROR:/);
    assert.match(text, /not found/i);
  } finally {
    s.stop();
  }
});

test("dod_check on a passing concrete leaf returns PASS", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    const result = await s.callTool("dod_check", { dod_id: id });
    const text = s.text(result);
    assert.match(text, /## DoD Check Result: PASS/);
  } finally {
    s.stop();
  }
});

test("dod_check on a passing run reports the proof fingerprint", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    const result = await s.callTool("dod_check", { dod_id: id });
    const text = s.text(result);
    assert.match(text, /\*\*Proof fingerprint:\*\*/);
  } finally {
    s.stop();
  }
});

test("dod_check on a failing concrete leaf returns FAIL", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [failingLeaf("f")] });
    const result = await s.callTool("dod_check", { dod_id: id });
    const text = s.text(result);
    assert.match(text, /## DoD Check Result: FAIL/);
  } finally {
    s.stop();
  }
});

test("dod_check stays INCOMPLETE while a draft node remains", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, {
      roots: [passingLeaf("p"), draftLeaf("d")],
    });
    const result = await s.callTool("dod_check", { dod_id: id });
    const text = s.text(result);
    assert.match(text, /## DoD Check Result: INCOMPLETE/);
  } finally {
    s.stop();
  }
});

test("dod_check with an unknown nodePath is rejected", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir);
    const result = await s.callTool("dod_check", { dod_id: id, nodePath: "9.children.9" });
    const text = s.text(result);
    assert.match(text, /ERROR: nodePath "9\.children\.9" not found in this DoD\./);
  } finally {
    s.stop();
  }
});

test("a scoped dod_check never returns PASS even for a passing subtree", async () => {
  const s = startServer();
  try {
    await s.init();
    const group = {
      title: "Group A",
      refinement: "concrete" as const,
      children: [passingLeaf("only")],
    };
    const { id } = await createDod(s, s.storeDir, { roots: [group] });
    const full = s.text(await s.callTool("dod_check", { dod_id: id }));
    assert.match(full, /## DoD Check Result: PASS/);

    const scoped = s.text(await s.callTool("dod_check", { dod_id: id, nodePath: "0" }));
    assert.match(scoped, /## DoD Check Result: INCOMPLETE/);
    assert.match(scoped, /Scoped run/);
  } finally {
    s.stop();
  }
});

test("dod_check on an imported DoD blocks until confirm_import", async () => {
  const s = startServer();
  try {
    await s.init();
    const mdPath = join(s.storeDir, "imported.md");
    writeImportFixture(mdPath, "Import Test");

    const imported = s.text(await s.callTool("dod_import", { path: mdPath, cwd: s.storeDir }));
    const id = extractId(imported);

    const blocked = s.text(await s.callTool("dod_check", { dod_id: id }));
    assert.match(blocked, /## Import Gate: Execution Not Confirmed/);
    assert.match(blocked, /1 executable proof\(s\) would be run/);

    const confirmed = s.text(await s.callTool("dod_check", { dod_id: id, confirm_import: true }));
    assert.match(confirmed, /## DoD Check Result: PASS/);
  } finally {
    s.stop();
  }
});

test("dod_check forces FAIL when the store was edited outside dod_amend", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    const first = s.text(await s.callTool("dod_check", { dod_id: id }));
    assert.match(first, /## DoD Check Result: PASS/);

    const storeFile = join(s.storeDir, `${id}.json`);
    const raw = JSON.parse(readFileSync(storeFile, "utf-8"));
    raw.roots[0].command = "exit /b 0 && echo tampered";
    writeFileSync(storeFile, JSON.stringify(raw, null, 2), "utf-8");

    const second = s.text(await s.callTool("dod_check", { dod_id: id }));
    assert.match(second, /## DoD Check Result: FAIL/);
    assert.match(second, /TAMPER DETECTED/);
  } finally {
    s.stop();
  }
});

test("dod_check reports STUCK after 3 amendments on a still-failing leaf", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [failingLeaf("f")] });

    for (let i = 0; i < 3; i++) {
      const amend = s.text(
        await s.callTool("dod_amend", {
          dod_id: id,
          node_path: "0",
          new_command: FAIL_CMD,
          reason: `tuning attempt ${i}`,
        }),
      );
      assert.match(amend, /Proof amended and logged\./);
    }

    const result = s.text(await s.callTool("dod_check", { dod_id: id }));
    assert.match(result, /## DoD Check Result: STUCK/);
    assert.match(result, new RegExp(`STUCK ${DASH} approach may be wrong`));
  } finally {
    s.stop();
  }
});

// ── dod_refine ──────────────────────────────────────────────────────

test("dod_refine concretize turns a draft leaf concrete", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [draftLeaf("d")] });
    const result = s.text(
      await s.callTool("dod_refine", {
        dod_id: id,
        node_path: "0",
        mode: "concretize",
        command: PASS_CMD,
        predicate: { type: "exit_code", value: 0 },
        description: "now concrete",
      }),
    );
    assert.match(result, /Node refined: "d" is now concrete\./);
    assert.match(result, /All nodes are now concrete/);
  } finally {
    s.stop();
  }
});

test("dod_refine subdivide turns a draft leaf into a group of drafts", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [draftLeaf("d")] });
    const result = s.text(
      await s.callTool("dod_refine", {
        dod_id: id,
        node_path: "0",
        mode: "subdivide",
        children: [
          { title: "sub-a", intent: "prove a" },
          { title: "sub-b", intent: "prove b" },
        ],
      }),
    );
    assert.match(result, /is now a task group with 2 child draft\(s\)/);
  } finally {
    s.stop();
  }
});

test("dod_refine refuses a node that is already concrete", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    const result = s.text(
      await s.callTool("dod_refine", {
        dod_id: id,
        node_path: "0",
        mode: "concretize",
        command: PASS_CMD,
        predicate: { type: "exit_code", value: 0 },
      }),
    );
    assert.match(result, /is already concrete\. Use dod_amend to modify\./);
  } finally {
    s.stop();
  }
});

// ── dod_add_node ────────────────────────────────────────────────────

test("dod_add_node adds a draft node at root level", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir);
    const result = s.text(
      await s.callTool("dod_add_node", {
        dod_id: id,
        parent_path: "",
        title: "new-draft",
        refinement: "draft",
        intent: "prove the new thing",
      }),
    );
    assert.match(result, /Node "new-draft" \(draft\) added at path "1"\./);
  } finally {
    s.stop();
  }
});

test("dod_add_node refuses a draft node with no intent", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir);
    const result = s.text(
      await s.callTool("dod_add_node", {
        dod_id: id,
        parent_path: "",
        title: "new-draft",
        refinement: "draft",
      }),
    );
    assert.match(result, /ERROR: draft nodes require an intent/);
  } finally {
    s.stop();
  }
});

test("dod_add_node refuses a concrete node whose parent is a leaf", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    const result = s.text(
      await s.callTool("dod_add_node", {
        dod_id: id,
        parent_path: "0",
        title: "child",
        refinement: "draft",
        intent: "prove child",
      }),
    );
    assert.match(result, new RegExp(`is a leaf ${DASH} cannot add children\\.`));
  } finally {
    s.stop();
  }
});

// ── dod_remove_node ─────────────────────────────────────────────────

test("dod_remove_node removes a root node and its descendants", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, {
      roots: [passingLeaf("p"), draftLeaf("d")],
    });
    const result = s.text(await s.callTool("dod_remove_node", { dod_id: id, node_path: "1" }));
    assert.match(result, /Removed root node "d" \(draft\) and all descendants\./);
  } finally {
    s.stop();
  }
});

test("dod_remove_node rejects an out-of-range root index", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    const result = s.text(await s.callTool("dod_remove_node", { dod_id: id, node_path: "5" }));
    assert.match(result, /ERROR: root index 5 out of range \(0-0\)\./);
  } finally {
    s.stop();
  }
});

test("dod_remove_node on an unknown dod_id reports not found", async () => {
  const s = startServer();
  try {
    await s.init();
    const result = s.text(await s.callTool("dod_remove_node", { dod_id: "no-such-id", node_path: "0" }));
    assert.match(result, /^ERROR:/);
    assert.match(result, /not found/i);
  } finally {
    s.stop();
  }
});

// ── dod_status ──────────────────────────────────────────────────────

test("dod_status before any check tells the caller to run dod_check", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir);
    const result = s.text(await s.callTool("dod_status", { dod_id: id }));
    assert.match(result, /has never been checked\. Run dod_check first\./);
  } finally {
    s.stop();
  }
});

test("dod_status after a passing check reports overall PASS", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    await s.callTool("dod_check", { dod_id: id });
    const result = s.text(await s.callTool("dod_status", { dod_id: id }));
    assert.match(result, /Overall: PASS/);
    assert.match(result, /Concrete proofs: 1\/1 pass/);
  } finally {
    s.stop();
  }
});

// ── dod_tree ────────────────────────────────────────────────────────

test("dod_tree on an unknown dod reports not found", async () => {
  const s = startServer();
  try {
    await s.init();
    const result = s.text(await s.callTool("dod_tree", {}));
    assert.match(result, /^ERROR:/);
    assert.match(result, /not found/i);
  } finally {
    s.stop();
  }
});

test("dod_tree lists node counts and per-node markers", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, {
      roots: [passingLeaf("p"), draftLeaf("d")],
    });
    const result = s.text(await s.callTool("dod_tree", { dod_id: id }));
    assert.match(result, /2 nodes: 1 concrete, 1 draft/);
    assert.match(result, /PROOF: "p"/);
    assert.match(result, /DRAFT: "d"/);
  } finally {
    s.stop();
  }
});

// ── dod_amend ───────────────────────────────────────────────────────

test("dod_amend on an unknown dod reports not found", async () => {
  const s = startServer();
  try {
    await s.init();
    const result = s.text(
      await s.callTool("dod_amend", {
        dod_id: "no-such-id",
        node_path: "0",
        reason: "why",
      }),
    );
    assert.match(result, /^ERROR:/);
    assert.match(result, /not found/i);
  } finally {
    s.stop();
  }
});

test("dod_amend refuses to touch a draft node", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [draftLeaf("d")] });
    const result = s.text(
      await s.callTool("dod_amend", {
        dod_id: id,
        node_path: "0",
        new_command: PASS_CMD,
        reason: "why",
      }),
    );
    assert.match(result, /ERROR: node is a draft\. Use dod_refine to concretize it first\./);
  } finally {
    s.stop();
  }
});

test("dod_amend refuses a new_command whose tool is missing on this OS", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    const result = s.text(
      await s.callTool("dod_amend", {
        dod_id: id,
        node_path: "0",
        new_command: "totally-fake-tool-xyz-123",
        reason: "why",
      }),
    );
    assert.match(result, /ERROR: 1 proof command\(s\) invoke tool\(s\) not available/);
    assert.match(result, /totally-fake-tool-xyz-123/);
  } finally {
    s.stop();
  }
});

test("dod_amend node_path=* refuses a new_command whose tool is missing on this OS", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    const result = s.text(
      await s.callTool("dod_amend", {
        dod_id: id,
        node_path: "*",
        new_command: "totally-fake-tool-xyz-123",
        reason: "bulk",
      }),
    );
    assert.match(result, /ERROR: 1 proof command\(s\) invoke tool\(s\) not available/);
    assert.match(result, /totally-fake-tool-xyz-123/);
  } finally {
    s.stop();
  }
});

test("dod_amend success resets the leaf to pending", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    const result = s.text(
      await s.callTool("dod_amend", {
        dod_id: id,
        node_path: "0",
        new_command: PASS_CMD,
        reason: "requirements changed",
      }),
    );
    assert.match(result, /Proof amended and logged\./);
    assert.match(result, /Status reset to pending\. Run dod_check to re-verify\./);
  } finally {
    s.stop();
  }
});

test("dod_amend blocks a 4th amendment without a justification", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    await amendThreeTimes(s, id, PASS_CMD);
    const fourth = s.text(
      await s.callTool("dod_amend", {
        dod_id: id,
        node_path: "0",
        new_command: PASS_CMD,
        reason: "edit 4",
      }),
    );
    assert.match(fourth, /has been amended 3 times\. Provide amend_justification/);
  } finally {
    s.stop();
  }
});

test("dod_amend allows the 4th amendment when justified", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    await amendThreeTimes(s, id, PASS_CMD);
    const fourth = s.text(
      await s.callTool("dod_amend", {
        dod_id: id,
        node_path: "0",
        new_command: PASS_CMD,
        reason: "edit 4",
        amend_justification: "requirements changed again, verified with user",
      }),
    );
    assert.match(fourth, /Proof amended and logged\./);
  } finally {
    s.stop();
  }
});

test("dod_amend node_path=* on an all-draft doc reports nothing to amend", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [draftLeaf("d")] });
    const result = s.text(
      await s.callTool("dod_amend", {
        dod_id: id,
        node_path: "*",
        new_command: PASS_CMD,
        reason: "bulk",
      }),
    );
    assert.match(result, /ERROR: no concrete leaves to amend\. Refine drafts first\./);
  } finally {
    s.stop();
  }
});

test("dod_amend node_id is rejected together with node_path=*", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, { roots: [passingLeaf("p")] });
    const result = s.text(
      await s.callTool("dod_amend", {
        dod_id: id,
        node_path: "*",
        node_id: "some-id",
        reason: "bulk",
      }),
    );
    assert.match(result, /node_id is incompatible with node_path="\*"/);
  } finally {
    s.stop();
  }
});

// ── dod_list ────────────────────────────────────────────────────────

test("dod_list reports no DoDs tracked on an empty store", async () => {
  const s = startServer();
  try {
    await s.init();
    const result = s.text(await s.callTool("dod_list", {}));
    assert.match(result, /^No DoD documents tracked\. Use dod_create or dod_import to add one\.$/);
  } finally {
    s.stop();
  }
});

test("dod_list shows an unchecked DoD's title, id, and counts", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir, {
      title: "Listed DoD",
      roots: [passingLeaf("p"), draftLeaf("d")],
    });
    const result = s.text(await s.callTool("dod_list", {}));
    assert.match(result, /Listed DoD/);
    assert.match(result, new RegExp(`ID: ${id}`));
    assert.match(result, /Status: UNCHECKED \| 2 roots, 1 concrete proofs \(1 draft\)/);
  } finally {
    s.stop();
  }
});

test("dod_list survives one legacy doc and still lists every other document", async () => {
  const s = startServer();
  try {
    await s.init();
    const legacyId = "legacy-doc-1";
    const legacyDoc = legacyDocFixture(legacyId, s.storeDir);
    const legacyPath = join(s.storeDir, `${legacyId}.json`);
    writeFileSync(legacyPath, JSON.stringify(legacyDoc, null, 2), "utf-8");

    const { id } = await createDod(s, s.storeDir, { title: "Current Doc" });

    const result = s.text(await s.callTool("dod_list", {}));
    assert.doesNotMatch(result, /^ERROR:/);
    assert.match(result, /Legacy Doc/);
    assert.match(result, /Status: LEGACY/);
    assert.match(result, /Current Doc/);
    assert.match(result, new RegExp(`ID: ${id}`));
  } finally {
    s.stop();
  }
});

// ── dod_import ──────────────────────────────────────────────────────

test("dod_import parses a markdown DoD into a new document", async () => {
  const s = startServer();
  try {
    await s.init();
    const mdPath = join(s.storeDir, "plain.md");
    writeImportFixture(mdPath, "Plain Import");

    const importArgs = { path: mdPath, cwd: s.storeDir };
    const result = s.text(await s.callTool("dod_import", importArgs));
    assert.match(result, /DoD imported\./);
    assert.match(result, /Concrete proofs: 1/);
    assert.match(result, /Draft nodes: 0/);
  } finally {
    s.stop();
  }
});

test("dod_import refuses a command whose tool is missing on this OS", async () => {
  const s = startServer();
  try {
    await s.init();
    const mdPath = join(s.storeDir, "bad-import.md");
    const md = [
      "# Bad Import",
      "",
      "## Definition of Done",
      "",
      "<definition_of_done>",
      "",
      "- [ ] Proof: `totally-fake-tool-xyz-123` → Sample proof " + '<!--p:{"type":"exit_code","value":0}-->',
      "",
      "</definition_of_done>",
      "",
    ].join("\n");
    writeFileSync(mdPath, md, "utf-8");

    const result = s.text(await s.callTool("dod_import", { path: mdPath, cwd: s.storeDir }));
    assert.match(result, /ERROR: 1 proof command\(s\) invoke tool\(s\) not available/);
    assert.match(result, /totally-fake-tool-xyz-123/);
  } finally {
    s.stop();
  }
});

test("dod_import on an already-tracked path reports it is already tracked", async () => {
  const s = startServer();
  try {
    await s.init();
    const mdPath = join(s.storeDir, "plain2.md");
    writeImportFixture(mdPath, "Plain Import 2");

    const importArgs = { path: mdPath, cwd: s.storeDir };
    await s.callTool("dod_import", importArgs);
    const second = s.text(await s.callTool("dod_import", importArgs));
    assert.match(second, /Already tracked as/);
  } finally {
    s.stop();
  }
});

// ── dod_store_migrate ───────────────────────────────────────────────

test("dod_store_migrate on an unknown dod_id reports not found", async () => {
  const s = startServer();
  try {
    await s.init();
    const result = s.text(await s.callTool("dod_store_migrate", { dod_id: "no-such-id" }));
    assert.match(result, /^ERROR:/);
    assert.match(result, /not found/i);
  } finally {
    s.stop();
  }
});

test("dod_store_migrate on a current-format doc says no migration needed", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir);
    const result = s.text(await s.callTool("dod_store_migrate", { dod_id: id }));
    const notNeeded = `already in the current format ${DASH} no migration needed\\.`;
    assert.match(result, new RegExp(notNeeded));
  } finally {
    s.stop();
  }
});

test("dod_store_migrate bulk run finds nothing when no legacy docs exist", async () => {
  const s = startServer();
  try {
    await s.init();
    await createDod(s, s.storeDir);
    const result = s.text(await s.callTool("dod_store_migrate", {}));
    const noLegacy = `No legacy documents found ${DASH} all docs are in the current format\\.`;
    assert.match(result, new RegExp(noLegacy));
  } finally {
    s.stop();
  }
});

test("dod_store_migrate converts a legacy steps-format store file", async () => {
  const s = startServer();
  try {
    await s.init();
    const legacyId = "legacy-doc-1";
    const legacyDoc = legacyDocFixture(legacyId, s.storeDir);
    const legacyPath = join(s.storeDir, `${legacyId}.json`);
    writeFileSync(legacyPath, JSON.stringify(legacyDoc, null, 2), "utf-8");

    const migrateArgs = { dod_id: legacyId };
    const result = s.text(await s.callTool("dod_store_migrate", migrateArgs));
    assert.match(result, /Migrated: "Legacy Doc" → 1 root task group\(s\)\./);
  } finally {
    s.stop();
  }
});

// ── dod_adversarial_gate ────────────────────────────────────────────

function noFindingsLens(lensName: string) {
  return { lens: lensName, findings: [], mandatory_minimum_met: true };
}

test("dod_adversarial_gate on an unknown dod reports not found", async () => {
  const s = startServer();
  try {
    await s.init();
    const result = s.text(
      await s.callTool("dod_adversarial_gate", {
        dod_id: "no-such-id",
        phase: 1,
        verdict: "GO",
        lenses: [noFindingsLens("Spec")],
        summary: "ok",
      }),
    );
    assert.match(result, /^ERROR:/);
    assert.match(result, /not found/i);
  } finally {
    s.stop();
  }
});

test("dod_adversarial_gate records a GO verdict for phase 1", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir);
    const result = s.text(
      await s.callTool("dod_adversarial_gate", {
        dod_id: id,
        phase: 1,
        verdict: "GO",
        lenses: [noFindingsLens("Spec")],
        summary: "spec looks solid",
      }),
    );
    assert.match(result, new RegExp(`Adversarial gate recorded: Phase 1 ${DASH} GO`));
    const spec1 = `Phase 1 \\(Spec\\): .* GO ${DASH} spec looks solid`;
    assert.match(result, new RegExp(spec1));
    assert.match(result, /Phase 2 \(Test\): .* PENDING/);
  } finally {
    s.stop();
  }
});

test("dod_adversarial_gate refuses phase 2 while phase 1 is still pending", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir);
    const result = s.text(
      await s.callTool("dod_adversarial_gate", {
        dod_id: id,
        phase: 2,
        verdict: "GO",
        lenses: [noFindingsLens("Test")],
        summary: "tests look fine",
      }),
    );
    const pending = `ERROR: Cannot record Phase 2 gate ${DASH} Phase 1 \\(Spec\\) is PENDING\\.`;
    assert.match(result, new RegExp(pending));
  } finally {
    s.stop();
  }
});

test("dod_adversarial_gate refuses phase 2 when phase 1 was REVISE", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir);
    await s.callTool("dod_adversarial_gate", {
      dod_id: id,
      phase: 1,
      verdict: "REVISE",
      lenses: [noFindingsLens("Spec")],
      summary: "needs work",
    });
    const result = s.text(
      await s.callTool("dod_adversarial_gate", {
        dod_id: id,
        phase: 2,
        verdict: "GO",
        lenses: [noFindingsLens("Test")],
        summary: "tests look fine",
      }),
    );
    const revise = `ERROR: Cannot record Phase 2 gate ${DASH} Phase 1 \\(Spec\\) is REVISE\\.`;
    assert.match(result, new RegExp(revise));
  } finally {
    s.stop();
  }
});

test("dod_adversarial_gate allows phase 2 once phase 1 is GO", async () => {
  const s = startServer();
  try {
    await s.init();
    const { id } = await createDod(s, s.storeDir);
    await s.callTool("dod_adversarial_gate", {
      dod_id: id,
      phase: 1,
      verdict: "GO",
      lenses: [noFindingsLens("Spec")],
      summary: "spec ok",
    });
    const result = s.text(
      await s.callTool("dod_adversarial_gate", {
        dod_id: id,
        phase: 2,
        verdict: "GO",
        lenses: [noFindingsLens("Test")],
        summary: "tests ok",
      }),
    );
    assert.match(result, new RegExp(`Adversarial gate recorded: Phase 2 ${DASH} GO`));
    const spec2 = `Phase 1 \\(Spec\\): .* GO ${DASH} spec ok`;
    const test2 = `Phase 2 \\(Test\\): .* GO ${DASH} tests ok`;
    assert.match(result, new RegExp(spec2));
    assert.match(result, new RegExp(test2));
  } finally {
    s.stop();
  }
});
