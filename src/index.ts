import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "node:path";
import { createHash } from "node:crypto";
import * as store from "./store.js";
import { checkDocument } from "./checker.js";
import { writeMarkdown, updateDocFromCheckResult, formatCheckResult } from "./author.js";
import { parseMarkdown } from "./parser.js";
import type { DodDocument, Predicate, Step } from "./types.js";

const server = new McpServer({
  name: "dod-guard",
  version: "1.0.0",
});

// ── Shared schemas ──────────────────────────────────────────────────

const PredicateSchema = z.object({
  type: z.enum(["exit_code", "exit_code_not", "output_contains", "output_matches", "manual"]),
  value: z.union([z.number(), z.string()]).optional(),
});

const ProofInputSchema = z.object({
  command: z.string(),
  predicate: PredicateSchema,
  description: z.string(),
});

const StepInputSchema = z.object({
  title: z.string(),
  proofs: z.array(ProofInputSchema),
});

const SectionsSchema = z.object({
  decisions: z.string().optional(),
  current_state: z.string().optional(),
  requirements: z.string(),
  research_notes: z.string().optional(),
  open_questions: z.string().optional(),
  open_risks: z.string().optional(),
});

// ── dod_create ──────────────────────────────────────────────────────

server.tool(
  "dod_create",
  "Create a new locked DoD document. Stores proof commands canonically in MCP storage — editing the rendered markdown cannot weaken verification. Returns the DoD ID for use with dod_check.",
  {
    title: z.string().describe("Feature/plan title"),
    goal: z.string().describe("One-sentence goal"),
    cwd: z.string().describe("Working directory for running proof commands (absolute path)"),
    markdown_path: z.string().describe("Where to write the DoD markdown file (absolute path)"),
    sections: SectionsSchema,
    steps: z.array(StepInputSchema).describe("DoD steps with proof commands and predicates"),
  },
  async ({ title, goal, cwd, markdown_path, sections, steps }) => {
    const id = store.generateId();
    const date = new Date().toISOString().split("T")[0];

    const dodSteps: Step[] = steps.map((s, si) => ({
      id: `step-${si + 1}`,
      title: s.title,
      proofs: s.proofs.map((p, pi) => ({
        id: `proof-${si + 1}-${pi + 1}`,
        command: p.command,
        predicate: p.predicate as Predicate,
        description: p.description,
        last_status: "pending" as const,
      })),
    }));

    const doc: DodDocument = {
      id,
      title,
      goal,
      date,
      cwd: path.resolve(cwd),
      markdown_path: path.resolve(markdown_path),
      created_at: new Date().toISOString(),
      locked: true,
      sections,
      steps: dodSteps,
      amendments: [],
    };

    await store.save(doc);
    await writeMarkdown(doc);

    const proofCount = dodSteps.reduce((sum, s) => sum + s.proofs.length, 0);

    // Compute initial proof-set fingerprint for tamper-evidence
    const fpData = dodSteps.flatMap(s =>
      s.proofs.map(p => `${p.command}|${p.predicate.type}|${p.predicate.value ?? ""}`)
    ).join("\n");
    const fingerprint = createHash("sha256").update(fpData).digest("hex").slice(0, 12);

    return {
      content: [{
        type: "text" as const,
        text: [
          "DoD created and locked.",
          "",
          `ID: ${id}`,
          `Path: ${markdown_path}`,
          `Steps: ${dodSteps.length}`,
          `Proofs: ${proofCount}`,
          `Proof fingerprint: ${fingerprint}`,
          "",
          "Proof commands are stored canonically in MCP. Editing the markdown file cannot affect verification.",
          "Each dod_check prints the proof fingerprint — compare to detect store tampering.",
          "Use dod_check to run verification.",
        ].join("\n"),
      }],
    };
  },
);

// ── dod_check ───────────────────────────────────────────────────────

server.tool(
  "dod_check",
  "Run ALL proof commands for a DoD from canonical (locked) storage, mark pass/fail, update the markdown, and return an overall PASS/FAIL verdict. Use as /goal completion condition. Commands are executed from MCP's locked copy — the markdown file cannot influence results.",
  {
    dod_id: z.string().optional().describe("DoD ID (from dod_create or dod_list)"),
    path: z.string().optional().describe("Markdown file path — resolves to DoD by path if no ID given"),
    cwd_override: z.string().optional().describe("Override working directory for this check run"),
  },
  async ({ dod_id, path: mdPath, cwd_override }) => {
    let doc: DodDocument | null = null;

    if (dod_id) {
      doc = await store.load(dod_id);
    } else if (mdPath) {
      doc = await store.findByPath(mdPath);
    }

    if (!doc) {
      return {
        content: [{
          type: "text" as const,
          text: `ERROR: DoD not found. ${dod_id ? `ID "${dod_id}" not in store.` : `No DoD registered for path "${mdPath}".`}\nUse dod_list to see tracked DoDs, or dod_import to register an existing file.`,
        }],
      };
    }

    const result = await checkDocument(doc, cwd_override);

    updateDocFromCheckResult(doc, result);
    await store.save(doc);
    await writeMarkdown(doc);

    return {
      content: [{
        type: "text" as const,
        text: formatCheckResult(result),
      }],
    };
  },
);

// ── dod_status ──────────────────────────────────────────────────────

server.tool(
  "dod_status",
  "Get the last check result for a DoD without re-running proofs. Quick read of cached state.",
  {
    dod_id: z.string().optional(),
    path: z.string().optional(),
  },
  async ({ dod_id, path: mdPath }) => {
    let doc: DodDocument | null = null;
    if (dod_id) doc = await store.load(dod_id);
    else if (mdPath) doc = await store.findByPath(mdPath);

    if (!doc) {
      return { content: [{ type: "text" as const, text: "ERROR: DoD not found." }] };
    }

    if (!doc.last_check) {
      return { content: [{ type: "text" as const, text: `DoD "${doc.title}" has never been checked. Run dod_check first.` }] };
    }

    const stepLines = doc.steps.map((s, i) => {
      const passed = s.proofs.filter(p => p.last_status === "pass" || p.last_status === "skipped").length;
      const icon = passed === s.proofs.length ? "✅" : "❌";
      return `${icon} Step ${i + 1}: ${s.title} (${passed}/${s.proofs.length})`;
    });

    return {
      content: [{
        type: "text" as const,
        text: [
          `DoD: ${doc.title}`,
          `ID: ${doc.id}`,
          `Last check: ${doc.last_check.timestamp}`,
          `Overall: ${doc.last_check.overall.toUpperCase()}`,
          "",
          ...stepLines,
          "",
          `Summary: ${doc.last_check.summary}`,
        ].join("\n"),
      }],
    };
  },
);

// ── dod_amend ───────────────────────────────────────────────────────

server.tool(
  "dod_amend",
  "Modify a proof command in canonical storage with a mandatory audit trail. Use when requirements change and an original proof becomes unreasonable. Resets the proof to pending.",
  {
    dod_id: z.string().describe("DoD ID"),
    step_index: z.number().describe("Step index (0-based)"),
    proof_index: z.number().describe("Proof index within the step (0-based)"),
    new_command: z.string().optional().describe("New command (omit to keep existing)"),
    new_predicate: PredicateSchema.optional().describe("New predicate (omit to keep existing)"),
    new_description: z.string().optional().describe("New human-readable description (omit to keep)"),
    reason: z.string().describe("Why this amendment is needed — logged permanently"),
  },
  async ({ dod_id, step_index, proof_index, new_command, new_predicate, new_description, reason }) => {
    const doc = await store.load(dod_id);
    if (!doc) {
      return { content: [{ type: "text" as const, text: "ERROR: DoD not found." }] };
    }
    if (step_index < 0 || step_index >= doc.steps.length) {
      return { content: [{ type: "text" as const, text: `ERROR: step_index ${step_index} out of range (0-${doc.steps.length - 1}).` }] };
    }
    const step = doc.steps[step_index];
    if (proof_index < 0 || proof_index >= step.proofs.length) {
      return { content: [{ type: "text" as const, text: `ERROR: proof_index ${proof_index} out of range (0-${step.proofs.length - 1}).` }] };
    }

    const proof = step.proofs[proof_index];

    // Block weakening: converting a machine-checkable proof to manual is an instant-pass loophole
    if (new_predicate?.type === "manual" && proof.predicate.type !== "manual") {
      return {
        content: [{
          type: "text" as const,
          text: "ERROR: Cannot convert a machine-checkable proof to manual — this would bypass verification. Amend the command or predicate instead.",
        }],
      };
    }

    const oldSnapshot = { command: proof.command, predicate: { ...proof.predicate }, description: proof.description };

    if (new_command !== undefined) proof.command = new_command;
    if (new_predicate !== undefined) proof.predicate = new_predicate as Predicate;
    if (new_description !== undefined) proof.description = new_description;
    proof.last_status = "pending";

    doc.amendments.push({
      timestamp: new Date().toISOString(),
      step_id: step.id,
      proof_id: proof.id,
      action: "modified",
      old_value: oldSnapshot,
      new_value: { command: proof.command, predicate: { ...proof.predicate }, description: proof.description },
      reason,
    });

    await store.save(doc);
    await writeMarkdown(doc);

    return {
      content: [{
        type: "text" as const,
        text: [
          "Proof amended and logged.",
          "",
          `Step: ${step.title}`,
          `Old command: \`${oldSnapshot.command}\``,
          `New command: \`${proof.command}\``,
          `Reason: ${reason}`,
          "",
          "Status reset to pending. Run dod_check to re-verify.",
        ].join("\n"),
      }],
    };
  },
);

// ── dod_list ────────────────────────────────────────────────────────

server.tool(
  "dod_list",
  "List all tracked DoD documents with their last check status.",
  {},
  async () => {
    const docs = await store.listAll();
    if (docs.length === 0) {
      return { content: [{ type: "text" as const, text: "No DoD documents tracked. Use dod_create or dod_import to add one." }] };
    }

    const lines = docs.map(d => {
      const status = d.last_check?.overall?.toUpperCase() ?? "UNCHECKED";
      const stepCount = d.steps.length;
      const proofCount = d.steps.reduce((sum, s) => sum + s.proofs.length, 0);
      return [
        `• ${d.title}`,
        `  ID: ${d.id}`,
        `  Path: ${d.markdown_path}`,
        `  Status: ${status} | ${stepCount} steps, ${proofCount} proofs`,
        `  Last check: ${d.last_check?.timestamp ?? "never"}`,
      ].join("\n");
    });

    return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
  },
);

// ── dod_import ──────────────────────────────────────────────────────

server.tool(
  "dod_import",
  "Import an existing DoD markdown file into canonical MCP storage. Parses proof commands, infers predicates, and locks them. Use for pre-existing DoD docs not created via dod_create.",
  {
    path: z.string().describe("Absolute path to the existing DoD markdown file"),
    cwd: z.string().describe("Working directory for running proof commands (absolute path)"),
  },
  async ({ path: mdPath, cwd }) => {
    const existing = await store.findByPath(mdPath);
    if (existing) {
      return {
        content: [{
          type: "text" as const,
          text: `Already tracked as "${existing.title}" (ID: ${existing.id}). Use dod_check to verify.`,
        }],
      };
    }

    try {
      const parsed = await parseMarkdown(mdPath);
      const id = store.generateId();
      const resolvedCwd = path.resolve(cwd);

      const doc: DodDocument = {
        id,
        title: parsed.title,
        goal: parsed.goal,
        date: parsed.date || new Date().toISOString().split("T")[0],
        cwd: resolvedCwd,
        markdown_path: path.resolve(mdPath),
        created_at: new Date().toISOString(),
        locked: true,
        sections: parsed.sections,
        steps: parsed.steps,
        amendments: [],
      };

      await store.save(doc);

      const proofCount = doc.steps.reduce((sum, s) => sum + s.proofs.length, 0);
      return {
        content: [{
          type: "text" as const,
          text: [
            "DoD imported and locked.",
            "",
            `ID: ${id}`,
            `Title: ${doc.title}`,
            `Steps: ${doc.steps.length}`,
            `Proofs: ${proofCount}`,
            `Cwd: ${resolvedCwd}`,
            "",
            "Proof commands are now canonical in MCP storage.",
            "Use dod_check to run verification.",
          ].join("\n"),
        }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `ERROR parsing markdown: ${msg}` }],
      };
    }
  },
);

// ── Start ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`dod-guard MCP server failed: ${err}\n`);
  process.exit(1);
});
