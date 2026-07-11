/**
 * GitEvo MCP Server — evolutionary git branching for LLM agents.
 *
 * 13 tools:
 *   init, checkpoint, learn, lessons, export_lessons, spawn,
 *   checkpoints, branches, abandon, diff, summary, adopt, finish
 *
 * export_lessons outputs memory-ready JSON for obsidian-rag import.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  evo_init,
  evo_checkpoint,
  evo_learn,
  evo_lessons,
  evo_export_lessons,
  evo_spawn,
  evo_checkpoints,
  evo_branches,
  evo_abandon,
  evo_diff,
  evo_summary,
  evo_adopt,
  evo_finish,
  EvoError,
} from "./operations.js";

const server = new McpServer({
  name: "gitevo",
  version: "0.1.3",
});

export function wrap(fn: (...args: any[]) => string): (...args: any[]) => string {
  return (...args: any[]) => {
    try {
      return fn(...args);
    } catch (err) {
      if (err instanceof EvoError) {
        return `ERROR: ${err.message}`;
      }
      const msg = err instanceof Error ? err.message : String(err);
      return `ERROR: ${msg}`;
    }
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────

server.tool(
  "evo_init",
  "Initialize GitEvo in the current repo. Creates .evo/ directory with lessons.jsonl. Tags HEAD as evo-root. Re-running resets: clears lessons, re-tags root.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: wrap(evo_init)() }],
  }),
);

// ── Checkpoints ───────────────────────────────────────────────────────

server.tool(
  "evo_checkpoint",
  "Tag HEAD as evo-{name} with description in tag annotation. Refuses if working tree has modified tracked files.",
  {
    name: z.string().describe("Checkpoint name (tagged as evo-{name})"),
    description: z.string().describe("Description stored in tag annotation"),
  },
  async ({ name, description }) => ({
    content: [{ type: "text" as const, text: wrap(evo_checkpoint)(name, description) }],
  }),
);

server.tool("evo_checkpoints", "List all evo-* tags with descriptions, roughly newest first.", {}, async () => ({
  content: [{ type: "text" as const, text: wrap(evo_checkpoints)() }],
}));

// ── Spawn & branches ──────────────────────────────────────────────────

server.tool(
  "evo_spawn",
  "Create a new branch from a checkpoint tag and check it out. Refuses if tree dirty, checkpoint not found, or branch already exists.",
  {
    checkpoint_name: z.string().describe("Checkpoint name to spawn from (without evo- prefix)"),
    new_branch: z.string().describe("Name for the new branch"),
  },
  async ({ checkpoint_name, new_branch }) => ({
    content: [{ type: "text" as const, text: wrap(evo_spawn)(checkpoint_name, new_branch) }],
  }),
);

server.tool("evo_branches", "List all attempt branches (non-root, non-default like main/master).", {}, async () => ({
  content: [{ type: "text" as const, text: wrap(evo_branches)() }],
}));

// ── Lessons ───────────────────────────────────────────────────────────

server.tool(
  "evo_learn",
  "Append a lesson to .evo/lessons.jsonl with timestamp and current branch. Use for failed approaches, discoveries, gotchas, and abandoned strategies.",
  {
    content: z.string().describe("Lesson content — what was learned"),
  },
  async ({ content }) => ({
    content: [{ type: "text" as const, text: wrap(evo_learn)(content) }],
  }),
);

server.tool(
  "evo_lessons",
  "Return all lessons from .evo/lessons.jsonl, newest first. Numbered list with timestamp, branch, and content.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: wrap(evo_lessons)() }],
  }),
);

server.tool(
  "evo_export_lessons",
  "Export all lessons as obsidian-rag-ready JSON array. Each entry has id, title, description, content, type, and metadata fields matching the memory_save schema. Pass individual entries to obsidian-rag's memory_save tool to persist lessons across sessions.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: wrap(evo_export_lessons)() }],
  }),
);

// ── Abandon ───────────────────────────────────────────────────────────

server.tool(
  "evo_abandon",
  "Abandon current branch: tag as evo-dead-{branch} and revert to checkpoint or parent commit. Optionally record reason as a lesson. Refuses if tree dirty.",
  {
    checkpoint: z
      .string()
      .optional()
      .describe("Checkpoint name to revert to (without evo- prefix). If omitted, reverts to parent commit (HEAD~1)."),
    reason: z.string().optional().describe("Why this branch was abandoned — recorded as a lesson"),
  },
  async ({ checkpoint, reason }) => ({
    content: [{ type: "text" as const, text: wrap(evo_abandon)(checkpoint, reason) }],
  }),
);

// ── Analysis ──────────────────────────────────────────────────────────

server.tool(
  "evo_diff",
  "Return git diff between two checkpoint tags.",
  {
    checkpoint_a: z.string().describe("First checkpoint name (without evo- prefix)"),
    checkpoint_b: z.string().describe("Second checkpoint name (without evo- prefix)"),
  },
  async ({ checkpoint_a, checkpoint_b }) => ({
    content: [{ type: "text" as const, text: wrap(evo_diff)(checkpoint_a, checkpoint_b) }],
  }),
);

server.tool(
  "evo_summary",
  "Return overview: active branch, checkpoint count, lesson count, dead/adopted branches.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: wrap(evo_summary)() }],
  }),
);

// ── Finalize ──────────────────────────────────────────────────────────

server.tool(
  "evo_adopt",
  "Merge winning branch into root branch (main/master) and tag as evo-adopted.",
  {
    branch: z.string().describe("Branch name to merge into root"),
  },
  async ({ branch }) => ({
    content: [{ type: "text" as const, text: wrap(evo_adopt)(branch) }],
  }),
);

server.tool(
  "evo_finish",
  "Declare current state definitive: merge to root, delete ALL evo-* tags, remove all side branches, delete .evo/ directory. Irreversible cleanup.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: wrap(evo_finish)() }],
  }),
);

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const __filename = fileURLToPath(import.meta.url);

// ── Start (only when run directly, not when imported by tests) ─────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    process.stderr.write(`gitevo MCP server failed: ${err}\n`);
    process.exit(1);
  });
}
