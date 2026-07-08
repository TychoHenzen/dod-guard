import { promises as fs } from "node:fs";
import type { DodSections, TaskNode, Predicate } from "./types.js";

function inferPredicate(description: string): Predicate {
  const lower = description.toLowerCase();

  if (lower.includes("tdd") || lower.includes("must fail first") || lower.includes("red before green")) {
    const exitMatch = lower.match(/exit\s*(?:code\s*)?(\d+)/);
    return { type: "tdd", value: exitMatch ? parseInt(exitMatch[1], 10) : 0 };
  }

  if (lower.includes("no match")) {
    return { type: "exit_code", value: 1 };
  }

  if (lower.includes("not contain") || lower.includes("must not contain") || lower.includes("no warning") || lower.includes("no error")) {
    const quoted = description.match(/"([^"]+)"/);
    if (quoted) return { type: "output_not_contains", value: quoted[1] };
  }

  if (lower.includes("not match") || lower.includes("must not match")) {
    const quoted = description.match(/"([^"]+)"/);
    if (quoted) return { type: "output_not_matches", value: quoted[1] };
  }

  if (lower.includes("matches") || lower.includes("must match")) {
    const quoted = description.match(/"([^"]+)"/);
    if (quoted) return { type: "output_matches", value: quoted[1] };
  }

  if (lower.includes("contains") || lower.includes("must contain")) {
    const quoted = description.match(/"([^"]+)"/);
    if (quoted) return { type: "output_contains", value: quoted[1] };
  }

  if (lower.includes("must not exit") || lower.includes("exit code must not be") || lower.includes("non-zero exit")) {
    const exitMatch = lower.match(/exit\s*(?:\S+\s+)?(\d+)/);
    return { type: "exit_code_not", value: exitMatch ? parseInt(exitMatch[1], 10) : 0 };
  }

  const exitMatch = lower.match(/exit\s*(?:code\s*)?(\d+)/);
  if (exitMatch) {
    return { type: "exit_code", value: parseInt(exitMatch[1], 10) };
  }

  if (lower.startsWith("manual") || lower === "manual") {
    return { type: "manual" };
  }

  if (lower.startsWith("review") || lower.includes("review —") || lower.includes("review:")) {
    return { type: "review" };
  }

  if (lower.includes("mutation") || lower.includes("mutants")) {
    return { type: "mutation", value: 0 };
  }

  if (lower.includes("regression") || lower.includes("baseline")) {
    return { type: "regression", value: 0 };
  }

  if (lower.includes("assertion count") || lower.includes("at least") || lower.includes("non-trivial")) {
    const countMatch = lower.match(/at least (\d+)/);
    return { type: "assertions", value: countMatch ? parseInt(countMatch[1], 10) : 1 };
  }

  if (lower.includes("streamline") || lower.includes("leftover") || lower.includes("old code")) {
    return { type: "streamline", value: 0 };
  }

  if (lower.includes("observability") || lower.includes("log statements") || lower.includes("logging")) {
    return { type: "observability", value: 0 };
  }

  if (lower.includes("brevity") || lower.includes("code quality") || lower.includes("static analysis")) {
    return { type: "brevity", value: 0 };
  }

  return { type: "exit_code", value: 0 };
}

/**
 * Parse a leaf line. Returns null if not a leaf line.
 * Handles draft, concrete (command + manual), and TDD variants.
 */
function parseLeafLine(line: string): TaskNode | null {
  const trimmed = line.trim();

  // Draft leaf: "- [~] **Draft**: intent" or "- [ ] **Draft**: intent"
  const draftMatch = trimmed.match(/^-\s*\[[ ~]\s*\]\s*\*\*Draft\*\*:\s*(.+)$/i);
  if (draftMatch) {
    return {
      id: "",
      title: draftMatch[1].trim(),
      refinement: "draft",
      intent: draftMatch[1].trim(),
      last_status: "draft",
    };
  }

  // Concrete TDD proof: "- [x] Proof (TDD STATE): `cmd` → desc"
  const tddMatch = trimmed.match(/^-\s*\[([ x~>])\]\s*Proof\s*\(TDD\s+[^)]+\):\s*`([^`]+)`\s*→\s*(.+)$/);
  if (tddMatch) {
    const command = tddMatch[2].trim();
    const description = tddMatch[3].trim();
    return {
      id: "",
      title: description,
      refinement: "concrete",
      command,
      predicate: { type: "tdd", value: 0 },
      description,
      last_status: tddMatch[1] === "x" ? "pass" : tddMatch[1] === "~" ? "skipped" : "pending",
    };
  }

  // Concrete command proof: "- [x] Proof: `cmd` → desc"
  const cmdMatch = trimmed.match(/^-\s*\[([ x~>])\]\s*Proof:\s*`([^`]+)`\s*→\s*(.+)$/);
  if (cmdMatch) {
    const command = cmdMatch[2].trim();
    const description = cmdMatch[3].trim();
    return {
      id: "",
      title: description,
      refinement: "concrete",
      command,
      predicate: inferPredicate(description),
      description,
      last_status: cmdMatch[1] === "x" ? "pass" : cmdMatch[1] === "~" ? "skipped" : "pending",
    };
  }

  // Manual proof: "- [x] Proof: Manual — desc"
  const manualMatch = trimmed.match(/^-\s*\[([ x~>])\]\s*Proof:\s*[Mm]anual[\s—-]+(.+)$/);
  if (manualMatch) {
    return {
      id: "",
      title: manualMatch[2].trim(),
      refinement: "concrete",
      command: "manual",
      predicate: { type: "manual" },
      description: manualMatch[2].trim(),
      last_status: manualMatch[1] === "x" ? "pass" : manualMatch[1] === "~" ? "skipped" : "pending",
    };
  }

  return null;
}

interface ParsedDod {
  title: string;
  goal: string;
  date: string;
  cwd: string;
  sections: DodSections;
  roots: TaskNode[];
}

/**
 * Parse a DoD markdown file into structured data.
 * Handles the hierarchical tree format produced by renderMarkdown().
 */
export async function parseMarkdown(filePath: string): Promise<ParsedDod> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");

  let title = "";
  let goal = "";
  let date = "";
  let cwd = ".";

  for (const line of lines) {
    if (!title && line.startsWith("# ")) {
      title = line.replace(/^#\s+/, "").replace(/\s*—.*$/, "").trim();
    }
    const goalMatch = line.match(/^\*\*Goal:\*\*\s*(.+)/);
    if (goalMatch) goal = goalMatch[1].trim();

    const dateMatch = line.match(/^\*\*Date:\*\*\s*(.+)/);
    if (dateMatch) date = dateMatch[1].trim();

    const targetMatch = line.match(/^\*\*Target:\*\*\s*`?([^`]+)`?/);
    if (targetMatch) cwd = targetMatch[1].trim();

    const cwdMatch = line.match(/All commands run from `([^`]+)`/);
    if (cwdMatch) cwd = cwdMatch[1].trim();
  }

  // Parse sections (same as before)
  const sections: DodSections = { requirements: "" };
  let currentSection = "";
  let sectionBuf: string[] = [];

  function flushSection(): void {
    if (!currentSection) return;
    const text = sectionBuf.join("\n").trim();
    switch (currentSection) {
      case "requirements": sections.requirements = text; break;
      case "research_notes": sections.research_notes = text; break;
      case "open_questions": sections.open_questions = text; break;
      case "open_risks": sections.open_risks = text; break;
      case "decisions": sections.decisions = text; break;
      case "current_state": sections.current_state = text; break;
    }
    currentSection = "";
    sectionBuf = [];
  }

  const sectionMap: Record<string, string> = {
    "requirements": "requirements",
    "research notes": "research_notes",
    "open questions": "open_questions",
    "open risks": "open_risks",
    "decisions": "decisions",
    "current state": "current_state",
  };

  for (const line of lines) {
    const h2Match = line.match(/^## (.+?)(?:\s*\(.*\))?$/);
    if (h2Match) {
      flushSection();
      const heading = h2Match[1].trim().toLowerCase();
      for (const [key, val] of Object.entries(sectionMap)) {
        if (heading.startsWith(key)) { currentSection = val; break; }
      }
      continue;
    }
    if (line.match(/^---$/) && currentSection) { flushSection(); continue; }
    if (currentSection) sectionBuf.push(line);
  }
  flushSection();

  // Parse hierarchical DoD tree
  const roots: TaskNode[] = [];
  let inDod = false;
  let nodeCounter = 0;

  // Stack: [{node, depth}] where depth is computed from leading spaces
  const stack: { node: TaskNode; depth: number }[] = [];

  for (const line of lines) {
    if (line.match(/^## Definition of Done/)) {
      inDod = true; continue;
    }
    if (!inDod) continue;

    // H2 after DoD ends it
    if (line.match(/^## /)) break;

    // Skip empty lines
    if (!line.trim()) continue;

    const leadingSpaces = line.length - line.trimStart().length;

    // `### Title [mark]` → depth 0 root node
    const rootMatch = line.match(/^### (.+?)(?:\s*\[([ x~])\])?\s*$/);
    if (rootMatch) {
      const node: TaskNode = {
        id: `node-${nodeCounter++}`,
        title: rootMatch[1].trim(),
        refinement: "draft", // May be updated to concrete when children parsed
        children: [],
        last_status: "draft",
      };
      roots.push(node);
      stack.length = 0;
      stack.push({ node, depth: -1 }); // Root has depth -1 (its children have depth 0+)
      continue;
    }

    // `  **Title** [mark]` → task group (non-leaf)
    const groupMatch = line.match(/^\s*\*\*(.+?)\*\*\s*\[([ x~])\]\s*$/);
    if (groupMatch) {
      const depth = Math.floor(leadingSpaces / 2);
      // Pop to find parent at depth-1
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      const parent = stack.length > 0 ? stack[stack.length - 1].node : null;
      const node: TaskNode = {
        id: `node-${nodeCounter++}`,
        title: groupMatch[1].trim(),
        refinement: "draft",
        children: [],
        last_status: "draft",
      };
      if (parent && parent.children) {
        parent.children.push(node);
      }
      stack.push({ node, depth });
      continue;
    }

    // Leaf lines: `  - [mark] ...` — parse with parseLeafLine
    const leaf = parseLeafLine(line);
    if (leaf) {
      leaf.id = `node-${nodeCounter++}`;
      const depth = Math.floor(leadingSpaces / 2);
      // Pop to find parent at depth-1
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      const parent = stack.length > 0 ? stack[stack.length - 1].node : null;
      if (parent && parent.children) {
        parent.children.push(leaf);
      } else if (!parent) {
        // Leaf at root level
        roots.push(leaf);
      }
    }
  }

  // Clean up: remove empty children arrays on nodes that were never populated
  function cleanupNode(node: TaskNode): void {
    if (node.children && node.children.length === 0) {
      delete node.children;
    }
    if (node.children) {
      for (const child of node.children) cleanupNode(child);
    }
  }
  for (const root of roots) cleanupNode(root);

  return { title, goal, date, cwd, sections, roots };
}
