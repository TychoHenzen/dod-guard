import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "node:path";
import * as store from "./store.js";
import { checkDocument, computeProofFingerprint, flattenConcreteLeaves, findNodeByPath, hasDraftNodes, countDraftNodes, extractExecutableCommands, isExecutablePredicate } from "./checker.js";
import { writeMarkdown, updateDocFromCheckResult, formatCheckResult } from "./author.js";
import { parseMarkdown } from "./parser.js";
import { playJingle, showVerifyDialog } from "./notify.js";
import { findMissingTools, suggestionFor, currentOs, type MissingTool } from "./command-check.js";
import { validateBaseline } from "./baseline.js";
import { resolveManual, type Confirmer, type ManualAnswer } from "./manual.js";
import type { DodDocument, Predicate, TaskNode, ProofCategory } from "./types.js";

const server = new McpServer({
  name: "dod-guard",
  version: "2.2.3",
});

// ── Shared schemas ──────────────────────────────────────────────────

const PredicateSchema = z.object({
  type: z.enum(["exit_code", "exit_code_not", "output_contains", "output_matches", "output_not_contains", "output_not_matches", "tdd", "manual", "review", "mutation", "regression", "assertions", "streamline", "observability", "brevity", "line_length", "function_size", "file_size", "cohesion", "replacement_ratio"]),
  value: z.union([z.number(), z.string()]).optional(),
  extract: z.string().optional().describe("regression only: regex whose capture group 1 is the metric number; omit to use the last number in stdout."),
  lower_is_better: z.boolean().optional().describe("regression only: true (default) => smaller is better (perf/complexity/duplication); false => larger is better (coverage)."),
  max_line_length: z.number().optional().describe("brevity / line_length: max characters per line (default 120)."),
  max_function_lines: z.number().optional().describe("brevity / function_size: max lines per function (default 30)."),
  max_file_lines: z.number().optional().describe("brevity / file_size: max lines per file (default 300)."),
  max_complexity: z.number().optional().describe("brevity / cohesion: max cyclomatic complexity per function (default 5)."),
  require_guard_clauses: z.boolean().optional().describe("brevity / cohesion: flag unnecessary else after exit statement (default true)."),
  suggest_guard_clauses: z.boolean().optional().describe("brevity / cohesion: flag if/else pairs in functions lacking guard clauses — advisory suggestion (default true)."),
  min_replacement_ratio: z.number().optional().describe("brevity / replacement_ratio: minimum deletion/insertion ratio (default 0.2)."),
});

const ProofCategorySchema = z.enum([
  "lint", "format", "tdd", "structure", "test", "mutation",
  "integration_wiring", "integration_behavioral",
  "performance", "complexity", "coverage", "duplication",
  "streamline", "observability", "brevity", "manual", "other",
]);

// Recursive TaskNode input schema
const TaskNodeInputSchema: z.ZodType<{
  title: string;
  refinement?: "draft" | "concrete";
  intent?: string;
  children?: { title: string; refinement?: "draft" | "concrete"; intent?: string; children?: any[]; command?: string; predicate?: any; description?: string; category?: string; advisory?: boolean }[];
  command?: string;
  predicate?: { type: string; value?: number | string; extract?: string; lower_is_better?: boolean; max_line_length?: number; max_function_lines?: number; max_file_lines?: number; max_complexity?: number; require_guard_clauses?: boolean; suggest_guard_clauses?: boolean; min_replacement_ratio?: number };
  description?: string;
  category?: string;
  advisory?: boolean;
}> = z.lazy(() =>
  z.object({
    title: z.string(),
    refinement: z.enum(["draft", "concrete"]).optional().default("draft"),
    intent: z.string().optional().describe("Required for draft nodes: what behavior this will prove"),
    children: z.array(TaskNodeInputSchema).optional().describe("Subtask decomposition — present on task groups"),
    command: z.string().optional(),
    predicate: PredicateSchema.optional(),
    description: z.string().optional(),
    category: ProofCategorySchema.optional(),
    advisory: z.boolean().optional(),
  })
);

const SectionsSchema = z.object({
  decisions: z.string().optional(),
  current_state: z.string().optional(),
  requirements: z.string(),
  research_notes: z.string().optional(),
  open_questions: z.string().optional(),
  open_risks: z.string().optional(),
});

// ── Node ID generation ──────────────────────────────────────────────

let nodeIdCounter = 0;
function resetNodeIdCounter(): void { nodeIdCounter = 0; }
function nextNodeId(): string { return `node-${++nodeIdCounter}`; }

/** Convert TaskNodeInput trees into TaskNode objects with assigned IDs. */
function buildTaskNodes(
  inputs: { title: string; refinement?: "draft" | "concrete"; intent?: string; children?: any[]; command?: string; predicate?: any; description?: string; category?: string; advisory?: boolean }[],
): TaskNode[] {
  return inputs.map((input) => {
    const isGroup = !!(input.children && input.children.length > 0);
    // Task groups are structural containers — they're done as soon as they have children.
    // "draft"/"concrete" only applies to leaves (no children).
    const effectiveRefinement = isGroup ? "concrete" : (input.refinement ?? "draft");

    const node: TaskNode = {
      id: nextNodeId(),
      title: input.title,
      refinement: effectiveRefinement,
      last_status: effectiveRefinement === "draft" ? "draft" : "pending",
    };

    if (isGroup) {
      node.children = buildTaskNodes(input.children!);
    }

    if (!isGroup && input.refinement === "draft") {
      node.intent = input.intent;
    }

    if (!isGroup && input.refinement === "concrete") {
      node.command = input.command;
      node.predicate = input.predicate as Predicate | undefined;
      node.description = input.description;
      node.category = input.category as ProofCategory | undefined;
      node.advisory = input.advisory ?? (input.predicate?.type === "regression" ? true : undefined);
      // Coverage metrics default to higher-is-better
      if (input.predicate?.type === "regression" && node.category === "coverage" && input.predicate.lower_is_better === undefined) {
        (node.predicate as Predicate).lower_is_better = false;
      }
    }

    return node;
  });
}

// ── OS command validation ───────────────────────────────────────────

function formatMissingTools(missing: MissingTool[]): string {
  const lines = [
    `ERROR: ${missing.length} proof command(s) invoke tool(s) not available on this OS (${currentOs}).`,
    "Proof commands run on THIS machine — author them for the target OS, not as portable/bash by default.",
    "",
  ];
  for (const m of missing) {
    const hint = suggestionFor(m.tool);
    lines.push(`  • \`${m.tool}\` not found${hint ? ` — on ${currentOs} use: ${hint}` : ""}`);
    lines.push(`    in: ${m.command}`);
  }
  lines.push("");
  lines.push("Rewrite these commands for the current OS, then retry. (For human-only checks, use a `manual` proof instead.)");
  return lines.join("\n");
}

async function checkCommandsForOs(roots: TaskNode[], cwd: string): Promise<{ content: { type: "text"; text: string }[] } | null> {
  const commands = extractExecutableCommands(roots);
  const missing = await findMissingTools(commands, cwd);
  if (missing.length === 0) return null;
  return { content: [{ type: "text" as const, text: formatMissingTools(missing) }] };
}

// ── Baseline extraction from tree ───────────────────────────────────

function extractBaselineSteps(roots: TaskNode[]): { title: string; proofs: { category: ProofCategory; predicate: { type: string }; advisory?: boolean }[] }[] {
  return roots.map((root) => ({
    title: root.title,
    proofs: collectBaselineProofs(root),
  }));
}

function collectBaselineProofs(node: TaskNode): { category: ProofCategory; predicate: { type: string }; advisory?: boolean }[] {
  const results: { category: ProofCategory; predicate: { type: string }; advisory?: boolean }[] = [];
  if (node.children) {
    for (const child of node.children) {
      results.push(...collectBaselineProofs(child));
    }
  } else if (node.refinement === "concrete" && node.category) {
    results.push({
      category: node.category,
      predicate: { type: node.predicate?.type ?? "" },
      advisory: node.advisory,
    });
  }
  return results;
}

// ── dod_create ──────────────────────────────────────────────────────

server.tool(
  "dod_create",
  "Create a new DoD document with recursive TaskNode tree. Nodes can be draft (intent-only) or concrete (with proof commands). Proof commands run on the HOST OS — write them for that OS (e.g. on Windows use findstr/type/dir, not grep/cat/ls). Stores proof commands canonically in MCP storage — editing the rendered markdown cannot weaken verification.",
  {
    title: z.string().describe("Feature/plan title"),
    goal: z.string().describe("One-sentence goal"),
    type: z.enum(["bug", "general"]).describe("Work type — selects the company baseline (standards/dod-baselines.md)."),
    cwd: z.string().describe("Working directory for running proof commands (absolute path)"),
    markdown_path: z.string().describe("Where to write the DoD markdown file (absolute path)"),
    sections: SectionsSchema,
    roots: z.array(TaskNodeInputSchema).describe("Root-level task nodes forming the decomposition tree. Task groups have children. Draft leaves have intent. Concrete leaves have command+predicate+description+category."),
    skip_reasons: z.record(z.string()).optional().describe("Map from optional proof category to justification for omission."),
  },
  async ({ title, goal, type, cwd, markdown_path, sections, roots: rootInputs, skip_reasons }) => {
    const resolvedCwd = path.resolve(cwd);
    resetNodeIdCounter();

    const roots = buildTaskNodes(rootInputs);

    // OS validation: concrete leaves only
    const osError = await checkCommandsForOs(roots, resolvedCwd);
    if (osError) return osError;

    // Baseline enforcement: advisory-only at creation (categories filled during refinement)
    const baseline = validateBaseline(
      type,
      extractBaselineSteps(roots),
      skip_reasons as Record<string, string> | undefined,
    );
    // Advisory — warn but don't block. Categories get filled during dod_refine.
    // Only hard-mandatory categories that are TRULY absent (no draft placeholders either) block.

    const id = store.generateId();
    const date = new Date().toISOString().split("T")[0];

    // Compute fingerprint from concrete leaves
    const fingerprint = computeProofFingerprint(roots);

    const doc: DodDocument = {
      id, title, goal, date, type,
      cwd: resolvedCwd,
      markdown_path: path.resolve(markdown_path),
      created_at: new Date().toISOString(),
      skip_reasons: skip_reasons as Record<string, string> | undefined,
      sections,
      roots,
      proof_fingerprint: fingerprint || undefined,
      amendments: [],
    };

    await store.save(doc);
    await writeMarkdown(doc);

    const concreteCount = flattenConcreteLeaves(roots).length;
    const draftCount = countDraftNodes(roots);
    const rootCount = roots.length;

    const warningBlock = baseline.errors.length > 0 || baseline.warnings.length > 0
      ? ["",
         "⚠️ Baseline advisories:",
         ...baseline.errors.map((e) => `  • ${e} (will be enforced at dod_refine time)`),
         ...baseline.warnings.map((w) => `  • ${w}`),
        ]
      : [];

    return {
      content: [{
        type: "text" as const,
        text: [
          "DoD created.",
          "",
          `ID: ${id}`,
          `Path: ${markdown_path}`,
          `Roots: ${rootCount}`,
          `Concrete proofs: ${concreteCount}`,
          `Draft nodes: ${draftCount}`,
          fingerprint ? `Proof fingerprint: ${fingerprint}` : "",
          ...warningBlock,
          "",
          draftCount > 0
            ? `${draftCount} draft node(s) — refine incrementally per task group with dod_refine, not all at once at the end. Use dod_check(nodePath="0") to verify one subtree at a time.`
            : "All nodes are concrete — dod_check can verify the full DoD.",
          "",
          "NEXT: run `dod_check` to validate proof commands execute on this OS.",
        ].filter(Boolean).join("\n"),
      }],
    };
  },
);

// ── Manual verification confirmer ───────────────────────────────────

const ELICITATION_MAX_WAIT_MS = 0x7fffffff;
const isWindowsHost = process.platform === "win32";

function manualInstructions(node: TaskNode): string {
  const isReview = node.predicate?.type === "review";
  const lines = [node.description ?? node.title];
  if (node.command && node.command.trim() && node.command.trim() !== "manual" && !isReview) {
    lines.push("", `Steps / command: ${node.command}`);
  }
  if (isReview) {
    lines.push(
      "",
      "Run `/code-review` (fresh context) against the current diff vs the DoD requirements.",
      "Confirm PASS only if it reports no gaps affecting correctness or the stated requirements.",
    );
  } else {
    lines.push("", "Confirm PASS only after you have personally verified this works as described.");
  }
  return lines.join("\n");
}

function buildConfirmer(): Confirmer {
  return async (node: TaskNode): Promise<ManualAnswer> => {
    const isReview = node.predicate?.type === "review";
    const promptLabel = isReview ? "Code review required" : "Manual verification required";
    const instructions = manualInstructions(node);

    playJingle();

    if (isWindowsHost) {
      const dialog = await showVerifyDialog(
        `DoD manual verification — ${node.id}`,
        `${instructions}\n\nClick PASS only if it passed.`,
      );
      return {
        answer: dialog.result === "yes" ? "pass" : "fail",
        note: dialog.note,
        channel: "messagebox",
      };
    }

    const caps = server.server.getClientCapabilities();
    if (caps?.elicitation) {
      try {
        const result = await server.server.elicitInput(
          {
            message: `${promptLabel}:\n\n${instructions}`,
            requestedSchema: {
              type: "object",
              properties: {
                result: {
                  type: "string",
                  enum: ["pass", "fail"],
                  enumNames: ["✅ Verified — works as expected", "❌ Not verified — does not work"],
                  description: "Did the manual verification pass?",
                },
                note: {
                  type: "string",
                  maxLength: 500,
                  description: "Optional note about what you observed",
                },
              },
              required: ["result"],
            },
          },
          { timeout: ELICITATION_MAX_WAIT_MS },
        );

        if (result.action === "accept") {
          const passed = result.content?.result === "pass";
          const note = typeof result.content?.note === "string" ? result.content.note : undefined;
          return { answer: passed ? "pass" : "fail", note, channel: "elicitation" };
        }
        return { answer: "fail", note: `elicitation ${result.action}`, channel: "elicitation" };
      } catch (err: unknown) {
        // Elicitation failed — fall through to fail-safe
        const msg = err instanceof Error ? err.message : String(err);
        console.error("dod-guard: elicitation request failed", { err: msg });
      }
    }

    return { answer: "fail", note: "no verification channel available on this host", channel: "messagebox" };
  };
}

// ── dod_check ───────────────────────────────────────────────────────

server.tool(
  "dod_check",
  "Verify a DoD's concrete proofs from canonical storage, mark pass/fail, update the markdown, and return a verdict. Draft nodes are reported but skipped. Overall 'incomplete' while any drafts exist. Pass `nodePath` to verify only a subtree (fast iteration); scoped runs return INCOMPLETE and never PASS. Manual/review proofs are NEVER auto-prompted — call dod_verify on that proof_id when verification is relevant.",
  {
    dod_id: z.string().optional().describe("DoD ID (from dod_create or dod_list)"),
    path: z.string().optional().describe("Markdown file path — resolves to DoD by path if no ID given"),
    cwd_override: z.string().optional().describe("Override working directory for this check run"),
    nodePath: z.string().optional().describe("Dot-separated path to a subtree (e.g. '0.children.1') to verify in isolation. Omit to run the full check."),
  },
  async ({ dod_id, path: mdPath, cwd_override, nodePath }) => {
    let doc: DodDocument | null = null;
    if (dod_id) doc = await store.load(dod_id);
    else if (mdPath) doc = await store.findByPath(mdPath);

    if (!doc) {
      return {
        content: [{
          type: "text" as const,
          text: `ERROR: DoD not found. ${dod_id ? `ID "${dod_id}" not in store.` : `No DoD registered for path "${mdPath}".`}\nUse dod_list to see tracked DoDs, or dod_import to register an existing file.`,
        }],
      };
    }

    if (nodePath && !findNodeByPath(doc.roots, nodePath)) {
      return {
        content: [{
          type: "text" as const,
          text: `ERROR: nodePath "${nodePath}" not found in this DoD. Use dod_check without nodePath to see the tree structure.`,
        }],
      };
    }

    const result = await checkDocument(doc, cwd_override, nodePath ? { nodePath } : undefined);

    if (!doc.proof_fingerprint && result.proof_fingerprint) {
      doc.proof_fingerprint = result.proof_fingerprint;
    }

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

// ── dod_refine ──────────────────────────────────────────────────────

server.tool(
  "dod_refine",
  "Refine a draft TaskNode. Two modes: 'concretize' — supply a proof command/predicate/description (draft leaf → concrete proof). 'subdivide' — split into child subtasks (draft leaf → task group with draft children). Only works on draft leaves (no children, refinement=draft).",
  {
    dod_id: z.string().describe("DoD ID"),
    node_path: z.string().describe("Dot-separated path to the draft leaf, e.g. '0.children.1'"),
    mode: z.enum(["concretize", "subdivide"]).default("concretize").describe("'concretize' (default): supply proof command/predicate. 'subdivide': split into child draft nodes."),
    // concretize mode params
    command: z.string().optional().describe("(concretize) The shell command to run for verification"),
    predicate: PredicateSchema.optional().describe("(concretize) What to evaluate about the command's output"),
    description: z.string().optional().describe("(concretize) Human-readable description of what this proof checks"),
    category: ProofCategorySchema.optional().describe("(concretize) Baseline category"),
    advisory: z.boolean().optional(),
    // subdivide mode params
    children: z.array(z.object({
      title: z.string(),
      intent: z.string(),
    })).optional().describe("(subdivide) Child draft nodes — each becomes a draft leaf under the new task group"),
  },
  async ({ dod_id, node_path: nodePath, mode, command, predicate, description, category, advisory, children }) => {
    const doc = await store.load(dod_id);
    if (!doc) return { content: [{ type: "text" as const, text: "ERROR: DoD not found." }] };

    const node = findNodeByPath(doc.roots, nodePath);
    if (!node) return { content: [{ type: "text" as const, text: `ERROR: node not found at path "${nodePath}".` }] };
    if (node.refinement !== "draft") return { content: [{ type: "text" as const, text: `ERROR: node "${node.title}" is already concrete. Use dod_amend to modify.` }] };
    if (node.children && node.children.length > 0) return { content: [{ type: "text" as const, text: `ERROR: node "${node.title}" is a task group with children — not a leaf. Refine its children instead.` }] };

    const oldIntent = node.intent;

    if (mode === "concretize") {
      if (!command || !predicate) {
        return { content: [{ type: "text" as const, text: "ERROR: concretize mode requires command and predicate." }] };
      }

      const pred = predicate as Predicate;
      if (isExecutablePredicate(pred.type) && command.trim() !== "") {
        const missing = await findMissingTools([command], doc.cwd);
        if (missing.length > 0) {
          return { content: [{ type: "text" as const, text: formatMissingTools(missing) }] };
        }
      }

      node.refinement = "concrete";
      node.command = command;
      node.predicate = pred;
      node.description = description ?? "";
      if (category) node.category = category as ProofCategory;
      if (advisory !== undefined) node.advisory = advisory;
      else if (pred.type === "regression") node.advisory = true;
      // Coverage metrics default to higher-is-better
      if (pred.type === "regression" && node.category === "coverage" && pred.lower_is_better === undefined) {
        (node.predicate as Predicate).lower_is_better = false;
      }
      node.intent = undefined;
      node.last_status = "pending";

      doc.amendments.push({
        timestamp: new Date().toISOString(),
        node_path: nodePath,
        action: "refined",
        old_value: { refinement: "draft", intent: oldIntent },
        new_value: { refinement: "concrete", command, predicate: { ...pred }, description: description ?? "" },
        reason: `Refined draft → concrete: ${description ?? ""}`,
      });

    } else {
      // subdivide mode
      if (!children || children.length === 0) {
        return { content: [{ type: "text" as const, text: "ERROR: subdivide mode requires at least one child in children array." }] };
      }

      const childNodes: TaskNode[] = children.map(c => {
        const childId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 4)}`;
        return {
          id: childId,
          title: c.title,
          refinement: "draft" as const,
          intent: c.intent,
          last_status: "draft" as const,
        };
      });

      // Convert draft leaf → task group with children
      node.children = childNodes;
      node.refinement = "concrete"; // Task groups are always concrete
      node.intent = undefined;
      // Clear leaf-only fields that shouldn't exist on a task group
      delete (node as Partial<TaskNode>).command;
      delete (node as Partial<TaskNode>).predicate;
      delete (node as Partial<TaskNode>).description;
      delete (node as Partial<TaskNode>).category;

      doc.amendments.push({
        timestamp: new Date().toISOString(),
        node_path: nodePath,
        action: "refined",
        old_value: { refinement: "draft", intent: oldIntent },
        new_value: { refinement: "concrete", children: childNodes },
        reason: `Subdivided into ${children.length} child draft nodes`,
      });

    }

    doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;

    const draftCount = countDraftNodes(doc.roots);

    await store.save(doc);
    await writeMarkdown(doc);

    const msg = mode === "concretize"
      ? [
          `Node refined: "${node.title}" is now concrete.`,
          `Command: \`${command}\``,
          `Predicate: ${(predicate as Predicate).type}:${(predicate as Predicate).value ?? "(no value)"}`,
          `Description: ${description}`,
          draftCount === 0
            ? "\n🎉 All nodes are now concrete — the DoD is fully verifiable. Run dod_check."
            : `\n${draftCount} draft node(s) remaining.`,
        ].join("\n")
      : [
          `Node subdivided: "${node.title}" is now a task group with ${children!.length} child draft(s).`,
          `Children: ${children!.map(c => `"${c.title}"`).join(", ")}`,
          `\n${draftCount} draft node(s) total. Refine each draft leaf before running dod_check.`,
        ].join("\n");

    return { content: [{ type: "text" as const, text: msg }] };
  },
);

// ── dod_add_node ────────────────────────────────────────────────────

server.tool(
  "dod_add_node",
  "Add a new TaskNode (draft or concrete) as a child of an existing task group, or at root level.",
  {
    dod_id: z.string().describe("DoD ID"),
    parent_path: z.string().describe("Dot-separated path to parent task group, or empty string to add at root level"),
    title: z.string(),
    refinement: z.enum(["draft", "concrete"]).default("draft"),
    intent: z.string().optional(),
    command: z.string().optional(),
    predicate: PredicateSchema.optional(),
    description: z.string().optional(),
    category: ProofCategorySchema.optional(),
    advisory: z.boolean().optional(),
  },
  async ({ dod_id, parent_path, title, refinement, intent, command, predicate, description, category, advisory }) => {
    const doc = await store.load(dod_id);
    if (!doc) return { content: [{ type: "text" as const, text: "ERROR: DoD not found." }] };

    let parent: TaskNode | null = null;
    if (parent_path) {
      parent = findNodeByPath(doc.roots, parent_path);
      if (!parent) return { content: [{ type: "text" as const, text: `ERROR: parent node not found at path "${parent_path}".` }] };
      if (!parent.children) return { content: [{ type: "text" as const, text: `ERROR: parent "${parent.title}" is a leaf — cannot add children. Add to a task group.` }] };
    }

    // Validate concrete node
    if (refinement === "concrete") {
      if (!command || !predicate || !description) {
        return { content: [{ type: "text" as const, text: "ERROR: concrete nodes require command, predicate, and description." }] };
      }
      const pred = predicate as Predicate;
      if (isExecutablePredicate(pred.type) && command.trim() !== "") {
        const missing = await findMissingTools([command], doc.cwd);
        if (missing.length > 0) {
          return { content: [{ type: "text" as const, text: formatMissingTools(missing) }] };
        }
      }
    }

    if (refinement === "draft" && !intent) {
      return { content: [{ type: "text" as const, text: "ERROR: draft nodes require an intent describing what this will prove." }] };
    }

    const node: TaskNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      refinement,
      last_status: refinement === "draft" ? "draft" : "pending",
    };

    if (refinement === "draft") node.intent = intent;
    if (refinement === "concrete") {
      node.command = command;
      node.predicate = predicate as Predicate;
      node.description = description;
      node.category = category as ProofCategory | undefined;
      if (advisory !== undefined) node.advisory = advisory;
      else if (predicate?.type === "regression") node.advisory = true;
      // Coverage metrics default to higher-is-better
      if (predicate?.type === "regression" && node.category === "coverage" && predicate.lower_is_better === undefined) {
        (node.predicate as Predicate).lower_is_better = false;
      }
    }

    if (parent) {
      parent.children!.push(node);
    } else {
      doc.roots.push(node);
    }

    const fullPath = parent_path ? `${parent_path}.children.${parent!.children!.length - 1}` : `${doc.roots.length - 1}`;

    doc.amendments.push({
      timestamp: new Date().toISOString(),
      node_path: fullPath,
      action: "added",
      new_value: { title, refinement },
      reason: `Added ${refinement} node: ${title}`,
    });

    doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;

    await store.save(doc);
    await writeMarkdown(doc);

    return {
      content: [{
        type: "text" as const,
        text: `Node "${title}" (${refinement}) added at path "${fullPath}".\nRun dod_check to verify${refinement === "draft" ? " after refining with dod_refine" : ""}.`,
      }],
    };
  },
);

// ── dod_remove_node ─────────────────────────────────────────────────

server.tool(
  "dod_remove_node",
  "Remove a TaskNode and all its descendants from the DoD tree.",
  {
    dod_id: z.string().describe("DoD ID"),
    node_path: z.string().describe("Dot-separated path to the node to remove"),
  },
  async ({ dod_id, node_path: nodePath }) => {
    const doc = await store.load(dod_id);
    if (!doc) return { content: [{ type: "text" as const, text: "ERROR: DoD not found." }] };

    // Find parent and index
    const parts = nodePath.split(".");
    const lastPart = parts[parts.length - 1];
    if (lastPart === "children") return { content: [{ type: "text" as const, text: "ERROR: path must target a node, not 'children'." }] };

    const childIdx = parseInt(lastPart, 10);
    if (isNaN(childIdx)) return { content: [{ type: "text" as const, text: `ERROR: invalid path "${nodePath}".` }] };

    if (parts.length === 1) {
      // Root level
      if (childIdx < 0 || childIdx >= doc.roots.length) {
        return { content: [{ type: "text" as const, text: `ERROR: root index ${childIdx} out of range (0-${doc.roots.length - 1}).` }] };
      }
      const removed = doc.roots.splice(childIdx, 1)[0];
      doc.amendments.push({
        timestamp: new Date().toISOString(),
        node_path: nodePath,
        action: "removed",
        old_value: { title: removed.title, refinement: removed.refinement },
        reason: `Removed node: ${removed.title}`,
      });

      doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;
      await store.save(doc);
      await writeMarkdown(doc);

      return { content: [{ type: "text" as const, text: `Removed root node "${removed.title}" (${removed.refinement}) and all descendants.` }] };
    }

    // Nested: find the parent
    const parentPath = parts.slice(0, -1).join(".");
    const parent = findNodeByPath(doc.roots, parentPath);
    if (!parent || !parent.children) {
      return { content: [{ type: "text" as const, text: `ERROR: parent not found at "${parentPath}".` }] };
    }

    if (childIdx < 0 || childIdx >= parent.children.length) {
      return { content: [{ type: "text" as const, text: `ERROR: child index ${childIdx} out of range (0-${parent.children.length - 1}).` }] };
    }

    const removed = parent.children.splice(childIdx, 1)[0];

    doc.amendments.push({
      timestamp: new Date().toISOString(),
      node_path: nodePath,
      action: "removed",
      old_value: { title: removed.title, refinement: removed.refinement },
      reason: `Removed node: ${removed.title}`,
    });

    doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;

    await store.save(doc);
    await writeMarkdown(doc);

    return { content: [{ type: "text" as const, text: `Removed node "${removed.title}" (${removed.refinement}) and all descendants.` }] };
  },
);

// ── dod_verify ──────────────────────────────────────────────────────

function findNodeInTree(roots: TaskNode[], proofId: string): TaskNode | null {
  for (const root of roots) {
    if (root.id === proofId) return root;
    if (root.children) {
      const found = findInChildren(root.children, proofId);
      if (found) return found;
    }
  }
  return null;
}

function findInChildren(nodes: TaskNode[], proofId: string): TaskNode | null {
  for (const node of nodes) {
    if (node.id === proofId) return node;
    if (node.children) {
      const found = findInChildren(node.children, proofId);
      if (found) return found;
    }
  }
  return null;
}

server.tool(
  "dod_verify",
  "Request human out-of-band verification for ONE manual or review proof, via a popup dialog (MCP elicitation fallback on non-Windows hosts). Call this when verification is actually relevant right now.",
  {
    dod_id: z.string().optional().describe("DoD ID"),
    path: z.string().optional().describe("Markdown file path"),
    proof_id: z.string().describe("The proof id to verify (e.g. \"node-3\")."),
  },
  async ({ dod_id, path: mdPath, proof_id }) => {
    let doc: DodDocument | null = null;
    if (dod_id) doc = await store.load(dod_id);
    else if (mdPath) doc = await store.findByPath(mdPath);

    if (!doc) return { content: [{ type: "text" as const, text: "ERROR: DoD not found." }] };

    const node = findNodeInTree(doc.roots, proof_id);
    if (!node) return { content: [{ type: "text" as const, text: `ERROR: proof "${proof_id}" not found.` }] };
    if (node.predicate?.type !== "manual" && node.predicate?.type !== "review") {
      return { content: [{ type: "text" as const, text: `ERROR: proof "${proof_id}" is "${node.predicate?.type ?? "unknown"}" — only manual/review proofs are verified out-of-band.` }] };
    }
    if (node.refinement !== "concrete") {
      return { content: [{ type: "text" as const, text: `ERROR: proof "${proof_id}" is a draft — refine with dod_refine first.` }] };
    }

    const label = node.predicate.type === "review" ? "Code review" : "Manual verification";
    const resolution = await resolveManual(node, buildConfirmer(), label);

    node.last_status = resolution.status;
    node.last_output = resolution.output;
    node.last_checked = new Date().toISOString();

    await store.save(doc);
    await writeMarkdown(doc);

    return {
      content: [{
        type: "text" as const,
        text: [
          `## Manual verification: ${resolution.status.toUpperCase()}`,
          "",
          resolution.output,
          "",
          "Run dod_check to fold this into the overall verdict.",
        ].join("\n"),
      }],
    };
  },
);

// ── dod_status ──────────────────────────────────────────────────────

server.tool(
  "dod_status",
  "Get the last check result for a DoD without re-running proofs.",
  {
    dod_id: z.string().optional(),
    path: z.string().optional(),
  },
  async ({ dod_id, path: mdPath }) => {
    let doc: DodDocument | null = null;
    if (dod_id) doc = await store.load(dod_id);
    else if (mdPath) doc = await store.findByPath(mdPath);

    if (!doc) return { content: [{ type: "text" as const, text: "ERROR: DoD not found." }] };

    if (!doc.last_check) {
      return { content: [{ type: "text" as const, text: `DoD "${doc.title}" has never been checked. Run dod_check first.` }] };
    }

    const concreteLeaves = flattenConcreteLeaves(doc.roots);
    const draftCount = countDraftNodes(doc.roots);
    const passed = concreteLeaves.filter(l => l.node.last_status === "pass" || l.node.last_status === "skipped").length;

    return {
      content: [{
        type: "text" as const,
        text: [
          `DoD: ${doc.title}`,
          `ID: ${doc.id}`,
          `Last check: ${doc.last_check.timestamp}`,
          `Overall: ${doc.last_check.overall.toUpperCase()}`,
          `Concrete proofs: ${passed}/${concreteLeaves.length} pass${draftCount > 0 ? `, ${draftCount} draft node(s)` : ""}`,
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
  "Modify a concrete proof's command, predicate, or description with a mandatory audit trail. Use when requirements change and an original proof becomes unreasonable. Resets the proof to pending.",
  {
    dod_id: z.string().describe("DoD ID"),
    node_path: z.string().describe("Dot-separated path to the concrete leaf node"),
    new_command: z.string().optional(),
    new_predicate: PredicateSchema.optional(),
    new_description: z.string().optional(),
    reason: z.string().describe("Why this amendment is needed — logged permanently"),
  },
  async ({ dod_id, node_path: nodePath, new_command, new_predicate, new_description, reason }) => {
    const doc = await store.load(dod_id);
    if (!doc) return { content: [{ type: "text" as const, text: "ERROR: DoD not found." }] };

    const node = findNodeByPath(doc.roots, nodePath);
    if (!node) return { content: [{ type: "text" as const, text: `ERROR: node not found at path "${nodePath}".` }] };
    if (node.refinement !== "concrete") {
      return { content: [{ type: "text" as const, text: `ERROR: node is a draft. Use dod_refine to concretize it first.` }] };
    }

    // Block weakening: machine → out-of-band (manual or review)
    if (new_predicate && !isExecutablePredicate(new_predicate.type) && node.predicate && isExecutablePredicate(node.predicate.type)) {
      return { content: [{ type: "text" as const, text: "ERROR: Cannot convert a machine-checkable proof to manual or review — this would bypass verification." }] };
    }

    // Validate command against OS (skip out-of-band proofs: manual, review)
    const effectivePredicate = (new_predicate ?? node.predicate) as Predicate;
    const effectiveCommand = new_command ?? node.command ?? "";
    if (isExecutablePredicate(effectivePredicate.type) && effectiveCommand.trim() !== "") {
      const missing = await findMissingTools([effectiveCommand], doc.cwd);
      if (missing.length > 0) {
        return { content: [{ type: "text" as const, text: formatMissingTools(missing) }] };
      }
    }

    const oldSnapshot = {
      command: node.command,
      predicate: node.predicate ? { ...node.predicate } : undefined,
      description: node.description,
    };

    if (new_command !== undefined) node.command = new_command;
    if (new_predicate !== undefined) node.predicate = new_predicate as Predicate;
    if (new_description !== undefined) node.description = new_description;
    node.last_status = "pending";

    doc.amendments.push({
      timestamp: new Date().toISOString(),
      node_path: nodePath,
      action: "modified",
      old_value: oldSnapshot as Partial<TaskNode>,
      new_value: { command: node.command, predicate: node.predicate ? { ...node.predicate } : undefined, description: node.description },
      reason,
    });

    doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;

    await store.save(doc);
    await writeMarkdown(doc);

    return {
      content: [{
        type: "text" as const,
        text: [
          "Proof amended and logged.",
          "",
          `Node: ${node.title}`,
          `Old command: \`${oldSnapshot.command}\``,
          `New command: \`${node.command}\``,
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
      const rootCount = d.roots.length;
      const concreteCount = flattenConcreteLeaves(d.roots).length;
      const draftCount = countDraftNodes(d.roots);
      const draftTag = draftCount > 0 ? ` (${draftCount} draft)` : "";
      return [
        `• ${d.title}`,
        `  ID: ${d.id}`,
        `  Path: ${d.markdown_path}`,
        `  Status: ${status} | ${rootCount} roots, ${concreteCount} concrete proofs${draftTag}`,
        `  Last check: ${d.last_check?.timestamp ?? "never"}`,
      ].join("\n");
    });

    return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
  },
);

// ── dod_import ──────────────────────────────────────────────────────

server.tool(
  "dod_import",
  "Import an existing DoD markdown file into canonical MCP storage. Parses hierarchical tree structure, infers predicates, and stores them.",
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
      const resolvedCwd = path.resolve(cwd);

      const osError = await checkCommandsForOs(parsed.roots, resolvedCwd);
      if (osError) return osError;

      const id = store.generateId();
      const fingerprint = computeProofFingerprint(parsed.roots);

      const doc: DodDocument = {
        id,
        title: parsed.title,
        goal: parsed.goal,
        date: parsed.date || new Date().toISOString().split("T")[0],
        cwd: resolvedCwd,
        markdown_path: path.resolve(mdPath),
        created_at: new Date().toISOString(),
        sections: parsed.sections,
        roots: parsed.roots,
        proof_fingerprint: fingerprint || undefined,
        amendments: [],
      };

      await store.save(doc);

      const concreteCount = flattenConcreteLeaves(parsed.roots).length;
      const draftCount = countDraftNodes(parsed.roots);

      return {
        content: [{
          type: "text" as const,
          text: [
            "DoD imported.",
            "",
            `ID: ${id}`,
            `Title: ${doc.title}`,
            `Roots: ${doc.roots.length}`,
            `Concrete proofs: ${concreteCount}`,
            `Draft nodes: ${draftCount}`,
            `Cwd: ${resolvedCwd}`,
            "",
            "Use dod_check to run verification.",
          ].join("\n"),
        }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("dod-guard: dod_import parse failed", { err: msg });
      return { content: [{ type: "text" as const, text: `ERROR parsing markdown: ${msg}` }] };
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
