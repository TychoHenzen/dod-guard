/**
 * dod-guard MCP server: 12 thin tool adapters over the modules in this
 * directory, plus the stdio-vs-CLI entry point split.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { isCliInvocation, runCli } from "./cli.js";
import { handleDodAdversarialGate } from "./mcp/dod-adversarial-gate.js";
import { handleDodAmend } from "./mcp/dod-amend.js";
import { handleDodCheck } from "./mcp/dod-check.js";
import { handleDodGenerate } from "./mcp/dod-generate.js";
import { handleDodImport } from "./mcp/dod-import.js";
import { handleDodList } from "./mcp/dod-list.js";
import { handleDodRemoveNode } from "./mcp/dod-remove-node.js";
import { handleDodStatus } from "./mcp/dod-status.js";
import { handleDodStoreMigrate } from "./mcp/dod-store-migrate.js";
import { handleDodTree } from "./mcp/dod-tree.js";
import { run, text } from "./mcp/resolve.js";
import { PredicateSchema, ProofCategorySchema, SectionsSchema, TaskNodeInputSchema } from "./schemas.js";
import { handleDodAddNode } from "./tools/dod-add-node.js";
import { handleDodCreate } from "./tools/dod-create.js";
import { handleDodRefine } from "./tools/dod-refine.js";

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const _pkgPath = path.join(_dirname, "..", "package.json");
const _pkg = JSON.parse(readFileSync(_pkgPath, "utf-8"));

const server = new McpServer({ name: "dod-guard", version: _pkg.version });

const REJECT_DOD_ID = [
  "ERROR: dod_create creates NEW DoDs. To update an existing DoD,",
  "use dod_amend for individual proofs or dod_check to verify.",
  "The dod_id parameter is not accepted here",
  "— it's only for dod_check, dod_amend, and other update tools.",
].join(" ");

const CREATE_DESC = [
  "Create a new DoD document with recursive TaskNode tree.",
  "Nodes can be draft (intent-only) or concrete (with proof commands).",
  "Proof commands run on the HOST OS",
  "— write them for that OS (e.g. on Windows use findstr/type/dir,",
  "not grep/cat/ls). Stores proof commands canonically in MCP storage",
  "— editing the rendered markdown cannot weaken verification.",
].join(" ");

const CHECK_DESC = [
  "Verify a DoD's concrete proofs from canonical storage,",
  "mark pass/fail, update the markdown, and return a verdict.",
  "Draft nodes are reported but skipped.",
  "Overall 'incomplete' while any drafts exist.",
  "Pass `nodePath` to verify only a subtree (fast iteration);",
  "scoped runs return INCOMPLETE and never PASS.",
  "Use `dod_tree` to discover current node paths before scoping.",
].join(" ");

const REFINE_DESC = [
  "Refine a draft TaskNode. Two modes:",
  "'concretize'",
  "— supply a proof command/predicate/description",
  "(draft leaf → concrete proof).",
  "'subdivide'",
  "— split into child subtasks",
  "(draft leaf → task group with draft children).",
  "Only works on draft leaves (no children, refinement=draft).",
].join(" ");

const AMEND_DESC = [
  "Modify a concrete proof's command, predicate, or description",
  "with a mandatory audit trail.",
  "Use when requirements change and an original proof becomes unreasonable.",
  "Resets the proof to pending.",
  "Pass node_path='*' to bulk-amend all concrete leaves",
  "(e.g. 'change all exit_code predicates to explicit value: 0').",
].join(" ");

const GATE_DESC = [
  "Record an adversarial gate verdict for a DoD phase.",
  "The skill orchestrator dispatches review subagents (lenses),",
  "collects findings, computes the GO/REVISE/STOP verdict,",
  "and records it here.",
  "A DoD cannot progress to phase N+1 until phase N's gate is GO.",
].join(" ");

server.tool(
  "dod_create",
  CREATE_DESC,
  {
    title: z.string(),
    goal: z.string(),
    type: z.enum(["bug", "general", "minimal"]),
    cwd: z.string(),
    markdown_path: z.string(),
    sections: SectionsSchema,
    roots: z.array(TaskNodeInputSchema),
    dod_id: z.string().optional(),
  },
  async (params) => {
    if (params.dod_id) return text(REJECT_DOD_ID);
    return run(() => handleDodCreate(params));
  },
);

server.tool(
  "dod_check",
  CHECK_DESC,
  {
    dod_id: z.string().optional(),
    path: z.string().optional(),
    cwd_override: z.string().optional(),
    nodePath: z.string().optional(),
    summary: z.boolean().optional(),
    confirm_import: z.boolean().optional(),
  },
  async (params) => run(() => handleDodCheck(params)),
);

server.tool(
  "dod_refine",
  REFINE_DESC,
  {
    dod_id: z.string(),
    node_path: z.string(),
    node_id: z.string().optional(),
    mode: z.enum(["concretize", "subdivide"]).optional().default("concretize"),
    command: z.string().optional(),
    predicate: PredicateSchema.optional(),
    description: z.string().optional(),
    category: ProofCategorySchema.optional(),
    advisory: z.boolean().optional(),
    children: z.array(z.object({ title: z.string(), intent: z.string() })).optional(),
  },
  async (params) => run(() => handleDodRefine(params)),
);

server.tool(
  "dod_add_node",
  "Add a new TaskNode (draft or concrete) as a child of an existing " + "task group, or at root level.",
  {
    dod_id: z.string(),
    parent_path: z.string(),
    parent_id: z.string().optional(),
    title: z.string(),
    refinement: z.enum(["draft", "concrete"]).optional().default("draft"),
    intent: z.string().optional(),
    command: z.string().optional(),
    predicate: PredicateSchema.optional(),
    description: z.string().optional(),
    category: ProofCategorySchema.optional(),
    advisory: z.boolean().optional(),
  },
  async (params) => run(async () => (await handleDodAddNode(params)).message),
);

server.tool(
  "dod_remove_node",
  "Remove a TaskNode and all its descendants from the DoD tree.",
  {
    dod_id: z.string(),
    node_path: z.string(),
    node_id: z.string().optional(),
  },
  async (params) => run(() => handleDodRemoveNode(params)),
);

server.tool(
  "dod_status",
  "Get the last check result for a DoD without re-running proofs.",
  {
    dod_id: z.string().optional(),
    path: z.string().optional(),
  },
  async (params) => run(() => handleDodStatus(params)),
);

server.tool(
  "dod_tree",
  "Display the full TaskNode tree with stable IDs, current paths, " +
    "titles, and statuses. Read-only structural dump " +
    "— no proof execution. Use to discover node paths without " +
    "running dod_check. Accepts optional dod_id/path to select the DoD, " +
    "and optional node_id/node_path to scope the view to a subtree.",
  {
    dod_id: z.string().optional(),
    path: z.string().optional(),
    node_id: z.string().optional(),
    node_path: z.string().optional(),
  },
  async (params) => run(() => handleDodTree(params)),
);

server.tool(
  "dod_amend",
  AMEND_DESC,
  {
    dod_id: z.string(),
    node_path: z.string(),
    node_id: z.string().optional(),
    new_command: z.string().optional(),
    new_predicate: PredicateSchema.optional(),
    new_description: z.string().optional(),
    reason: z.string(),
    amend_justification: z.string().optional(),
  },
  async (params) => run(() => handleDodAmend(params)),
);

server.tool("dod_list", "List all tracked DoD documents with their last check status.", {}, async () =>
  run(() => handleDodList()),
);

server.tool(
  "dod_import",
  "Import an existing DoD markdown file into canonical MCP storage. " +
    "Parses hierarchical tree structure from author.ts output format " +
    "(<!--p:...--> metadata) or hand-written markdown " +
    "(leaves become drafts).",
  {
    path: z.string(),
    cwd: z.string(),
  },
  async (params) => run(() => handleDodImport(params)),
);

server.tool(
  "dod_generate",
  "Generate a DoD from an OpenSpec change and register it alongside " +
    "that change. Fetches the change's instructions via the OpenSpec " +
    "CLI, converts its spec deltas into a DoD tree, and imports or " +
    "regenerates the tracked DoD for it.",
  {
    change_id: z.string(),
    cwd: z.string(),
  },
  async (params) => run(() => handleDodGenerate(params)),
);

server.tool(
  "dod_store_migrate",
  "Migrate legacy DoD documents from the old 'steps' format to the " +
    "current 'roots' TaskNode tree format. Idempotent " +
    "— already-migrated docs are skipped. " +
    "Run this once to upgrade all legacy docs.",
  {
    dod_id: z.string().optional(),
    dry_run: z.boolean().optional().default(false),
  },
  async (params) => run(() => handleDodStoreMigrate(params)),
);

const FINDING_SCHEMA = z.object({
  severity: z.enum(["critical", "major", "minor", "blocker"]),
  target: z.string().optional(),
  problem: z.string(),
  suggestion: z.string().optional(),
  evidence: z.string().optional(),
});

const LENS_SCHEMA = z.object({
  lens: z.string(),
  findings: z.array(FINDING_SCHEMA),
  mandatory_minimum_met: z.boolean(),
});

server.tool(
  "dod_adversarial_gate",
  GATE_DESC,
  {
    dod_id: z.string(),
    phase: z.number().min(1).max(4),
    verdict: z.enum(["GO", "REVISE", "STOP"]),
    lenses: z.array(LENS_SCHEMA),
    summary: z.string(),
  },
  async (params) => run(() => handleDodAdversarialGate(params)),
);

const _filename = fileURLToPath(import.meta.url);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] === _filename) {
  const argv = process.argv.slice(2);
  if (isCliInvocation(argv)) {
    runCli(argv)
      .then((code) => process.exit(code))
      .catch((err) => {
        process.stderr.write(`dod-guard CLI failed: ${err}\n`);
        process.exit(3);
      });
  } else {
    main().catch((err) => {
      process.stderr.write(`dod-guard MCP server failed: ${err}\n`);
      process.exit(1);
    });
  }
}
