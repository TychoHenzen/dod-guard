import { currentOs, detectMutatingFlags, expandGlobsInCommand, findMissingTools, hasGlobWildcards, type MissingTool } from "./command-check.js";
import type { Predicate, ProofCategory, TaskNode } from "./types.js";

// ── Node ID generation ────────────────────────────────────────────────

let nodeIdCounter = 0;
export function resetNodeIdCounter(): void {
  nodeIdCounter = 0;
}
export function nextNodeId(): string {
  return `node-${++nodeIdCounter}`;
}

// ── Tree construction ─────────────────────────────────────────────────

/** Convert TaskNodeInput trees into TaskNode objects with assigned IDs. */
export function buildTaskNodes(
  inputs: {
    title: string;
    refinement?: "draft" | "concrete";
    intent?: string;
    children?: any[];
    command?: string;
    predicate?: any;
    description?: string;
    category?: string;
    advisory?: boolean;
  }[],
): TaskNode[] {
  return inputs.map((input) => {
    const isGroup = !!(input.children && input.children.length > 0);
    const effectiveRefinement = isGroup ? "concrete" : (input.refinement ?? "draft");

    const node: TaskNode = {
      id: nextNodeId(),
      title: input.title,
      refinement: effectiveRefinement,
      last_status: effectiveRefinement === "draft" ? "draft" : "pending",
    };

    if (isGroup && input.children) {
      node.children = buildTaskNodes(input.children);
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
      if (
        input.predicate?.type === "regression" &&
        node.category === "coverage" &&
        input.predicate.lower_is_better === undefined
      ) {
        (node.predicate as Predicate).lower_is_better = false;
      }
    }

    return node;
  });
}

// ── Tree search ───────────────────────────────────────────────────────

export function findNodeInTree(roots: TaskNode[], proofId: string): TaskNode | null {
  for (const root of roots) {
    if (root.id === proofId) return root;
    if (root.children) {
      const found = findInChildren(root.children, proofId);
      if (found) return found;
    }
  }
  return null;
}

export function findInChildren(nodes: TaskNode[], proofId: string): TaskNode | null {
  for (const node of nodes) {
    if (node.id === proofId) return node;
    if (node.children) {
      const found = findInChildren(node.children, proofId);
      if (found) return found;
    }
  }
  return null;
}

// ── OS command validation ─────────────────────────────────────────────

export function formatMissingTools(missing: MissingTool[]): string {
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
  lines.push(
    "Rewrite these commands for the current OS, then retry. (For human-only checks, use a `manual` proof instead.)",
  );
  return lines.join("\n");
}

function suggestionFor(tool: string): string {
  const map: Record<string, string> = {
    grep: "findstr",
    cat: "type",
    sed: "(use PowerShell -replace or batch findstr with redirects)",
    awk: "(use PowerShell or batch for /f)",
    sh: "cmd /c",
    bash: "cmd /c",
    python3: "python",
    make: "(Windows: install GNU Make or use npm scripts)",
    cargo: "(install Rust via rustup.rs)",
  };
  return map[tool.toLowerCase()] ?? "";
}

import { extractExecutableCommands } from "./checker.js";

export async function checkCommandsForOs(roots: TaskNode[], cwd: string): Promise<string | null> {
  const commands = extractExecutableCommands(roots);
  const missing = await findMissingTools(commands, cwd);

  const lines: string[] = [];

  // Glob detection — cmd.exe does not expand wildcards in arguments
  const isWin = process.platform === "win32";
  if (isWin) {
    const globCmds = commands.filter(hasGlobWildcards);
    if (globCmds.length > 0) {
      lines.push(
        `WARNING: ${globCmds.length} proof command(s) contain glob wildcards (*, ?, [) — cmd.exe does NOT expand globs.`,
        "Use explicit paths or tools that handle their own globbing.",
        "",
      );
      for (const cmd of globCmds) {
        lines.push(`  • ${cmd}`);
        // Show expanded form if possible
        const { expanded, expanded_count } = expandGlobsInCommand(cmd, cwd);
        if (expanded_count > 0) {
          lines.push(`    → Auto-expanded: \`${expanded}\``);
          lines.push(`    → Copy the expanded form above and replace the glob in your proof command.`);
        }
      }
      lines.push("");
    }
  }

  if (missing.length > 0) {
    lines.push(formatMissingTools(missing));
  }

  // Mutating command detection (#22): warn about proof commands that dirty the working tree
  const mutatingCmds = commands.filter((cmd) => detectMutatingFlags(cmd).length > 0);
  if (mutatingCmds.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `WARNING: ${mutatingCmds.length} proof command(s) mutate the working tree — this causes false dirty-tree signals on subsequent proof runs.`,
      "Use check-only equivalents where possible:",
      "  • biome format / prettier --check (not --write)",
      "  • tsc --noEmit (check types without emitting .js)",
      "  • eslint (without --fix)",
      "  • npx stryker run → follow with git checkout -- <pkg>/dist/ to restore mutated files",
      "",
    );
    for (const cmd of mutatingCmds) {
      const flags = detectMutatingFlags(cmd);
      lines.push(`  • \`${cmd.slice(0, 80)}\``);
      for (const f of flags.slice(0, 2)) lines.push(`    → ${f}`);
    }
    lines.push("");
  }

  if (lines.length === 0) return null;
  return lines.join("\n");
}

// ── Baseline extraction ───────────────────────────────────────────────

export function extractBaselineSteps(
  roots: TaskNode[],
): { title: string; proofs: { category: ProofCategory; predicate: { type: string }; advisory?: boolean }[] }[] {
  return roots.map((root) => ({
    title: root.title,
    proofs: collectBaselineProofs(root),
  }));
}

function collectBaselineProofs(
  node: TaskNode,
): { category: ProofCategory; predicate: { type: string }; advisory?: boolean }[] {
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
