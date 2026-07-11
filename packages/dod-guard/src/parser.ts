import { promises as fs } from "node:fs";
import type { DodSections, TaskNode, Predicate } from "./types.js";

// ── Predicate inference ───────────────────────────────────────────────────

/** Extract the first quoted string ("...") from a text blurb. Returns null if none. */
function extractQuoted(text: string): string | null {
  const m = text.match(/"([^"]+)"/);
  return m ? m[1] : null;
}

/** Extract an exit code number from a description string. */
function extractExitCode(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern);
  return m ? parseInt(m[1], 10) : null;
}

const INFERENCE_RULES: Array<{ test: (s: string) => boolean; infer: (s: string, t: string) => Predicate }> = [
  {
    test: (l) => l.includes("tdd") || l.includes("must fail first") || l.includes("red before green"),
    infer: (l) => ({ type: "tdd", value: extractExitCode(l, /exit\s*(?:code\s*)?(\d+)/) ?? 0 }),
  },
  {
    test: (l) => l.includes("no match"),
    infer: () => ({ type: "exit_code", value: 1 }),
  },
  {
    test: (l) => ["not contain", "must not contain", "no warning", "no error"].some((k) => l.includes(k)),
    infer: (_, t) => {
      const q = extractQuoted(t);
      return q ? { type: "output_not_contains", value: q } : { type: "exit_code", value: 0 };
    },
  },
  {
    test: (l) => l.includes("not match") || l.includes("must not match"),
    infer: (_, t) => {
      const q = extractQuoted(t);
      return q ? { type: "output_not_matches", value: q } : { type: "exit_code", value: 0 };
    },
  },
  {
    test: (l) => l.includes("matches") || l.includes("must match"),
    infer: (_, t) => {
      const q = extractQuoted(t);
      return q ? { type: "output_matches", value: q } : { type: "exit_code", value: 0 };
    },
  },
  {
    test: (l) => l.includes("contains") || l.includes("must contain"),
    infer: (_, t) => {
      const q = extractQuoted(t);
      return q ? { type: "output_contains", value: q } : { type: "exit_code", value: 0 };
    },
  },
  {
    test: (l) => ["must not exit", "exit code must not be", "non-zero exit"].some((k) => l.includes(k)),
    infer: (l) => ({ type: "exit_code_not", value: extractExitCode(l, /exit\s*(?:\S+\s+)?(\d+)/) ?? 0 }),
  },
];

const CATEGORY_PATTERNS: Array<[string[], Predicate["type"]]> = [
  [["mutation", "mutants"], "mutation"],
  [["regression", "baseline"], "regression"],
  [["assertion count", "at least", "non-trivial"], "assertions"],
  [["streamline", "leftover", "old code"], "streamline"],
  [["observability", "log statements", "logging"], "observability"],
  [["brevity", "code quality", "static analysis"], "brevity"],
];

function inferPredicate(description: string): Predicate {
  const lower = description.toLowerCase();

  for (const rule of INFERENCE_RULES) {
    if (rule.test(lower)) return rule.infer(lower, description);
  }

  // exit_code with explicit number
  const exitMatch = lower.match(/exit\s*(?:code\s*)?(\d+)/);
  if (exitMatch) return { type: "exit_code", value: parseInt(exitMatch[1], 10) };

  // manual/review
  if (lower.startsWith("manual")) return { type: "manual" };
  if (lower.startsWith("review") || lower.includes("review —") || lower.includes("review:")) return { type: "review" };

  // keyword categories
  for (const [keywords, type] of CATEGORY_PATTERNS) {
    if (keywords.some((k) => lower.includes(k))) {
      const countMatch = type === "assertions" ? lower.match(/at least (\d+)/) : null;
      const value = countMatch ? parseInt(countMatch[1], 10) : 0;
      return { type, value };
    }
  }

  return { type: "exit_code", value: 0 };
}

// ── Line parsing ──────────────────────────────────────────────────────────

function parseLeafLine(line: string): TaskNode | null {
  const trimmed = line.trim();

  // Draft leaf
  const draftMatch = trimmed.match(/^-\s*\[[ ~]\s*\]\s*\*\*Draft\*\*:\s*(.+)$/i);
  if (draftMatch) {
    return {
      id: "", title: draftMatch[1].trim(), refinement: "draft",
      intent: draftMatch[1].trim(), last_status: "draft",
    };
  }

  // TDD proof
  const tddMatch = trimmed.match(/^-\s*\[([ x~>])\]\s*Proof\s*\(TDD\s+[^)]+\):\s*`([^`]+)`\s*→\s*(.+)$/);
  if (tddMatch) {
    return {
      id: "", title: tddMatch[3].trim(), refinement: "concrete",
      command: tddMatch[2].trim(), predicate: { type: "tdd", value: 0 },
      description: tddMatch[3].trim(),
      last_status: tddMatch[1] === "x" ? "pass" : tddMatch[1] === "~" ? "skipped" : "pending",
    };
  }

  // Concrete command proof
  const cmdMatch = trimmed.match(/^-\s*\[([ x~>])\]\s*Proof:\s*`([^`]+)`\s*→\s*(.+)$/);
  if (cmdMatch) {
    return {
      id: "", title: cmdMatch[3].trim(), refinement: "concrete",
      command: cmdMatch[2].trim(), predicate: inferPredicate(cmdMatch[3]),
      description: cmdMatch[3].trim(),
      last_status: cmdMatch[1] === "x" ? "pass" : cmdMatch[1] === "~" ? "skipped" : "pending",
    };
  }

  // Manual proof
  const manualMatch = trimmed.match(/^-\s*\[([ x~>])\]\s*Proof:\s*[Mm]anual[\s—-]+(.+)$/);
  if (manualMatch) {
    return {
      id: "", title: manualMatch[2].trim(), refinement: "concrete",
      command: "manual", predicate: { type: "manual" },
      description: manualMatch[2].trim(),
      last_status: manualMatch[1] === "x" ? "pass" : manualMatch[1] === "~" ? "skipped" : "pending",
    };
  }

  return null;
}

// ── Section parsing ───────────────────────────────────────────────────────

interface ParsedDod {
  title: string; goal: string; date: string; cwd: string;
  sections: DodSections; roots: TaskNode[];
}

const SECTION_MAP: Record<string, keyof DodSections> = {
  "requirements": "requirements", "research notes": "research_notes",
  "open questions": "open_questions", "open risks": "open_risks",
  "decisions": "decisions", "current state": "current_state",
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
        if (heading.startsWith(key)) { currentSection = val; break; }
      }
      continue;
    }
    if (line.match(/^---$/) && currentSection) { flush(); continue; }
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
        id: `node-${nodeCounter++}`, title: rootMatch[1].trim(),
        refinement: "draft", children: [], last_status: "draft",
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
        id: `node-${nodeCounter++}`, title: groupMatch[1].trim(),
        refinement: "draft", children: [], last_status: "draft",
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
  console.debug("parser: parseContent", { length: content.length });
  const lines = content.split("\n");

  let title = "", goal = "", date = "", cwd = ".";

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

  const sections = parseSections(lines);

  // Find ## Definition of Done start
  let dodStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^## Definition of Done/)) { dodStart = i + 1; break; }
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
