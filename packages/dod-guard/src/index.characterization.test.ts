/**
 * Client-level characterization of the dod-guard MCP server. Every case here
 * drives a real child process over newline-delimited JSON-RPC, against a
 * throwaway store on disk, and reads the answer out of result.content[].text.
 * No module from src/ is imported: the coverage these cases produce comes from
 * the child, so the server has to run the way a client runs it.
 */
import * as assert from "node:assert/strict";
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

// Server messages still carry U+2014 and U+2192 in a few untouched error
// strings. This file stays pure ASCII. Proof lines use the ASCII "->"
// delimiter; ARROW is the unrelated U+2192 still emitted by dod-store-migrate.ts.
const EM = String.fromCharCode(0x2014);
const ARROW = String.fromCharCode(0x2192);
const TO = "->";

const SERVER_ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js");
const MCP_VERSION = "2025-06-18";
const PATIENCE_MS = 90_000;
/** How long a server gets to end itself after its input closes, before it is signalled. */
const FAREWELL_MS = 5_000;
/** How much of a server's error stream a failure report carries. */
const TROUBLE_TAIL = 2_000;
const OK_CMD = "node --version";
const BAD_CMD = 'node -e "process.exit(1)"';
const ABSENT_CMD = "no-such-dod-guard-tool --version";
const UNKNOWN_DOC = "00000000-0000-4000-8000-000000000000";
const SUPERSEDED_LISTED = "11111111-1111-4111-8111-111111111111";
const SUPERSEDED_MIGRATED = "22222222-2222-4222-8222-222222222222";
const OS_REFUSAL = "ERROR: 1 proof command(s) invoke tool(s) not available";

const EXPECTED_TOOLS = [
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
  "dod_generate",
  "dod_store_migrate",
  "dod_adversarial_gate",
];

interface RpcReply {
  id?: number;
  result?: { content?: { text: string }[]; tools?: { name: string }[] };
  error?: { message: string };
}

function parseReply(line: string): RpcReply | null {
  try {
    return JSON.parse(line) as RpcReply;
  } catch {
    return null;
  }
}

function withPatience<T>(answered: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const bell = setTimeout(() => reject(new Error(`no answer within ${PATIENCE_MS}ms: ${label}`)), PATIENCE_MS);
    const settle = (act: () => void) => {
      clearTimeout(bell);
      act();
    };
    answered.then(
      (value) => settle(() => resolve(value)),
      (err) => settle(() => reject(err)),
    );
  });
}

/** One server process plus the JSON-RPC bookkeeping its answers need. */
class ServerSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly awaiting = new Map<number, (reply: RpcReply) => void>();
  private readonly root: string;
  private trouble = "";
  private seq = 0;

  constructor(store: string, root: string) {
    this.root = root;
    this.child = spawn(process.execPath, [SERVER_ENTRY], {
      env: { ...process.env, DOD_STORE_DIR: store },
      stdio: "pipe",
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.trouble = (this.trouble + chunk.toString()).slice(-TROUBLE_TAIL);
    });
    createInterface({ input: this.child.stdout }).on("line", (line) => this.deliver(line));
  }

  private deliver(line: string): void {
    const reply = parseReply(line);
    if (!reply || reply.id === undefined) return;
    const settle = this.awaiting.get(reply.id);
    if (!settle) return;
    this.awaiting.delete(reply.id);
    settle(reply);
  }

  private async ask(method: string, params: Record<string, unknown>): Promise<RpcReply> {
    const id = this.seq + 1;
    this.seq = id;
    const answered = new Promise<RpcReply>((resolve) => this.awaiting.set(id, resolve));
    this.push({ jsonrpc: "2.0", id, method, params });
    try {
      return await withPatience(answered, method);
    } catch (err) {
      throw new Error(`${(err as Error).message}\nserver error stream: ${this.trouble || "(nothing)"}`);
    }
  }

  private push(message: Record<string, unknown>): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async begin(): Promise<void> {
    await this.ask("initialize", {
      protocolVersion: MCP_VERSION,
      capabilities: {},
      clientInfo: { name: "dod-guard-probe", version: "0.0.0" },
    });
    this.push({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async listTools(): Promise<string[]> {
    const reply = await this.ask("tools/list", {});
    return (reply.result?.tools ?? []).map((tool) => tool.name);
  }

  async invoke(tool: string, args: Record<string, unknown>): Promise<string> {
    const reply = await this.ask("tools/call", { name: tool, arguments: args });
    if (reply.error) throw new Error(`${tool} answered a protocol error: ${reply.error.message}`);
    return (reply.result?.content ?? []).map((part) => part.text).join("\n");
  }

  /**
   * Closing stdin is how the server is asked to finish, so it writes coverage.
   * A server that ignores that gets signalled instead, and its work directory
   * goes away either way.
   */
  async close(): Promise<void> {
    this.child.stdin.end();
    const parted = new Promise<boolean>((resolve) => {
      const patience = setTimeout(() => resolve(false), FAREWELL_MS);
      patience.unref();
      once(this.child, "exit").then(() => {
        clearTimeout(patience);
        resolve(true);
      });
    });
    if (!(await parted)) this.child.kill();
    await rm(this.root, { recursive: true, force: true });
  }
}

let live: ServerSession;
let workRoot = "";
let docStore = "";
let docSeq = 0;

async function bootstrap(): Promise<void> {
  workRoot = await mkdtemp(path.join(tmpdir(), "dodguard-mcp-"));
  docStore = path.join(workRoot, "store");
  await mkdir(docStore, { recursive: true });
  live = new ServerSession(docStore, workRoot);
  await live.begin();
}

async function invoke(tool: string, args: Record<string, unknown>): Promise<string> {
  return live.invoke(tool, args);
}

function proofNode(title: string, command: string, category = "behavioral"): Record<string, unknown> {
  return {
    title,
    refinement: "concrete",
    command,
    predicate: { type: "exit_code", value: 0 },
    description: `${title} runs ${command}`,
    category,
  };
}

function intentNode(title: string): Record<string, unknown> {
  return { title, refinement: "draft", intent: `${title} still needs a proof` };
}

function creationArgs(title: string, roots: unknown[]): Record<string, unknown> {
  docSeq += 1;
  return {
    title,
    goal: `goal of ${title}`,
    type: "general",
    cwd: workRoot,
    markdown_path: path.join(workRoot, `doc-${docSeq}.md`),
    sections: { requirements: `${title} must hold` },
    roots,
  };
}

function idFrom(answer: string): string {
  const line = answer.match(/^ID: (\S+)$/m);
  assert.ok(line, `expected an "ID: <value>" line in: ${answer}`);
  return line[1];
}

function fingerprintFrom(answer: string): string {
  const line = answer.match(/\*\*Proof fingerprint:\*\* `(\w+)`/);
  assert.ok(line, `expected a proof fingerprint in: ${answer}`);
  return line[1];
}

async function newDoc(title: string, roots: unknown[]): Promise<string> {
  return idFrom(await invoke("dod_create", creationArgs(title, roots)));
}

async function thriceAmended(title: string): Promise<string> {
  const id = await newDoc(title, [proofNode("p", OK_CMD)]);
  for (const round of [1, 2, 3]) {
    const args = { dod_id: id, node_path: "0", new_command: `node -p ${round}`, reason: `round ${round}` };
    await invoke("dod_amend", args);
  }
  return id;
}

async function importableFile(name: string, command: string): Promise<string> {
  const file = path.join(workRoot, `${name}.md`);
  const meta = '<!--p:{"type":"exit_code","value":0}-->';
  const body = [
    `# ${name}`,
    "",
    "<definition_of_done>",
    "## Definition of Done",
    "",
    `- [ ] Proof: \`${command}\` ${TO} ${name} verifies itself ${meta}`,
    "</definition_of_done>",
    "",
  ];
  await writeFile(file, body.join("\n"), "utf-8");
  return file;
}

/** Sections, a rule that closes one, a root heading and an indented group. */
async function nestedImportableFile(name: string): Promise<string> {
  const file = path.join(workRoot, `${name}.md`);
  const meta = '<!--p:{"type":"exit_code","value":0}-->';
  const body = [
    `# ${name}`,
    "",
    "## Requirements",
    "",
    "The parser must walk a nested tree.",
    "",
    "---",
    "",
    "## Research Notes",
    "",
    "Group depth comes from leading spaces.",
    "",
    "## Definition of Done",
    "",
    "### Root One",
    "",
    "  **Group A** [ ]",
    "",
    `    - [ ] Proof: \`${OK_CMD}\` ${TO} the group proof holds ${meta}`,
    "",
  ];
  await writeFile(file, body.join("\n"), "utf-8");
  return file;
}

async function writeSupersededDoc(title: string, id: string): Promise<void> {
  const proof = { id: "proof-1", title: "node answers", command: OK_CMD, predicate: { type: "exit_code", value: 0 } };
  const doc = {
    id,
    title,
    goal: `goal of ${title}`,
    date: "2020-01-01",
    cwd: workRoot,
    markdown_path: path.join(workRoot, `${id}.md`),
    created_at: "2020-01-01T00:00:00.000Z",
    execution_confirmed: true,
    sections: { requirements: `${title} must hold` },
    amendments: [],
    steps: [{ id: "step-1", title: "first step", proofs: [{ ...proof, description: "node reports a version" }] }],
  };
  await writeFile(path.join(docStore, `${id}.json`), JSON.stringify(doc, null, 2), "utf-8");
}

const UNKNOWN_ID_CALLS = [
  { tool: "dod_check", args: { dod_id: UNKNOWN_DOC } },
  { tool: "dod_remove_node", args: { dod_id: UNKNOWN_DOC, node_path: "0" } },
  { tool: "dod_tree", args: {} },
  { tool: "dod_amend", args: { dod_id: UNKNOWN_DOC, node_path: "0", reason: "no such doc" } },
  { tool: "dod_store_migrate", args: { dod_id: UNKNOWN_DOC } },
  {
    tool: "dod_adversarial_gate",
    args: { dod_id: UNKNOWN_DOC, phase: 1, verdict: "GO", lenses: [], summary: "no such doc" },
  },
];

describe("dod-guard MCP server: per-document tool answers", () => {
  before(async () => {
    await bootstrap();
    // One unreadable store file, so every listing and path lookup steps over it.
    await writeFile(path.join(docStore, "unreadable.json"), "{ not json", "utf-8");
  });
  after(() => live.close());

  test("tools/list must expose exactly the 13 dod tools", async () => {
    const names = await live.listTools();
    assert.equal(names.length, 13);
    assert.deepEqual(names.slice().sort(), EXPECTED_TOOLS.slice().sort());
  });

  test("dod_create must count roots, concrete proofs and drafts", async () => {
    const answer = await invoke("dod_create", creationArgs("counted", [proofNode("p", OK_CMD), intentNode("d")]));
    for (const part of ["DoD created.", "Roots: 2", "Concrete proofs: 1", "Draft nodes: 1"]) {
      assert.ok(answer.includes(part), `missing ${part} in: ${answer}`);
    }
  });

  test("dod_create must refuse a dod_id before it does anything else", async () => {
    const answer = await invoke("dod_create", { ...creationArgs("rejected", [proofNode("p", OK_CMD)]), dod_id: "x" });
    assert.ok(answer.startsWith("ERROR: dod_create creates NEW DoDs."), answer);
    assert.ok(answer.includes("dod_id parameter is not accepted here"), answer);
  });

  test("dod_create must warn when no root proves behavior", async () => {
    const answer = await invoke("dod_create", creationArgs("wiring only", [proofNode("w", OK_CMD, "wiring")]));
    assert.ok(answer.includes("No behavioral predicate proofs"), answer);
  });

  test("dod_create must refuse a command whose tool is absent from this OS", async () => {
    const answer = await invoke("dod_create", creationArgs("absent tool", [proofNode("m", ABSENT_CMD)]));
    assert.ok(answer.includes(OS_REFUSAL), answer);
    assert.ok(answer.includes(ABSENT_CMD), answer);
  });

  test("dod_create must publish an ID line that later calls can resolve", async () => {
    const id = await newDoc("addressable", [proofNode("p", OK_CMD)]);
    assert.ok((await invoke("dod_tree", { dod_id: id })).includes("addressable"), "tree did not resolve the ID line");
  });

  test("dod_check must PASS one passing leaf and print the proof fingerprint", async () => {
    const id = await newDoc("passing", [proofNode("p", OK_CMD)]);
    const answer = await invoke("dod_check", { dod_id: id });
    assert.ok(answer.includes("## DoD Check Result: PASS"), answer);
    assert.ok(answer.includes("**Proof fingerprint:**"), answer);
  });

  test("dod_check must keep its first fingerprint and still PASS on a second run", async () => {
    const id = await newDoc("checked twice", [proofNode("p", OK_CMD)]);
    const first = await invoke("dod_check", { dod_id: id });
    const second = await invoke("dod_check", { dod_id: id });
    assert.ok(second.includes("## DoD Check Result: PASS"), second);
    assert.equal(fingerprintFrom(second), fingerprintFrom(first));
  });

  test("dod_check must FAIL one failing leaf", async () => {
    const id = await newDoc("failing", [proofNode("f", BAD_CMD)]);
    assert.ok((await invoke("dod_check", { dod_id: id })).includes("## DoD Check Result: FAIL"));
  });

  test("dod_check must report INCOMPLETE while a draft remains", async () => {
    const id = await newDoc("half drafted", [proofNode("p", OK_CMD), intentNode("d")]);
    assert.ok((await invoke("dod_check", { dod_id: id })).includes("## DoD Check Result: INCOMPLETE"));
  });

  test("dod_check must echo a nodePath it cannot find", async () => {
    const id = await newDoc("bad scope", [proofNode("p", OK_CMD)]);
    const answer = await invoke("dod_check", { dod_id: id, nodePath: "9.children.9" });
    assert.ok(answer.includes('ERROR: nodePath "9.children.9" not found in this DoD.'), answer);
  });

  test("dod_check must never PASS a scoped run, even when the whole doc passes", async () => {
    const id = await newDoc("scoped", [{ title: "g", children: [proofNode("c", OK_CMD)] }]);
    assert.ok((await invoke("dod_check", { dod_id: id })).includes("## DoD Check Result: PASS"));
    const scoped = await invoke("dod_check", { dod_id: id, nodePath: "0" });
    assert.ok(scoped.includes("## DoD Check Result: INCOMPLETE"), scoped);
    assert.ok(scoped.includes("Scoped run"), scoped);
  });

  test("dod_check scoped must carry a leaf outside the scope forward as not verified", async () => {
    const other = proofNode("q", "node --version && node -p 1");
    const id = await newDoc("partly scoped", [proofNode("p", OK_CMD), other]);
    const answer = await invoke("dod_check", { dod_id: id, nodePath: "0" });
    assert.ok(answer.includes("not verified"), answer);
    assert.ok(answer.includes("Scoped run"), answer);
  });

  test("dod_check must gate an imported doc until confirm_import arrives", async () => {
    const file = await importableFile("gated-import", OK_CMD);
    const id = idFrom(await invoke("dod_import", { path: file, cwd: workRoot }));
    const gated = await invoke("dod_check", { dod_id: id });
    assert.ok(gated.includes("## Import Gate: Execution Not Confirmed"), gated);
    assert.ok(gated.includes("1 executable proof(s) would be run"), gated);
    const confirmed = await invoke("dod_check", { dod_id: id, confirm_import: true });
    assert.ok(confirmed.includes("## DoD Check Result: PASS"), confirmed);
  });

  test("dod_check must FAIL with TAMPER DETECTED after the stored proof set is edited", async () => {
    const id = await newDoc("tampered", [proofNode("p", OK_CMD)]);
    assert.ok((await invoke("dod_check", { dod_id: id })).includes("## DoD Check Result: PASS"));
    const file = path.join(docStore, `${id}.json`);
    const stored = JSON.parse(await readFile(file, "utf-8"));
    assert.equal(typeof stored.roots[0].command, "string");
    stored.roots[0].command = "node --help";
    await writeFile(file, JSON.stringify(stored, null, 2), "utf-8");
    const answer = await invoke("dod_check", { dod_id: id });
    assert.ok(answer.includes("## DoD Check Result: FAIL"), answer);
    assert.ok(answer.includes("TAMPER DETECTED"), answer);
  });

  test("dod_check must report STUCK once a still-failing node was amended 3 times", async () => {
    const id = await newDoc("stuck", [proofNode("f", BAD_CMD)]);
    for (const attempt of [2, 3, 4]) {
      const swap = `node -e "process.exit(${attempt})"`;
      await invoke("dod_amend", { dod_id: id, node_path: "0", new_command: swap, reason: `attempt ${attempt}` });
    }
    const answer = await invoke("dod_check", { dod_id: id });
    assert.ok(answer.includes("## DoD Check Result: STUCK"), answer);
    assert.ok(answer.includes("STUCK - approach may be wrong"), answer);
  });

  test("dod_refine concretize must turn the last draft into a proof", async () => {
    const id = await newDoc("to concretize", [intentNode("d")]);
    const answer = await invoke("dod_refine", {
      dod_id: id,
      node_path: "0",
      mode: "concretize",
      command: OK_CMD,
      predicate: { type: "exit_code", value: 0 },
      description: "node reports a version",
    });
    assert.ok(answer.includes('Node refined: "d" is now concrete.'), answer);
    assert.ok(answer.includes("All nodes are now concrete"), answer);
  });

  test("dod_refine subdivide must replace a draft leaf with child drafts", async () => {
    const id = await newDoc("to subdivide", [intentNode("d")]);
    const answer = await invoke("dod_refine", {
      dod_id: id,
      node_path: "0",
      mode: "subdivide",
      children: [
        { title: "first", intent: "prove the first half" },
        { title: "second", intent: "prove the second half" },
      ],
    });
    assert.ok(answer.includes("is now a task group with 2 child draft(s)"), answer);
  });

  test("dod_refine must flag a placeholder command that always exits 0", async () => {
    const id = await newDoc("placeholder refine", [intentNode("d")]);
    const answer = await invoke("dod_refine", {
      dod_id: id,
      node_path: "0",
      mode: "concretize",
      command: 'node -e "process.exit(0)"',
      predicate: { type: "exit_code", value: 0 },
      description: "proves nothing",
    });
    assert.ok(answer.includes("PLACEHOLDER PROOF"), answer);
    assert.ok(answer.includes("always exits 0"), answer);
  });

  test("dod_refine must send an already-concrete node to dod_amend", async () => {
    const id = await newDoc("already concrete", [proofNode("p", OK_CMD)]);
    const answer = await invoke("dod_refine", {
      dod_id: id,
      node_path: "0",
      mode: "concretize",
      command: OK_CMD,
      predicate: { type: "exit_code", value: 0 },
      description: "again",
    });
    assert.ok(answer.includes("is already concrete. Use dod_amend to modify."), answer);
  });

  test("dod_add_node must append a root draft and report its path", async () => {
    const id = await newDoc("growing", [proofNode("p", OK_CMD)]);
    const answer = await invoke("dod_add_node", {
      dod_id: id,
      parent_path: "",
      title: "new-draft",
      refinement: "draft",
      intent: "prove something later",
    });
    assert.ok(answer.includes('Node "new-draft" (draft) added at path "1".'), answer);
  });

  test("dod_add_node must require an intent on a draft", async () => {
    const id = await newDoc("intentless", [proofNode("p", OK_CMD)]);
    const args = { dod_id: id, parent_path: "", title: "no-intent", refinement: "draft" };
    assert.ok((await invoke("dod_add_node", args)).includes("ERROR: draft nodes require an intent"));
  });

  test("dod_add_node must refuse a child under a concrete leaf", async () => {
    const id = await newDoc("leaf parent", [proofNode("p", OK_CMD)]);
    const answer = await invoke("dod_add_node", {
      dod_id: id,
      parent_path: "0",
      title: "child",
      refinement: "draft",
      intent: "prove something later",
    });
    assert.ok(answer.includes(`is a leaf ${EM} cannot add children.`), answer);
  });

  test("dod_remove_node must name the root it removed", async () => {
    const id = await newDoc("shrinking", [proofNode("p", OK_CMD), intentNode("d")]);
    const answer = await invoke("dod_remove_node", { dod_id: id, node_path: "1" });
    assert.ok(answer.includes('Removed root node "d" (draft) and all descendants.'), answer);
  });

  test("dod_remove_node must report a root index out of range", async () => {
    const id = await newDoc("one root", [proofNode("p", OK_CMD)]);
    const answer = await invoke("dod_remove_node", { dod_id: id, node_path: "5" });
    assert.ok(answer.includes("ERROR: root index 5 out of range (0-0)."), answer);
  });

  test("dod_status must say so before the first check", async () => {
    const id = await newDoc("unchecked", [proofNode("p", OK_CMD)]);
    assert.ok((await invoke("dod_status", { dod_id: id })).includes("has never been checked. Run dod_check first."));
  });

  test("dod_status must echo the cached verdict after a passing check", async () => {
    const id = await newDoc("checked", [proofNode("p", OK_CMD)]);
    await invoke("dod_check", { dod_id: id });
    const answer = await invoke("dod_status", { dod_id: id });
    assert.ok(answer.includes("Overall: PASS"), answer);
    assert.ok(answer.includes("Concrete proofs: 1/1 pass"), answer);
  });

  test("dod_status must resolve a document by its markdown path", async () => {
    const args = creationArgs("path addressed", [proofNode("p", OK_CMD)]);
    await invoke("dod_create", args);
    const answer = await invoke("dod_status", { path: String(args.markdown_path) });
    assert.ok(answer.includes("has never been checked. Run dod_check first."), answer);
  });

  test("dod_tree must report a markdown path no document claims", async () => {
    const answer = await invoke("dod_tree", { path: path.join(workRoot, "unregistered.md") });
    assert.ok(answer.startsWith("ERROR:"), answer);
    assert.match(answer, /not found/i);
  });

  test("dod_tree must count the nodes and label each leaf kind", async () => {
    const id = await newDoc("tree shape", [proofNode("p", OK_CMD), intentNode("d")]);
    const answer = await invoke("dod_tree", { dod_id: id });
    for (const part of ["2 nodes: 1 concrete, 1 draft", 'PROOF: "p"', 'DRAFT: "d"']) {
      assert.ok(answer.includes(part), `missing ${part} in: ${answer}`);
    }
  });

  test("dod_amend must send a draft target to dod_refine", async () => {
    const id = await newDoc("draft target", [intentNode("d")]);
    const answer = await invoke("dod_amend", { dod_id: id, node_path: "0", new_command: OK_CMD, reason: "try" });
    assert.ok(answer.includes("ERROR: node is a draft. Use dod_refine to concretize it first."), answer);
  });

  for (const nodePath of ["0", "*"]) {
    test(`dod_amend must refuse an absent tool at node_path "${nodePath}"`, async () => {
      const id = await newDoc(`amend guard ${nodePath}`, [proofNode("p", OK_CMD)]);
      const args = { dod_id: id, node_path: nodePath, new_command: ABSENT_CMD, reason: "swap in a missing tool" };
      const answer = await invoke("dod_amend", args);
      assert.ok(answer.includes(OS_REFUSAL), answer);
      assert.ok(answer.includes(ABSENT_CMD), answer);
    });
  }

  test("dod_amend must log a valid amendment and reset the proof to pending", async () => {
    const id = await newDoc("amendable", [proofNode("p", OK_CMD)]);
    const args = { dod_id: id, node_path: "0", new_command: "node -p 7", reason: "requirements moved" };
    const answer = await invoke("dod_amend", args);
    assert.ok(answer.includes("Proof amended and logged."), answer);
    assert.ok(answer.includes("Status reset to pending. Run dod_check to re-verify."), answer);
  });

  test("dod_amend must demand a justification for a fourth amendment", async () => {
    const id = await thriceAmended("amended thrice");
    const args = { dod_id: id, node_path: "0", new_command: "node -p 4", reason: "one more" };
    assert.ok((await invoke("dod_amend", args)).includes("has been amended 3 times. Provide amend_justification"));
  });

  test("dod_amend must accept a fourth amendment that carries a justification", async () => {
    const id = await thriceAmended("amended thrice with reason");
    const answer = await invoke("dod_amend", {
      dod_id: id,
      node_path: "0",
      new_command: "node -p 4",
      reason: "one more",
      amend_justification: "the upstream contract changed again",
    });
    assert.ok(answer.includes("Proof amended and logged."), answer);
  });

  test("dod_amend bulk must refuse a document that holds only drafts", async () => {
    const id = await newDoc("all drafts", [intentNode("d")]);
    const args = { dod_id: id, node_path: "*", new_command: OK_CMD, reason: "bulk" };
    assert.ok((await invoke("dod_amend", args)).includes("ERROR: no concrete leaves to amend. Refine drafts first."));
  });

  test("dod_amend must refuse node_id together with bulk node_path", async () => {
    const id = await newDoc("bulk with id", [proofNode("p", OK_CMD)]);
    const args = { dod_id: id, node_path: "*", node_id: "node-1", new_command: OK_CMD, reason: "bulk" };
    assert.ok((await invoke("dod_amend", args)).includes('node_id is incompatible with node_path="*"'));
  });

  test("dod_list must show a tracked document with its counts", async () => {
    const id = await newDoc("Listed Doc", [proofNode("p", OK_CMD), intentNode("d")]);
    const answer = await invoke("dod_list", {});
    assert.ok(answer.includes("Listed Doc"), answer);
    assert.ok(answer.includes(`ID: ${id}`), answer);
    assert.ok(answer.includes("Status: UNCHECKED | 2 roots, 1 concrete proofs (1 draft)"), answer);
  });

  test("dod_import must parse a proof line into one concrete leaf", async () => {
    const file = await importableFile("plain-import", OK_CMD);
    const answer = await invoke("dod_import", { path: file, cwd: workRoot });
    for (const part of ["DoD imported.", "Concrete proofs: 1", "Draft nodes: 0"]) {
      assert.ok(answer.includes(part), `missing ${part} in: ${answer}`);
    }
  });

  test("dod_import must refuse a command whose tool is absent from this OS", async () => {
    const file = await importableFile("absent-import", ABSENT_CMD);
    const answer = await invoke("dod_import", { path: file, cwd: workRoot });
    assert.ok(answer.includes(OS_REFUSAL), answer);
    assert.ok(answer.includes(ABSENT_CMD), answer);
  });

  test("dod_import must build a nested tree from a heading and an indented group", async () => {
    const file = await nestedImportableFile("nested-import");
    const imported = await invoke("dod_import", { path: file, cwd: workRoot });
    assert.ok(imported.includes("Concrete proofs: 1"), imported);
    assert.ok(imported.includes("Draft nodes: 0"), imported);
    const tree = await invoke("dod_tree", { dod_id: idFrom(imported) });
    assert.ok(tree.includes("3 nodes: 1 concrete, 0 draft"), tree);
    assert.ok(tree.includes('GROUP: "Root One"'), tree);
    assert.ok(tree.includes('GROUP: "Group A"'), tree);
  });

  test("dod_import must answer a markdown path that is not there with an ERROR: line", async () => {
    const answer = await invoke("dod_import", { path: path.join(workRoot, "absent.md"), cwd: workRoot });
    assert.ok(answer.startsWith("ERROR:"), answer);
    assert.match(answer, /ENOENT/);
  });

  test("dod_import must recognize a path it already tracks", async () => {
    const file = await importableFile("twice-import", OK_CMD);
    await invoke("dod_import", { path: file, cwd: workRoot });
    assert.ok((await invoke("dod_import", { path: file, cwd: workRoot })).includes("Already tracked as"));
  });

  test("dod_store_migrate must skip a document already in the current format", async () => {
    const id = await newDoc("current format", [proofNode("p", OK_CMD)]);
    const answer = await invoke("dod_store_migrate", { dod_id: id });
    assert.ok(answer.includes(`already in the current format ${EM} no migration needed.`), answer);
  });

  test("dod_adversarial_gate must record phase 1 and leave phase 2 pending", async () => {
    const id = await newDoc("gate phase one", [proofNode("p", OK_CMD)]);
    const answer = await invoke("dod_adversarial_gate", {
      dod_id: id,
      phase: 1,
      verdict: "GO",
      lenses: [{ lens: "spec", findings: [], mandatory_minimum_met: true }],
      summary: "spec looks solid",
    });
    assert.ok(answer.includes(`Adversarial gate recorded: Phase 1 ${EM} GO`), answer);
    assert.match(answer, new RegExp(`Phase 1 \\(Spec\\): .* GO ${EM} spec looks solid`));
    assert.match(answer, /Phase 2 \(Test\): .* PENDING/);
  });

  for (const first of ["PENDING", "REVISE"]) {
    test(`dod_adversarial_gate must refuse phase 2 while phase 1 is ${first}`, async () => {
      const id = await newDoc(`gate blocked by ${first}`, [proofNode("p", OK_CMD)]);
      const lenses = [{ lens: "spec", findings: [], mandatory_minimum_met: true }];
      if (first === "REVISE") {
        const spec = { dod_id: id, phase: 1, verdict: first, lenses, summary: "spec thin" };
        await invoke("dod_adversarial_gate", spec);
      }
      const answer = await invoke("dod_adversarial_gate", {
        dod_id: id,
        phase: 2,
        verdict: "GO",
        lenses,
        summary: "tests look solid",
      });
      assert.ok(answer.includes(`ERROR: Cannot record Phase 2 gate ${EM} Phase 1 (Spec) is ${first}.`), answer);
    });
  }

  test("dod_adversarial_gate must record phase 2 once phase 1 came back GO", async () => {
    const id = await newDoc("gate phase two", [proofNode("p", OK_CMD)]);
    const lenses = [{ lens: "spec", findings: [], mandatory_minimum_met: true }];
    await invoke("dod_adversarial_gate", { dod_id: id, phase: 1, verdict: "GO", lenses, summary: "spec ok" });
    const args = { dod_id: id, phase: 2, verdict: "GO", lenses, summary: "tests ok" };
    const answer = await invoke("dod_adversarial_gate", args);
    assert.ok(answer.includes(`Adversarial gate recorded: Phase 2 ${EM} GO`), answer);
    assert.match(answer, new RegExp(`Phase 1 \\(Spec\\): .* GO ${EM} spec ok`));
    assert.match(answer, new RegExp(`Phase 2 \\(Test\\): .* GO ${EM} tests ok`));
  });

  for (const call of UNKNOWN_ID_CALLS) {
    test(`${call.tool} must answer an unresolvable document with a leading ERROR:`, async () => {
      const answer = await invoke(call.tool, call.args);
      assert.ok(answer.startsWith("ERROR:"), answer);
      assert.match(answer, /not found/i);
    });
  }
});

describe("dod-guard MCP server: whole-store answers on an empty store", () => {
  before(bootstrap);
  after(() => live.close());

  test("dod_list must answer an empty store with that line and nothing else", async () => {
    const answer = await invoke("dod_list", {});
    assert.equal(answer, "No DoD documents tracked. Use dod_create or dod_import to add one.");
  });

  test("dod_store_migrate must report nothing to migrate when no superseded file exists", async () => {
    const answer = await invoke("dod_store_migrate", {});
    assert.ok(answer.includes(`No legacy documents found ${EM} all docs are in the current format.`), answer);
  });
});

describe("dod-guard MCP server: whole-store answers with superseded files", () => {
  before(async () => {
    await bootstrap();
    await writeSupersededDoc("Old Format Doc", SUPERSEDED_LISTED);
    await writeSupersededDoc("Legacy Doc", SUPERSEDED_MIGRATED);
  });
  after(() => live.close());

  test("dod_list must keep listing when a stored file is in the superseded format", async () => {
    const current = await newDoc("Current Doc", [proofNode("p", OK_CMD)]);
    const answer = await invoke("dod_list", {});
    assert.ok(!answer.startsWith("ERROR:"), answer);
    for (const part of ["Old Format Doc", "Status: LEGACY", "Current Doc", `ID: ${current}`]) {
      assert.ok(answer.includes(part), `missing ${part} in: ${answer}`);
    }
  });

  test("dod_store_migrate must convert a superseded file into root task groups", async () => {
    const answer = await invoke("dod_store_migrate", { dod_id: SUPERSEDED_MIGRATED });
    assert.ok(answer.includes(`Migrated: "Legacy Doc" ${ARROW} 1 root task group(s).`), answer);
  });
});
