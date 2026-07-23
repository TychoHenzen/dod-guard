import {
  currentOs,
  expandGlobsInCommand,
  findMissingTools,
  hasGlobWildcards,
  type MissingTool,
} from "./command-check.js";
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
      node.advisory = input.advisory;
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

// ── ID-based path resolution ──────────────────────────────────────────

export function findNodeById(roots: TaskNode[], id: string): { node: TaskNode; path: string } | null {
  function search(nodes: TaskNode[], parentPath: string): { node: TaskNode; path: string } | null {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
      if (node.id === id) return { node, path: currentPath };
      if (node.children) {
        const found = search(node.children, currentPath);
        if (found) return found;
      }
    }
    return null;
  }
  return search(roots, "");
}

export function countAllNodes(nodes: TaskNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count++;
    if (node.children) count += countAllNodes(node.children);
  }
  return count;
}

// ── Tree display ──────────────────────────────────────────────────────

export function formatTree(
  roots: TaskNode[],
  opts?: { title?: string; id?: string; scopeId?: string; scopePath?: string },
): string {
  const lines: string[] = [];

  let displayRoots = roots;
  let scopeLabel = "";
  if (opts?.scopeId) {
    const found = findNodeById(roots, opts.scopeId);
    if (!found) return `ERROR: node not found by id "${opts.scopeId}".`;
    displayRoots = found.node.children ? found.node.children : [found.node];
    scopeLabel = ` (scoped to ${found.node.title} [${found.node.id}] @ ${found.path})`;
  } else if (opts?.scopePath) {
    const node = findNodeByPath(roots, opts.scopePath);
    if (!node) return `ERROR: node not found at path "${opts.scopePath}".`;
    displayRoots = node.children ? node.children : [node];
    scopeLabel = ` (scoped to ${node.title} @ ${opts.scopePath})`;
  }

  const totalNodes = countAllNodes(roots);
  const draftCount = countAllDrafts(roots);
  const concreteCount = countAllConcrete(roots);

  if (opts?.title) lines.push(`${opts.title}${opts.id ? ` (${opts.id})` : ""}`);
  lines.push(`${totalNodes} nodes: ${concreteCount} concrete, ${draftCount} draft${scopeLabel}`);
  lines.push("");

  function render(nodes: TaskNode[], parentPath: string, depth: number): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
      const indent = "  ".repeat(depth);

      if (node.children && node.children.length > 0) {
        const hasDrafts = hasDraftNodes(node.children);
        const allPass = allGroupLeavesPass(node.children);
        let groupMark = "";
        if (allPass && !hasDrafts && node.children.length > 0) groupMark = " ✓";
        else if (hasDrafts) groupMark = " ~";
        lines.push(`${indent}${currentPath} [${node.id}] GROUP: "${node.title}"${groupMark}`);
        render(node.children, currentPath, depth + 1);
      } else if (node.refinement === "concrete") {
        const status = node.last_status ?? "pending";
        const cat = node.category ? ` | ${node.category}` : "";
        const adv = node.advisory ? " [advisory]" : "";
        lines.push(`${indent}${currentPath} [${node.id}] PROOF: "${node.title}" (${status}${cat}${adv})`);
      } else {
        const intent = node.intent ? ` — ${node.intent.slice(0, 80)}${node.intent.length > 80 ? "..." : ""}` : "";
        lines.push(`${indent}${currentPath} [${node.id}] DRAFT: "${node.title}"${intent}`);
      }
    }
  }

  render(displayRoots, opts?.scopeId || opts?.scopePath ? "" : "", 0);

  return lines.join("\n");
}

function countAllDrafts(nodes: TaskNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      count += countAllDrafts(node.children);
    } else if (node.refinement === "draft") {
      count++;
    }
  }
  return count;
}

function countAllConcrete(nodes: TaskNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      count += countAllConcrete(node.children);
    } else if (node.refinement === "concrete") {
      count++;
    }
  }
  return count;
}

function allGroupLeavesPass(nodes: TaskNode[]): boolean {
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      if (!allGroupLeavesPass(node.children)) return false;
    } else if (node.refinement === "concrete") {
      if (node.last_status !== "pass" && node.last_status !== "skipped") return false;
    }
  }
  return true;
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

import { extractExecutableCommands, findNodeByPath, hasDraftNodes } from "./checker.js";

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

  if (lines.length === 0) return null;
  return lines.join("\n");
}
