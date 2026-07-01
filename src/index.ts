import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "node:path";
import * as store from "./store.js";
import { checkDocument, computeProofFingerprint } from "./checker.js";
import { writeMarkdown, updateDocFromCheckResult, formatCheckResult } from "./author.js";
import { parseMarkdown } from "./parser.js";
import { playJingle, showVerifyDialog } from "./notify.js";
import { findMissingTools, suggestionFor, currentOs, type MissingTool } from "./command-check.js";
import { validateBaseline } from "./baseline.js";
import { resolveManual, type Confirmer, type ManualAnswer } from "./manual.js";
import type { DodDocument, Predicate, Proof, Step } from "./types.js";

const server = new McpServer({
  name: "dod-guard",
  version: "1.8.0",
});

// ── Shared schemas ──────────────────────────────────────────────────

const PredicateSchema = z.object({
  type: z.enum(["exit_code", "exit_code_not", "output_contains", "output_matches", "output_not_contains", "output_not_matches", "tdd", "manual", "review", "mutation", "regression"]),
  value: z.union([z.number(), z.string()]).optional(),
  extract: z.string().optional().describe("regression only: regex whose capture group 1 is the metric number; omit to use the last number in stdout."),
  lower_is_better: z.boolean().optional().describe("regression only: true (default) => smaller is better (perf/complexity/duplication); false => larger is better (coverage)."),
});

const ProofCategorySchema = z.enum([
  "lint", "format", "tdd", "structure", "test", "mutation",
  "integration_wiring", "integration_behavioral",
  "performance", "complexity", "coverage", "duplication",
  "manual", "other",
]);

const ProofInputSchema = z.object({
  command: z.string(),
  predicate: PredicateSchema,
  description: z.string(),
  category: ProofCategorySchema.describe("Company-baseline category. Mandatory categories (integration_wiring, integration_behavioral, test) are enforced at creation — see standards/dod-baselines.md."),
  advisory: z.boolean().optional().describe("Advisory tier: a failing advisory proof warns but does not block. regression proofs default to advisory."),
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

// ── OS command validation ───────────────────────────────────────────
//
// Proof commands execute on THIS machine. Reject any DoD whose commands invoke
// tools missing on the current OS so the model writes OS-correct commands
// up-front, instead of locking bash on Windows and amending it later.

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

/** Returns an error tool-result if any command is unrunnable here, else null. */
async function checkCommandsForOs(
  steps: Array<{ proofs: Array<{ command: string; predicate: Predicate }> }>,
  cwd: string,
): Promise<{ content: { type: "text"; text: string }[] } | null> {
  const commands = steps
    .flatMap((s) => s.proofs)
    .filter((p) => p.predicate.type !== "manual" && p.command.trim() !== "")
    .map((p) => p.command);
  const missing = await findMissingTools(commands, cwd);
  if (missing.length === 0) return null;
  return { content: [{ type: "text" as const, text: formatMissingTools(missing) }] };
}

// ── dod_create ──────────────────────────────────────────────────────

server.tool(
  "dod_create",
  "Create a new locked DoD document. Stores proof commands canonically in MCP storage — editing the rendered markdown cannot weaken verification. Returns the DoD ID for use with dod_check. Proof commands run on the HOST OS — write them for that OS (e.g. on Windows use findstr/type/dir, not grep/cat/ls). Creation is rejected if any command invokes a tool absent on the current OS.",
  {
    title: z.string().describe("Feature/plan title"),
    goal: z.string().describe("One-sentence goal"),
    type: z.enum(["bug", "general"]).describe("Work type — selects the company baseline (standards/dod-baselines.md)."),
    cwd: z.string().describe("Working directory for running proof commands (absolute path)"),
    markdown_path: z.string().describe("Where to write the DoD markdown file (absolute path)"),
    sections: SectionsSchema,
    steps: z.array(StepInputSchema).describe("DoD steps with proof commands and predicates"),
  },
  async ({ title, goal, type, cwd, markdown_path, sections, steps }) => {
    const resolvedCwd = path.resolve(cwd);
    const osError = await checkCommandsForOs(
      steps.map((s) => ({ proofs: s.proofs.map((p) => ({ command: p.command, predicate: p.predicate as Predicate })) })),
      resolvedCwd,
    );
    if (osError) return osError;

    // Baseline enforcement: reject a DoD missing the mandatory proof categories
    // instead of trusting the author to follow the standard.
    const baseline = validateBaseline(type, steps.map((s) => ({
      title: s.title,
      proofs: s.proofs.map((p) => ({ category: p.category, predicate: { type: p.predicate.type }, advisory: p.advisory })),
    })));
    if (baseline.errors.length > 0) {
      return {
        content: [{
          type: "text" as const,
          text: [
            `ERROR: this ${type} DoD does not meet the company baseline (standards/dod-baselines.md).`,
            "",
            ...baseline.errors.map((e) => `  • ${e}`),
            "",
            "Add proofs for the missing categories, then retry. If a category genuinely cannot apply",
            "(e.g. no runnable entry point), say so to the user and document the exception.",
          ].join("\n"),
        }],
      };
    }

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
        category: p.category,
        // regression proofs default to advisory at authoring time (decision);
        // an explicit advisory value always wins, including advisory:false for a
        // hard SLA gate.
        ...(p.advisory !== undefined
          ? { advisory: p.advisory }
          : p.predicate.type === "regression"
            ? { advisory: true }
            : {}),
        last_status: "pending" as const,
      })),
    }));

    // Compute proof-set fingerprint and store it for tamper detection
    const fingerprint = computeProofFingerprint(dodSteps);

    const doc: DodDocument = {
      id,
      title,
      goal,
      date,
      type,
      cwd: resolvedCwd,
      markdown_path: path.resolve(markdown_path),
      created_at: new Date().toISOString(),
      locked: true,
      sections,
      steps: dodSteps,
      proof_fingerprint: fingerprint,
      amendments: [],
    };

    await store.save(doc);
    await writeMarkdown(doc);

    const proofCount = dodSteps.reduce((sum, s) => sum + s.proofs.length, 0);

    const warningBlock = baseline.warnings.length > 0
      ? ["", "⚠️ Baseline advisories (not blocking):", ...baseline.warnings.map((w) => `  • ${w}`)]
      : [];

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
          ...warningBlock,
          "",
          "Proof commands are stored canonically in MCP. Editing the markdown file cannot affect verification.",
          "Each dod_check prints the proof fingerprint — compare to detect store tampering.",
          "",
          "NEXT — baseline check: run `dod_check` now, before implementing. Expect overall FAIL with",
          "proofs RED (the feature does not exist yet). This validates every proof command executes on",
          "this OS — a 'command not found' here means the proof is mis-authored; fix it via dod_amend now",
          "rather than discovering it mid-implementation. TDD proofs SHOULD be red at baseline (that is the",
          "required red phase). Then implement and re-check.",
        ].join("\n"),
      }],
    };
  },
);

// ── Manual verification confirmer ───────────────────────────────────
//
// Anti-cheat core: the human's answer is obtained ONLY through a channel the
// model cannot drive — a server-spawned Windows dialog, or MCP elicitation (a
// client↔server message Claude never authors) as a fallback where the dialog
// cannot run. Neither dod_check nor dod_verify takes a parameter that could
// carry a "passed" verdict, so Claude cannot fake confirmation.
//
// This confirmer is invoked ONLY by dod_verify, on a single proof, when Claude
// explicitly requests it — never automatically by dod_check on every run.

// No timeout: the human may take a while to respond. Only used for the
// elicitation fallback, whose SDK requires a value (its own default is a mere
// 60s) — 0x7fffffff ms (~24.8 days, Node/V8's max setTimeout delay) stands in
// for "wait indefinitely" without overflowing. The popup channel has no timer
// at all; see notify.ts.
const ELICITATION_MAX_WAIT_MS = 0x7fffffff;
const isWindowsHost = process.platform === "win32";

function manualInstructions(proof: Proof): string {
  const isReview = proof.predicate.type === "review";
  const lines = [proof.description];
  if (proof.command && proof.command.trim() && proof.command.trim() !== "manual" && !isReview) {
    lines.push("", `Steps / command: ${proof.command}`);
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
  return async (proof: Proof): Promise<ManualAnswer> => {
    const isReview = proof.predicate.type === "review";
    const promptLabel = isReview ? "Code review required" : "Manual verification required";
    const instructions = manualInstructions(proof);

    // Draw attention with a distinctive jingle before prompting.
    playJingle();

    // Preferred channel: a server-spawned popup with PASS/FAIL buttons and a
    // free-text notes field. Windows-only.
    if (isWindowsHost) {
      const dialog = await showVerifyDialog(
        `DoD manual verification — ${proof.id}`,
        `${instructions}\n\nClick PASS only if it passed.`,
      );
      return {
        answer: dialog.result === "yes" ? "pass" : "fail",
        note: dialog.note,
        channel: "messagebox",
      };
    }

    // Fallback channel: MCP elicitation, when the popup cannot run (non-Windows
    // host) and the client advertises support.
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
        // decline / cancel → not verified.
        return { answer: "fail", note: `elicitation ${result.action}`, channel: "elicitation" };
      } catch {
        // Client claimed support but failed — fail safe below.
      }
    }

    // No usable channel on this host — fail safe. A missing human never passes.
    return { answer: "fail", note: "no verification channel available on this host", channel: "messagebox" };
  };
}

// ── dod_check ───────────────────────────────────────────────────────

server.tool(
  "dod_check",
  "Verify a DoD's proofs from canonical (locked) storage, mark pass/fail, update the markdown, and return a verdict. Commands run from MCP's locked copy — the markdown cannot influence results. Pass `step` to verify only that one step (fast iteration); a scoped run returns INCOMPLETE and never PASS. Run with NO `step` for the full verdict — use that as the /goal completion condition. Manual/review proofs are NEVER auto-prompted here — an unverified one reports 'skipped' and holds the overall verdict at INCOMPLETE; call dod_verify on that proof_id when verification is actually relevant (e.g. right after implementing its step).",
  {
    dod_id: z.string().optional().describe("DoD ID (from dod_create or dod_list)"),
    path: z.string().optional().describe("Markdown file path — resolves to DoD by path if no ID given"),
    cwd_override: z.string().optional().describe("Override working directory for this check run"),
    step: z.number().int().positive().optional().describe("1-based step number to verify in isolation. Omit to run the full check. Scoped runs carry other steps forward unrun and always return INCOMPLETE (only a full run can return PASS)."),
  },
  async ({ dod_id, path: mdPath, cwd_override, step }) => {
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

    let stepId: string | undefined;
    if (step !== undefined) {
      const target = doc.steps[step - 1];
      if (!target) {
        return {
          content: [{
            type: "text" as const,
            text: `ERROR: step ${step} is out of range — this DoD has ${doc.steps.length} step(s). Use a 1-based step number, or omit \`step\` to run the full check.`,
          }],
        };
      }
      stepId = target.id;
    }

    const result = await checkDocument(doc, cwd_override, { stepId });

    // Tamper detection (blocking): a fingerprint mismatch forces the verdict to
    // FAIL in checkDocument. Surface why, and how to legitimise a real change.
    let tamperWarning = "";
    if (result.tampered) {
      tamperWarning = `\n\n🛑 TAMPER DETECTED — verdict forced to FAIL.\n  Stored:  ${doc.proof_fingerprint}\n  Current: ${result.proof_fingerprint}\n  The proof set was changed outside dod_amend. Revert the edit, or make the change through dod_amend (which re-locks the fingerprint with a logged reason).\n`;
    } else if (!doc.proof_fingerprint) {
      // Backfill fingerprint for pre-existing DoDs that lack one
      doc.proof_fingerprint = result.proof_fingerprint;
    }

    updateDocFromCheckResult(doc, result);
    await store.save(doc);
    await writeMarkdown(doc);

    return {
      content: [{
        type: "text" as const,
        text: formatCheckResult(result) + tamperWarning,
      }],
    };
  },
);

// ── dod_verify ──────────────────────────────────────────────────────
//
// The ONLY path that triggers out-of-band human verification of a manual or
// review proof. dod_check never auto-prompts (see above) — Claude must call
// dod_verify explicitly, on the specific proof it judges is actually ready to
// be checked right now. This keeps the human from being nagged about proofs
// that aren't relevant yet, while preserving the anti-cheat guarantee: the
// verdict always comes from the popup/elicitation channel, never a parameter
// Claude supplies, and an unrequested manual/review proof simply holds the
// overall dod_check verdict at INCOMPLETE rather than silently passing.

function findProof(doc: DodDocument, proofId: string): { step: Step; proof: Proof } | null {
  for (const step of doc.steps) {
    const proof = step.proofs.find((p) => p.id === proofId);
    if (proof) return { step, proof };
  }
  return null;
}

server.tool(
  "dod_verify",
  "Request human out-of-band verification for ONE manual or review proof, via a popup dialog (MCP elicitation fallback on non-Windows hosts). Call this when verification is actually relevant right now — e.g. right after implementing the step the proof belongs to — NOT on every dod_check. dod_check itself never auto-prompts; an unverified manual/review proof reports as 'skipped' there and holds the overall verdict at INCOMPLETE until dod_verify records a verdict.",
  {
    dod_id: z.string().optional().describe("DoD ID (from dod_create or dod_list)"),
    path: z.string().optional().describe("Markdown file path — resolves to DoD by path if no ID given"),
    proof_id: z.string().describe("The proof id to verify (see dod_check output for ids, e.g. \"proof-1-1\")."),
  },
  async ({ dod_id, path: mdPath, proof_id }) => {
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

    const found = findProof(doc, proof_id);
    if (!found) {
      return {
        content: [{
          type: "text" as const,
          text: `ERROR: proof "${proof_id}" not found in DoD "${doc.id}". Run dod_check to see current proof ids.`,
        }],
      };
    }

    const { proof } = found;
    if (proof.predicate.type !== "manual" && proof.predicate.type !== "review") {
      return {
        content: [{
          type: "text" as const,
          text: `ERROR: proof "${proof_id}" is a "${proof.predicate.type}" predicate — only manual/review proofs are verified out-of-band via dod_verify. Machine-checkable proofs are verified by dod_check.`,
        }],
      };
    }

    const label = proof.predicate.type === "review" ? "Code review" : "Manual verification";
    const resolution = await resolveManual(proof, buildConfirmer(), label);

    proof.last_status = resolution.status;
    proof.last_output = resolution.output;
    proof.last_checked = new Date().toISOString();

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
          "Run dod_check (no `step`) to fold this into the overall verdict.",
        ].join("\n"),
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

    // Validate the amended command against the current OS before locking it in.
    const effectivePredicate = (new_predicate ?? proof.predicate) as Predicate;
    const effectiveCommand = new_command ?? proof.command;
    if (effectivePredicate.type !== "manual" && effectiveCommand.trim() !== "") {
      const missing = await findMissingTools([effectiveCommand], doc.cwd);
      if (missing.length > 0) {
        return { content: [{ type: "text" as const, text: formatMissingTools(missing) }] };
      }
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

    // Recompute stored fingerprint so dod_check doesn't flag the amendment as tampering
    doc.proof_fingerprint = computeProofFingerprint(doc.steps);

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
      const resolvedCwd = path.resolve(cwd);

      const osError = await checkCommandsForOs(parsed.steps, resolvedCwd);
      if (osError) return osError;

      const id = store.generateId();

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
