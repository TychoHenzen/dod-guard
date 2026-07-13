import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { formatCheckResult, updateDocFromCheckResult, writeMarkdown } from "./author.js";
import {
  checkDocument,
  computeProofFingerprint,
  countDraftNodes,
  findNodeByPath,
  flattenConcreteLeaves,
  isExecutablePredicate,
} from "./checker.js";
import { findMissingTools } from "./command-check.js";
import { type Confirmer, type ManualAnswer, resolveManual } from "./manual.js";
import { playJingle } from "./notify.js";
import { parseMarkdown } from "./parser.js";
import { PredicateSchema, ProofCategorySchema, SectionsSchema, TaskNodeInputSchema } from "./schemas.js";
import * as store from "./store.js";
import { handleDodAddNode } from "./tools/dod-add-node.js";
import { handleDodCreate } from "./tools/dod-create.js";
import { handleDodRefine } from "./tools/dod-refine.js";
import { checkCommandsForOs, findNodeInTree, formatMissingTools } from "./tree-utils.js";
import type { DodDocument, Predicate, TaskNode } from "./types.js";

const server = new McpServer({
  name: "dod-guard",
  version: "2.2.5",
});

// ── dod_create ──────────────────────────────────────────────────────

server.tool(
  "dod_create",
  "Create a new DoD document with recursive TaskNode tree. Nodes can be draft (intent-only) or concrete (with proof commands). Proof commands run on the HOST OS — write them for that OS (e.g. on Windows use findstr/type/dir, not grep/cat/ls). Stores proof commands canonically in MCP storage — editing the rendered markdown cannot weaken verification.",
  {
    title: z.string().describe("Feature/plan title"),
    goal: z.string().describe("One-sentence goal"),
    type: z
      .enum(["bug", "general", "minimal"])
      .describe(
        "Work type — selects the company baseline. 'minimal' enforces only lint+format+test; 'bug' adds tdd; 'general' enforces all categories (standards/dod-baselines.md).",
      ),
    cwd: z.string().describe("Working directory for running proof commands (absolute path)"),
    markdown_path: z.string().describe("Where to write the DoD markdown file (absolute path)"),
    sections: SectionsSchema,
    roots: z
      .array(TaskNodeInputSchema)
      .describe(
        "Root-level task nodes forming the decomposition tree. Task groups have children. Draft leaves have intent. Concrete leaves have command+predicate+description+category.",
      ),
    skip_reasons: z
      .record(z.string())
      .optional()
      .describe("Map from optional proof category to justification for omission."),
    dod_id: z
      .string()
      .optional()
      .describe("REJECTED: dod_create creates new DoDs. Use dod_amend to update an existing one."),
  },
  async (params) => {
    if (params.dod_id) {
      return {
        content: [
          {
            type: "text" as const,
            text: "ERROR: dod_create creates NEW DoDs. To update an existing DoD, use dod_amend for individual proofs or dod_check to verify. The dod_id parameter is not accepted here — it's only for dod_check, dod_amend, and other update tools.",
          },
        ],
      };
    }
    const result = await handleDodCreate(params as any);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// ── Manual verification confirmer ───────────────────────────────────

const ELICITATION_MAX_WAIT_MS = 0x7fffffff;

function manualInstructions(node: TaskNode): string {
  const isReview = node.predicate?.type === "review";
  const lines = [node.description ?? node.title];
  if (node.command?.trim() && node.command.trim() !== "manual" && !isReview) {
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

    // Fire-and-forget jingle — never block verification on audio.
    try {
      playJingle();
    } catch {
      /* audio best-effort */
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
                  enumNames: ["Verified works as expected", "Not verified does not work"],
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
        const msg = err instanceof Error ? err.message : String(err);
        console.error("dod-guard: elicitation request failed", { err: msg });
      }
    } else {
      console.error("dod-guard: MCP client does not support elicitation — manual verification unavailable");
    }

    return { answer: "fail", note: "no verification channel available on this host", channel: "elicitation" };
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
    nodePath: z
      .string()
      .optional()
      .describe(
        "Dot-separated path to a subtree (e.g. '0.children.1') to verify in isolation. Omit to run the full check.",
      ),
    summary: z
      .boolean()
      .optional()
      .describe(
        "Collapse unchanged draft nodes into a single count line. Use for large DoDs where drafts dominate the output.",
      ),
  },
  async ({ dod_id, path: mdPath, cwd_override, nodePath, summary }) => {
    let doc: DodDocument | null = null;
    if (dod_id) doc = await store.load(dod_id);
    else if (mdPath) doc = await store.findByPath(mdPath);

    if (!doc) {
      return {
        content: [
          {
            type: "text" as const,
            text: `ERROR: DoD not found. ${dod_id ? `ID "${dod_id}" not in store.` : `No DoD registered for path "${mdPath}".`}\nUse dod_list to see tracked DoDs, or dod_import to register an existing file.`,
          },
        ],
      };
    }

    if (nodePath && !findNodeByPath(doc.roots, nodePath)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `ERROR: nodePath "${nodePath}" not found in this DoD. Use dod_check without nodePath to see the tree structure.`,
          },
        ],
      };
    }

    const result = await checkDocument(doc, cwd_override, { nodePath, summary });

    if (!doc.proof_fingerprint && result.proof_fingerprint) {
      doc.proof_fingerprint = result.proof_fingerprint;
    }

    updateDocFromCheckResult(doc, result);
    await store.save(doc);
    await writeMarkdown(doc);

    return {
      content: [
        {
          type: "text" as const,
          text: formatCheckResult(result),
        },
      ],
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
    mode: z
      .enum(["concretize", "subdivide"])
      .default("concretize")
      .describe("'concretize' (default): supply proof command/predicate. 'subdivide': split into child draft nodes."),
    // concretize mode params
    command: z.string().optional().describe("(concretize) The shell command to run for verification"),
    predicate: PredicateSchema.optional().describe("(concretize) What to evaluate about the command's output"),
    description: z.string().optional().describe("(concretize) Human-readable description of what this proof checks"),
    category: ProofCategorySchema.optional().describe("(concretize) Baseline category"),
    advisory: z.boolean().optional(),
    // subdivide mode params
    children: z
      .array(
        z.object({
          title: z.string(),
          intent: z.string(),
        }),
      )
      .optional()
      .describe("(subdivide) Child draft nodes — each becomes a draft leaf under the new task group"),
  },
  async (params) => {
    const result = await handleDodRefine(params as any);
    return { content: [{ type: "text" as const, text: result }] };
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
  async (params) => {
    try {
      const result = await handleDodAddNode(params as any);
      return { content: [{ type: "text" as const, text: result.message }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }] };
    }
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
    if (lastPart === "children")
      return { content: [{ type: "text" as const, text: "ERROR: path must target a node, not 'children'." }] };

    const childIdx = Number.parseInt(lastPart, 10);
    if (Number.isNaN(childIdx))
      return { content: [{ type: "text" as const, text: `ERROR: invalid path "${nodePath}".` }] };

    if (parts.length === 1) {
      // Root level
      if (childIdx < 0 || childIdx >= doc.roots.length) {
        return {
          content: [
            { type: "text" as const, text: `ERROR: root index ${childIdx} out of range (0-${doc.roots.length - 1}).` },
          ],
        };
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

      return {
        content: [
          {
            type: "text" as const,
            text: `Removed root node "${removed.title}" (${removed.refinement}) and all descendants.`,
          },
        ],
      };
    }

    // Nested: find the parent
    const parentPath = parts.slice(0, -1).join(".");
    const parent = findNodeByPath(doc.roots, parentPath);
    if (!parent?.children) {
      return { content: [{ type: "text" as const, text: `ERROR: parent not found at "${parentPath}".` }] };
    }

    if (childIdx < 0 || childIdx >= parent.children.length) {
      return {
        content: [
          {
            type: "text" as const,
            text: `ERROR: child index ${childIdx} out of range (0-${parent.children.length - 1}).`,
          },
        ],
      };
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

    return {
      content: [
        { type: "text" as const, text: `Removed node "${removed.title}" (${removed.refinement}) and all descendants.` },
      ],
    };
  },
);

// ── dod_verify ──────────────────────────────────────────────────────

server.tool(
  "dod_verify",
  "Request human out-of-band verification for ONE manual or review proof, via a popup dialog (MCP elicitation fallback on non-Windows hosts). Call this when verification is actually relevant right now.",
  {
    dod_id: z.string().optional().describe("DoD ID"),
    path: z.string().optional().describe("Markdown file path"),
    proof_id: z.string().describe('The proof id to verify (e.g. "node-3").'),
  },
  async ({ dod_id, path: mdPath, proof_id }) => {
    let doc: DodDocument | null = null;
    if (dod_id) doc = await store.load(dod_id);
    else if (mdPath) doc = await store.findByPath(mdPath);

    if (!doc) return { content: [{ type: "text" as const, text: "ERROR: DoD not found." }] };

    const node = findNodeInTree(doc.roots, proof_id);
    if (!node) return { content: [{ type: "text" as const, text: `ERROR: proof "${proof_id}" not found.` }] };
    if (node.predicate?.type !== "manual" && node.predicate?.type !== "review") {
      return {
        content: [
          {
            type: "text" as const,
            text: `ERROR: proof "${proof_id}" is "${node.predicate?.type ?? "unknown"}" — only manual/review proofs are verified out-of-band.`,
          },
        ],
      };
    }
    if (node.refinement !== "concrete") {
      return {
        content: [
          { type: "text" as const, text: `ERROR: proof "${proof_id}" is a draft — refine with dod_refine first.` },
        ],
      };
    }

    const label = node.predicate.type === "review" ? "Code review" : "Manual verification";
    const resolution = await resolveManual(node, buildConfirmer(), label);

    node.last_status = resolution.status;
    node.last_output = resolution.output;
    node.last_checked = new Date().toISOString();

    await store.save(doc);
    await writeMarkdown(doc);

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `## Manual verification: ${resolution.status.toUpperCase()}`,
            "",
            resolution.output,
            "",
            "Run dod_check to fold this into the overall verdict.",
          ].join("\n"),
        },
      ],
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
      return {
        content: [{ type: "text" as const, text: `DoD "${doc.title}" has never been checked. Run dod_check first.` }],
      };
    }

    const concreteLeaves = flattenConcreteLeaves(doc.roots);
    const draftCount = countDraftNodes(doc.roots);
    const passed = concreteLeaves.filter(
      (l) => l.node.last_status === "pass" || l.node.last_status === "skipped",
    ).length;

    return {
      content: [
        {
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
        },
      ],
    };
  },
);

// ── dod_amend ───────────────────────────────────────────────────────

server.tool(
  "dod_amend",
  "Modify a concrete proof's command, predicate, or description with a mandatory audit trail. Use when requirements change and an original proof becomes unreasonable. Resets the proof to pending. Pass node_path='__meta__' to update DoD-level skip_reasons. Pass node_path='*' to bulk-amend all concrete leaves (e.g. 'change all exit_code predicates to explicit value: 0').",
  {
    dod_id: z.string().describe("DoD ID"),
    node_path: z
      .string()
      .describe(
        "Dot-separated path to the concrete leaf node, '*' for all concrete leaves (bulk amend), or '__meta__' for DoD-level metadata",
      ),
    new_command: z.string().optional(),
    new_predicate: PredicateSchema.optional(),
    new_description: z.string().optional(),
    new_skip_reasons: z.record(z.string()).optional().describe("(__meta__ only) Replace DoD skip_reasons map"),
    reason: z.string().describe("Why this amendment is needed — logged permanently"),
  },
  async ({ dod_id, node_path: nodePath, new_command, new_predicate, new_description, new_skip_reasons, reason }) => {
    const doc = await store.load(dod_id);
    if (!doc) return { content: [{ type: "text" as const, text: "ERROR: DoD not found." }] };

    // __meta__ path: update DoD-level metadata (skip_reasons)
    if (nodePath === "__meta__") {
      if (new_skip_reasons === undefined) {
        return {
          content: [
            { type: "text" as const, text: "ERROR: node_path='__meta__' requires new_skip_reasons parameter." },
          ],
        };
      }
      const oldSkip = doc.skip_reasons ? { ...doc.skip_reasons } : {};
      doc.skip_reasons = new_skip_reasons as Record<string, string>;
      doc.amendments.push({
        timestamp: new Date().toISOString(),
        node_path: "__meta__",
        action: "modified",
        old_value: oldSkip as any,
        new_value: doc.skip_reasons as any,
        reason,
      });
      await store.save(doc);
      await writeMarkdown(doc);
      return {
        content: [
          {
            type: "text" as const,
            text: `DoD metadata amended.\n\nSkip reasons updated. ${Object.keys(new_skip_reasons).length} categories.\nReason: ${reason}\n\nRun dod_check to re-verify.`,
          },
        ],
      };
    }

    // Wildcard: apply to all concrete leaves
    if (nodePath === "*") {
      const leaves = flattenConcreteLeaves(doc.roots);
      if (leaves.length === 0) {
        return {
          content: [{ type: "text" as const, text: "ERROR: no concrete leaves to amend. Refine drafts first." }],
        };
      }

      // Block weakening on any leaf
      if (new_predicate && !isExecutablePredicate(new_predicate.type)) {
        const machineLeaves = leaves.filter(({ node }) => node.predicate && isExecutablePredicate(node.predicate.type));
        if (machineLeaves.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `ERROR: Cannot convert ${machineLeaves.length} machine-checkable proof(s) to manual/review — this would bypass verification.`,
              },
            ],
          };
        }
      }

      // Validate commands against OS
      if (new_command !== undefined) {
        const missing = await findMissingTools([new_command], doc.cwd);
        if (missing.length > 0) {
          return { content: [{ type: "text" as const, text: formatMissingTools(missing) }] };
        }
      }

      let amendedCount = 0;
      for (const { node, node_path: leafPath } of leaves) {
        const oldSnap = {
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
          node_path: leafPath,
          action: "modified",
          old_value: oldSnap as Partial<TaskNode>,
          new_value: {
            command: node.command,
            predicate: node.predicate ? { ...node.predicate } : undefined,
            description: node.description,
          },
          reason,
        });
        amendedCount++;
      }

      doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;
      await store.save(doc);
      await writeMarkdown(doc);

      const changes: string[] = [];
      if (new_command !== undefined) changes.push(`command → \`${new_command}\``);
      if (new_predicate !== undefined) changes.push(`predicate → ${new_predicate.type}`);
      if (new_description !== undefined) changes.push("description updated");

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Bulk amend: ${amendedCount} concrete proof(s) updated.`,
              "",
              `Changes: ${changes.join(", ")}`,
              `Reason: ${reason}`,
              "",
              "All statuses reset to pending. Run dod_check to re-verify.",
            ].join("\n"),
          },
        ],
      };
    }

    const node = findNodeByPath(doc.roots, nodePath);
    if (!node) return { content: [{ type: "text" as const, text: `ERROR: node not found at path "${nodePath}".` }] };
    if (node.refinement !== "concrete") {
      return {
        content: [{ type: "text" as const, text: `ERROR: node is a draft. Use dod_refine to concretize it first.` }],
      };
    }

    // Block weakening: machine → out-of-band (manual or review)
    if (
      new_predicate &&
      !isExecutablePredicate(new_predicate.type) &&
      node.predicate &&
      isExecutablePredicate(node.predicate.type)
    ) {
      return {
        content: [
          {
            type: "text" as const,
            text: "ERROR: Cannot convert a machine-checkable proof to manual or review — this would bypass verification.",
          },
        ],
      };
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
      new_value: {
        command: node.command,
        predicate: node.predicate ? { ...node.predicate } : undefined,
        description: node.description,
      },
      reason,
    });

    doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;

    await store.save(doc);
    await writeMarkdown(doc);

    return {
      content: [
        {
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
        },
      ],
    };
  },
);

// ── dod_list ────────────────────────────────────────────────────────

server.tool("dod_list", "List all tracked DoD documents with their last check status.", {}, async () => {
  const docs = await store.listAll();
  if (docs.length === 0) {
    return {
      content: [{ type: "text" as const, text: "No DoD documents tracked. Use dod_create or dod_import to add one." }],
    };
  }

  const lines = docs.map((d) => {
    const status = d.last_check?.overall?.toUpperCase() ?? "UNCHECKED";

    // Handle legacy format (steps array instead of roots)
    if (!(d.roots && Array.isArray(d.roots))) {
      const legacyCount = (d as any).steps?.length ?? 0;
      return [
        `• ${d.title}`,
        `  ID: ${d.id}`,
        `  Path: ${d.markdown_path}`,
        `  Status: LEGACY — ${legacyCount} step(s) in old format. Run dod_store_migrate to upgrade.`,
      ].join("\n");
    }

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
});

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
        content: [
          {
            type: "text" as const,
            text: `Already tracked as "${existing.title}" (ID: ${existing.id}). Use dod_check to verify.`,
          },
        ],
      };
    }

    try {
      const parsed = await parseMarkdown(mdPath);
      const resolvedCwd = path.resolve(cwd);

      const osError = await checkCommandsForOs(parsed.roots, resolvedCwd);
      if (osError) return { content: [{ type: "text" as const, text: osError }] };

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
        content: [
          {
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
          },
        ],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("dod-guard: dod_import parse failed", { err: msg });
      return { content: [{ type: "text" as const, text: `ERROR parsing markdown: ${msg}` }] };
    }
  },
);

// ── dod_store_migrate ───────────────────────────────────────────────

server.tool(
  "dod_store_migrate",
  "Migrate legacy DoD documents from the old 'steps' format to the current 'roots' TaskNode tree format. Idempotent — already-migrated docs are skipped. Run this once to upgrade all legacy docs.",
  {
    dod_id: z.string().optional().describe("Migrate a single DoD by ID. Omit to migrate ALL legacy docs."),
    dry_run: z.boolean().optional().default(false).describe("Preview what would change without writing to disk."),
  },
  async ({ dod_id, dry_run }) => {
    if (dod_id) {
      const doc = await store.loadRaw(dod_id);
      if (!doc) {
        return { content: [{ type: "text" as const, text: `ERROR: DoD "${dod_id}" not found.` }] };
      }
      if (doc.roots && Array.isArray(doc.roots) && doc.roots.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `"${(doc as any).title}" is already in the current format — no migration needed.`,
            },
          ],
        };
      }
      const legacySteps = (doc as any).steps;
      if (!(legacySteps && Array.isArray(legacySteps))) {
        return {
          content: [{ type: "text" as const, text: `"${(doc as any).title}" has no steps or roots — cannot migrate.` }],
        };
      }

      if (dry_run) {
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `DRY RUN — would migrate: "${(doc as any).title}"`,
                `  ${legacySteps.length} step(s) → task groups`,
                `  ${legacySteps.reduce((sum: number, s: any) => sum + (s.proofs?.length ?? 0), 0)} proof(s) → concrete leaves`,
              ].join("\n"),
            },
          ],
        };
      }

      const migrated = await store.migrateDoc(doc as any);
      if (migrated) {
        await store.save(doc as any);
        return {
          content: [
            {
              type: "text" as const,
              text: `Migrated: "${(doc as any).title}" → ${(doc.roots ?? []).length} root task group(s). Run dod_check to verify.`,
            },
          ],
        };
      }
      return { content: [{ type: "text" as const, text: "No changes made." }] };
    }

    // Bulk migration: all legacy docs
    const allDocs = await store.listAllRaw();
    const legacyDocs = allDocs.filter(
      (d: any) =>
        (d as any).steps && (!((d as any).roots && Array.isArray((d as any).roots)) || (d as any).roots.length === 0),
    );

    if (legacyDocs.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No legacy documents found — all docs are in the current format." }],
      };
    }

    if (dry_run) {
      let totalSteps = 0;
      let totalProofs = 0;
      for (const d of legacyDocs) {
        totalSteps += (d as any).steps?.length ?? 0;
        totalProofs += (d as any).steps?.reduce((sum: number, s: any) => sum + (s.proofs?.length ?? 0), 0) ?? 0;
      }
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `DRY RUN — would migrate ${legacyDocs.length} document(s):`,
              `  ${totalSteps} step(s) → task groups`,
              `  ${totalProofs} proof(s) → concrete leaves`,
              "",
              "Run without dry_run to apply.",
            ].join("\n"),
          },
        ],
      };
    }

    let migrated = 0;
    let skipped = 0;
    for (const d of legacyDocs) {
      const changed = await store.migrateDoc(d as any);
      if (changed) migrated++;
      else skipped++;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Migration complete: ${migrated} migrated, ${skipped} skipped.`,
            "",
            "Run dod_list to see updated documents.",
          ].join("\n"),
        },
      ],
    };
  },
);

import { fileURLToPath } from "node:url";

const _filename = fileURLToPath(import.meta.url);

// ── Start (only when run directly, not when imported by tests) ─────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] === _filename) {
  main().catch((err) => {
    process.stderr.write(`dod-guard MCP server failed: ${err}\n`);
    process.exit(1);
  });
}
