import { promises as fs } from "node:fs";
import type { DodSections, Predicate, TaskNode } from "./types.js";

// ── Predicate metadata (round-trip via HTML comments) ────────────────────

/** Extract explicit predicate metadata from an HTML comment in the proof line. */
function extractPredicateMetadata(line: string): { predicate: Predicate | null; cleanLine: string } {
  const metaMatch = line.match(/<!--p:(.+?)-->/);
  if (metaMatch) {
    try {
      const predicate = JSON.parse(metaMatch[1]) as Predicate;
      const cleanLine = line.replace(/<!--p:.+?-->/, "").trimEnd();
      return { predicate, cleanLine };
    } catch {
      // Malformed JSON — treat as no metadata
    }
  }
  return { predicate: null, cleanLine: line };
}

// ── Line parsing ──────────────────────────────────────────────────────────

function markerToStatus(marker: string): TaskNode["last_status"] {
  if (marker === "x") return "pass";
  if (marker === "~") return "skipped";
  return "pending";
}

function parseLeafLine(line: string): TaskNode | null {
  const trimmed = line.trim();

  // Draft leaf
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

  // Extract optional explicit predicate metadata from author.ts output.
  // Without this HTML comment, proof lines are parsed as draft leaves.
  const { predicate: metaPredicate, cleanLine } = extractPredicateMetadata(trimmed);

  // Any proof format with a backticked command (generic pattern handles
  // "Proof:", "Proof (TDD ...):", "Proof (brevity ...):", etc.)
  const proofMatch = cleanLine.match(/^-\s*\[([ x~>])\]\s*Proof(?:\s*\([^)]+\))?:\s*`([^`]+)`\s*→\s*(.+)$/);
  if (proofMatch) {
    const desc = proofMatch[3].trim();
    if (metaPredicate) {
      return {
        id: "",
        title: desc,
        refinement: "concrete",
        command: proofMatch[2].trim(),
        predicate: metaPredicate,
        description: desc,
        last_status: markerToStatus(proofMatch[1]),
      };
    }
    // No explicit metadata → import as draft
    return {
      id: "",
      title: desc,
      refinement: "draft",
      intent: desc,
      last_status: "draft",
    };
  }

  // Manual proof (no backtick command, just "Manual — description")
  const manualMatch = cleanLine.match(/^-\s*\[([ x~>])\]\s*Proof:\s*[Mm]anual[\s—-]+(.+)$/);
  if (manualMatch) {
    const desc = manualMatch[2].trim();
    if (metaPredicate) {
      return {
        id: "",
        title: desc,
        refinement: "concrete",
        command: "manual",
        predicate: metaPredicate,
        description: desc,
        last_status: markerToStatus(manualMatch[1]),
      };
    }
    // No explicit metadata → import as draft
    return {
      id: "",
      title: desc,
      refinement: "draft",
      intent: desc,
      last_status: "draft",
    };
  }

  return null;
}

// ── Section parsing ───────────────────────────────────────────────────────

interface ParsedDod {
  title: string;
  goal: string;
  date: string;
  cwd: string;
  sections: DodSections;
  roots: TaskNode[];
}

const SECTION_MAP: Record<string, keyof DodSections> = {
  requirements: "requirements",
  "research notes": "research_notes",
  "open questions": "open_questions",
  "open risks": "open_risks",
  decisions: "decisions",
  "current state": "current_state",
};

function parseSections(lines: string[]): DodSections {
  const sections: DodSections = { requirements: "" };
  let currentSection = "";
  let buf: string[] = [];

  function flush(): void {
    if (!currentSection) return;
    sections[currentSection as keyof DodSections] = buf.join("\n").trim();
    currentSection = "";
    buf = [];
  }

  for (const line of lines) {
    const h2Match = line.match(/^## (.+?)(?:\s*\(.*\))?$/);
    if (h2Match) {
      flush();
      const heading = h2Match[1].trim().toLowerCase();
      for (const [key, val] of Object.entries(SECTION_MAP)) {
        if (heading.startsWith(key)) {
          currentSection = val;
          break;
        }
      }
      continue;
    }
    if (line.match(/^---$/) && currentSection) {
      flush();
      continue;
    }
    if (currentSection) buf.push(line);
  }
  flush();
  return sections;
}

// ── DoD tree parsing ──────────────────────────────────────────────────────

function parseDodTree(lines: string[], startIdx: number): TaskNode[] {
  const roots: TaskNode[] = [];
  const stack: { node: TaskNode; depth: number }[] = [];
  let nodeCounter = 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^## /)) break; // Next heading ends DoD section
    if (!line.trim()) continue;

    const leadingSpaces = line.length - line.trimStart().length;

    // `### Title` → root
    const rootMatch = line.match(/^### (.+?)(?:\s*\[([ x~])\])?\s*$/);
    if (rootMatch) {
      const node: TaskNode = {
        id: `node-${nodeCounter++}`,
        title: rootMatch[1].trim(),
        refinement: "draft",
        children: [],
        last_status: "draft",
      };
      roots.push(node);
      stack.length = 0;
      stack.push({ node, depth: -1 });
      continue;
    }

    // `  **Title** [x]` → task group
    const groupMatch = line.match(/^\s*\*\*(.+?)\*\*\s*\[([ x~])\]\s*$/);
    if (groupMatch) {
      const depth = Math.floor(leadingSpaces / 2);
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
      const parent = stack.length > 0 ? stack[stack.length - 1].node : null;
      const node: TaskNode = {
        id: `node-${nodeCounter++}`,
        title: groupMatch[1].trim(),
        refinement: "draft",
        children: [],
        last_status: "draft",
      };
      if (parent?.children) parent.children.push(node);
      stack.push({ node, depth });
      continue;
    }

    // Leaf
    const leaf = parseLeafLine(line);
    if (leaf) {
      leaf.id = `node-${nodeCounter++}`;
      const depth = Math.floor(leadingSpaces / 2);
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
      const parent = stack.length > 0 ? stack[stack.length - 1].node : null;
      if (parent?.children) parent.children.push(leaf);
      else if (!parent) roots.push(leaf);
    }
  }

  // Remove empty children arrays
  function cleanup(node: TaskNode): void {
    if (node.children?.length === 0) delete node.children;
    if (node.children) for (const c of node.children) cleanup(c);
  }
  for (const r of roots) cleanup(r);

  return roots;
}

// ── Main parser ───────────────────────────────────────────────────────────

function parseContent(content: string): ParsedDod {
  if (process.env.DOD_DEBUG) console.debug("parser: parseContent", { length: content.length });
  const lines = content.split("\n");

  let title = "",
    goal = "",
    date = "",
    cwd = ".";

  for (const line of lines) {
    if (!title && line.startsWith("# ")) {
      title = line
        .replace(/^#\s+/, "")
        .replace(/\s*—.*$/, "")
        .trim();
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

  const sections = parseSections(lines);

  // Find ## Definition of Done start
  let dodStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^## Definition of Done/)) {
      dodStart = i + 1;
      break;
    }
  }

  const roots = dodStart >= 0 ? parseDodTree(lines, dodStart) : [];

  return { title, goal, date, cwd, sections, roots };
}

/** Parse a DoD markdown file from disk. */
export async function parseMarkdown(filePath: string): Promise<ParsedDod> {
  const content = await fs.readFile(filePath, "utf-8");
  return parseContent(content);
}

/** Parse DoD markdown from an in-memory string (fast path for tests). */
export function parseMarkdownFromString(content: string): ParsedDod {
  return parseContent(content);
}
