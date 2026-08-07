#!/usr/bin/env node
// Score a SKILL.md against post-4.6 migration guidelines.
// Exit codes: 0 all checks pass, 1 at least one fails, 3 usage error.
// With --json, writes structured output. With --before=<path>, loads a
// prior run and prints a before/after comparison.

import { readFileSync, writeFileSync } from "node:fs";

const USAGE = [
  "Usage: node migration-check.mjs <path-to-SKILL.md> [options]",
  "",
  "  --json             Output structured JSON",
  "  --save=<path>      Write results to file (for before/after comparison)",
  "  --before=<path>    Load a prior run and compare against it",
  "",
  "Exit codes: 0 pass, 1 at least one check fails, 3 usage error.",
].join("\n");

// --- Frontmatter parsing ---

function parseFrontmatterLine(fm, line, current) {
  const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line);
  if (kv) return { key: kv[1], val: kv[2].trim() };
  if (current && /^\s+/.test(line)) return { key: current, val: `${fm[current]} ${line.trim()}` };
  return null;
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const fm = {};
  let current = null;
  for (const line of match[1].split(/\r?\n/)) {
    const parsed = parseFrontmatterLine(fm, line, current);
    if (!parsed) continue;
    current = parsed.key;
    fm[parsed.key] = parsed.val;
  }
  return fm;
}

function bodyAfterFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  return match ? match[1] : text;
}

// --- Shared line iterator (skips code fences) ---

function proseLines(body) {
  const raw = body.split(/\r?\n/);
  const result = [];
  let inFence = false;
  for (let i = 0; i < raw.length; i++) {
    if (/^\s*```/.test(raw[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) result.push({ text: raw[i], line: i + 1 });
  }
  return result;
}

function scanPatterns(body, patterns) {
  const hits = [];
  for (const { text, line } of proseLines(body)) {
    for (const { pattern, name } of patterns) {
      if (pattern.test(text)) {
        hits.push({ name, line, text: text.trim().slice(0, 60) });
      }
    }
  }
  return hits;
}

// --- Fenced block scanner (for worked-example detection) ---

function fencedBlocks(body) {
  const raw = body.split(/\r?\n/);
  const blocks = [];
  let start = -1;
  let lang = "";
  for (let i = 0; i < raw.length; i++) {
    const fence = /^\s*```(\w*)/.exec(raw[i]);
    if (!fence) continue;
    if (start < 0) {
      start = i + 1;
      lang = fence[1];
    } else {
      blocks.push({ start, end: i, lang, lines: raw.slice(start, i) });
      start = -1;
    }
  }
  return blocks;
}

// --- Individual checks ---

function checkLineCount(body) {
  const lines = body.split(/\r?\n/).length;
  return {
    id: "line-count",
    label: "Body under 500 lines (target 300)",
    value: lines,
    pass: lines <= 500,
    warn: lines > 300,
    detail: lines <= 300 ? "within target" : lines <= 500 ? "over target, under limit" : "over limit",
  };
}

function checkNameFormat(fm) {
  const name = fm.name ?? "";
  const valid = /^[a-z0-9-]{1,64}$/.test(name);
  return {
    id: "name-format",
    label: "Name: lowercase, hyphens, 1-64 chars",
    value: name,
    pass: valid,
    detail: valid ? "valid" : `"${name}" violates format`,
  };
}

function descriptionDetail(len) {
  if (len === 0) return "empty";
  if (len > 1024) return `${len} chars, over 1024`;
  return `${len} chars`;
}

function checkDescriptionPresent(fm) {
  const desc = (fm.description ?? "").replace(/^>-?\s*/, "").trim();
  return {
    id: "description-present",
    label: "Description: non-empty, under 1024 chars",
    value: desc.length,
    pass: desc.length > 0 && desc.length <= 1024,
    detail: descriptionDetail(desc.length),
  };
}

function checkDescriptionPerson(fm) {
  const raw = fm.description ?? "";
  const desc = raw.replace(/^>-?\s*/, "").trim();
  const bad = /^(I |We |You |My |Our |Your )/i.test(desc);
  return {
    id: "description-person",
    label: "Description in third person",
    value: bad ? desc.slice(0, 40) : "ok",
    pass: !bad,
    detail: bad ? "starts with first/second person" : "third person",
  };
}

function isAtImport(line) {
  return /^\s*@[\w./-]+/.test(line) && !/```/.test(line) && !/^\s*#/.test(line);
}

function checkNoAtImports(body) {
  const hits = body.split(/\r?\n/).filter(isAtImport).map((l) => l.trim());
  return {
    id: "no-at-imports",
    label: "No @-imports in SKILL.md",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "none found" : `found: ${hits.slice(0, 3).join(", ")}`,
  };
}

// --- Scaffolding anti-patterns ---

const SCAFFOLDING_PATTERNS = [
  { pattern: /\bdouble[- ]check\b/i, name: "double-check" },
  { pattern: /\bre-?read\b.*\b(phase|section|step)\b/i, name: "re-read reminder" },
  { pattern: /\bverify (your|you|that you)\b/i, name: "verify-your" },
  { pattern: /\bconfirm (you|that you)\b/i, name: "confirm-you" },
  { pattern: /\breport (your |)progress\b/i, name: "report-progress" },
  { pattern: /\bstatus update\b/i, name: "status-update" },
  { pattern: /\bshow (your |)reasoning\b/i, name: "show-reasoning" },
  { pattern: /\bexplain (your |)thinking\b/i, name: "explain-thinking" },
  { pattern: /\becho (your |)(internal |)reasoning\b/i, name: "echo-reasoning" },
  { pattern: /\btranscribe.*(reasoning|thinking)\b/i, name: "transcribe-reasoning" },
  { pattern: /\btemperature\b/i, name: "temperature-ref" },
  { pattern: /\btop_[pk]\b/i, name: "top-p-k-ref" },
];

function checkScaffolding(body) {
  const hits = scanPatterns(body, SCAFFOLDING_PATTERNS);
  return {
    id: "no-scaffolding",
    label: "No verification/scaffolding anti-patterns",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "none found" : hits.map((h) => `L${h.line}: ${h.name}`).join("; "),
    hits,
  };
}

// --- Conservative filters ---

const CONSERVATIVE_PATTERNS = [
  { pattern: /\bbe conservative\b/i, name: "be-conservative" },
  { pattern: /\bonly (report|flag|mention)\s+(high|critical|severe)/i, name: "only-high-severity" },
  { pattern: /\bminimize (false positives|noise|output)\b/i, name: "minimize-output" },
  { pattern: /\berr on the side of\b/i, name: "err-on-side" },
];

function checkConservativeFilters(body) {
  const hits = scanPatterns(body, CONSERVATIVE_PATTERNS);
  return {
    id: "no-conservative-filters",
    label: "No conservative/filtering instructions",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "none found" : hits.map((h) => `L${h.line}: ${h.name}`).join("; "),
    hits,
  };
}

// --- Scope and structure checks ---

function checkExplicitScope(body) {
  const hasScope =
    /\bscope\b/i.test(body) || /\bone skill per\b/i.test(body) || /\bdo not (also |)trigger\b/i.test(body);
  return {
    id: "explicit-scope",
    label: "Explicit scope boundaries",
    value: hasScope ? "present" : "absent",
    pass: hasScope,
    detail: hasScope ? "scope markers found" : "no scope markers",
  };
}

function checkDelegationCap(body) {
  const agents = (body.match(/\bsubagent_type\b|\bdispatch\b|\bsubagent\b/gi) ?? []).length;
  const hasCap = /\bcap\b.*\bdelegat/i.test(body) || /\bmax(imum|)\s+\d+\s+(sub)?agent/i.test(body);
  return {
    id: "delegation-cap",
    label: "Subagent delegation capped (when dispatching)",
    value: agents,
    pass: agents === 0 || hasCap,
    detail: agents === 0 ? "no dispatches" : hasCap ? "cap found" : `${agents} dispatches, no cap`,
  };
}

function isScriptRef(blockLines) {
  return blockLines.some((l) => /\bnode\b.*\.mjs\b/.test(l) || /\$\{CLAUDE_PLUGIN_ROOT\}/.test(l));
}

const COMMAND_LANGS = new Set(["bash", "sh", "shell", "zsh", "cmd", "powershell"]);

function checkWorkedExamples(body) {
  const hits = [];
  for (const block of fencedBlocks(body)) {
    const len = block.end - block.start;
    if (len > 15 && !isScriptRef(block.lines) && !COMMAND_LANGS.has(block.lang.toLowerCase())) {
      hits.push({ line: block.start, length: len });
    }
  }
  return {
    id: "no-constraining-examples",
    label: "No long worked examples (>15 lines, non-script)",
    value: hits.length,
    pass: hits.length === 0,
    warn: hits.length > 0,
    detail: hits.length === 0 ? "none found" : hits.map((h) => `L${h.line}: ${h.length} lines`).join("; "),
  };
}

function isContradiction(pos, neg) {
  if (pos === neg) return true;
  return (pos.length > 8 && neg.includes(pos)) || (neg.length > 8 && pos.includes(neg));
}

function checkContradictions(body) {
  const must = [];
  const mustNot = [];
  for (const line of body.split(/\r?\n/)) {
    const m1 = /\b(must|always|shall)\s+(.{5,40})/i.exec(line);
    if (m1) must.push(m1[2].toLowerCase().trim());
    const m2 = /\b(must not|never|shall not|do not)\s+(.{5,40})/i.exec(line);
    if (m2) mustNot.push(m2[2].toLowerCase().trim());
  }
  const found = [];
  for (const pos of must) {
    for (const neg of mustNot) {
      if (isContradiction(pos, neg)) found.push(`"must ${pos}" vs "must not ${neg}"`);
    }
  }
  return {
    id: "no-contradictions",
    label: "No contradictory instructions",
    value: found.length,
    pass: found.length === 0,
    detail: found.length === 0 ? "none found" : found.slice(0, 3).join("; "),
  };
}

function checkConsistentTerminology(body) {
  const synonymSets = [
    ["subagent", "sub-agent", "sub agent"],
    ["frontmatter", "front-matter", "front matter"],
    ["SKILL.md", "skill.md", "Skill.md"],
  ];
  const mixed = [];
  for (const set of synonymSets) {
    const found = set.filter((term) => body.includes(term));
    if (found.length > 1) mixed.push(found.join(" / "));
  }
  return {
    id: "consistent-terminology",
    label: "Consistent terminology (no synonym mixing)",
    value: mixed.length,
    pass: mixed.length === 0,
    warn: mixed.length > 0,
    detail: mixed.length === 0 ? "consistent" : `mixed: ${mixed.join(", ")}`,
  };
}

// --- Bare negative rules ---

function hasAlternative(line, nextLine) {
  const alt = /\b(instead|use)\b/i;
  return alt.test(line) || alt.test(nextLine) || /^\s*[-*]\s/.test(nextLine);
}

function checkBareNegatives(body) {
  const hits = [];
  const lines = proseLines(body);
  for (let i = 0; i < lines.length; i++) {
    const neg = /\b(never|do not|don't|must not|shall not)\s+(.{5,60})/i.exec(lines[i].text);
    if (!neg) continue;
    const next = (lines[i + 1]?.text ?? "").trim();
    if (!hasAlternative(lines[i].text, next)) {
      hits.push({ line: lines[i].line, text: lines[i].text.trim().slice(0, 60) });
    }
  }
  return {
    id: "no-bare-negatives",
    label: "Negative rules have alternatives",
    value: hits.length,
    pass: hits.length === 0,
    warn: hits.length > 0,
    detail: hits.length === 0 ? "all negatives have alternatives" : hits.map((h) => `L${h.line}`).join(", "),
    hits,
  };
}

// --- Implicit scope ---

function checkImplicitScope(body) {
  const hits = [];
  for (const { text, line } of proseLines(body)) {
    const implicit =
      /\b(apply|format|process|check|run|update)\s+(this|the|that|it)\b/i.test(text) &&
      !/\b(every|all|each)\b/i.test(text);
    if (implicit) hits.push({ line, text: text.trim().slice(0, 60) });
  }
  return {
    id: "no-implicit-scope",
    label: "No implicit scope (use every/all/each)",
    value: hits.length,
    pass: hits.length === 0,
    warn: hits.length > 0,
    detail: hits.length === 0 ? "scope explicit" : hits.map((h) => `L${h.line}`).join(", "),
    hits,
  };
}

// --- Drip-fed cross-phase references ---

const DRIP_FED_RE = [
  /\b(see|refer to|as (described|mentioned|defined) in)\s+(phase|step|section)\s+\d/i,
  /\b(above|earlier|previous(ly)?)\s+(phase|step|section)\b/i,
];

function checkDripFed(body) {
  const hits = [];
  for (const { text, line } of proseLines(body)) {
    if (DRIP_FED_RE.some((re) => re.test(text))) {
      hits.push({ line, text: text.trim().slice(0, 60) });
    }
  }
  return {
    id: "no-drip-fed",
    label: "No drip-fed cross-phase references",
    value: hits.length,
    pass: hits.length === 0,
    warn: hits.length > 0,
    detail: hits.length === 0 ? "self-contained phases" : hits.map((h) => `L${h.line}`).join(", "),
    hits,
  };
}

// --- Redundant repetition ---

function normalizeForComparison(line) {
  return line.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function trigramSet(text) {
  const words = text.split(" ");
  const grams = new Set();
  for (let i = 0; i <= words.length - 3; i++) {
    grams.add(words.slice(i, i + 3).join(" "));
  }
  return grams;
}

function trigramSimilarity(a, b) {
  const gramsA = trigramSet(a);
  const gramsB = trigramSet(b);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  let shared = 0;
  for (const g of gramsA) {
    if (gramsB.has(g)) shared++;
  }
  return shared / Math.min(gramsA.size, gramsB.size);
}

function collectInstructions(body) {
  const result = [];
  for (const { text, line } of proseLines(body)) {
    const norm = normalizeForComparison(text);
    if (norm.length >= 15) result.push({ norm, line, text: text.trim().slice(0, 50) });
  }
  return result;
}

function findNearDuplicates(instructions) {
  const seen = new Set();
  const hits = [];
  for (let i = 0; i < instructions.length; i++) {
    for (let j = i + 1; j < instructions.length; j++) {
      if (Math.abs(instructions[i].line - instructions[j].line) < 3) continue;
      const sim = trigramSimilarity(instructions[i].norm, instructions[j].norm);
      if (sim < 0.7) continue;
      const key = `${instructions[i].line}:${instructions[j].line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ lineA: instructions[i].line, lineB: instructions[j].line, similarity: sim.toFixed(2) });
    }
  }
  return hits;
}

function checkRedundantRepetition(body) {
  const hits = findNearDuplicates(collectInstructions(body));
  return {
    id: "no-redundant-repetition",
    label: "No redundant repeated instructions",
    value: hits.length,
    pass: hits.length === 0,
    warn: hits.length > 0,
    detail:
      hits.length === 0
        ? "no near-duplicates"
        : hits.map((h) => `L${h.lineA}~L${h.lineB} (${h.similarity})`).join("; "),
    hits,
  };
}

// --- Run all checks ---

function runChecks(text) {
  const fm = parseFrontmatter(text);
  const body = bodyAfterFrontmatter(text);
  return [
    checkLineCount(body),
    checkNameFormat(fm),
    checkDescriptionPresent(fm),
    checkDescriptionPerson(fm),
    checkNoAtImports(body),
    checkScaffolding(body),
    checkConservativeFilters(body),
    checkBareNegatives(body),
    checkImplicitScope(body),
    checkDripFed(body),
    checkRedundantRepetition(body),
    checkExplicitScope(body),
    checkDelegationCap(body),
    checkWorkedExamples(body),
    checkContradictions(body),
    checkConsistentTerminology(body),
  ];
}

// --- Comparison ---

function compare(before, after) {
  const rows = [];
  const beforeById = Object.fromEntries(before.map((c) => [c.id, c]));
  for (const a of after) {
    const b = beforeById[a.id] ?? { pass: false, value: "n/a", detail: "n/a" };
    const status =
      a.pass && !b.pass ? "FIXED" : !a.pass && b.pass ? "REGRESSED" : a.pass ? "PASS" : "FAIL";
    rows.push({
      id: a.id,
      label: a.label,
      before: { pass: b.pass, value: b.value, detail: b.detail },
      after: { pass: a.pass, value: a.value, detail: a.detail },
      status,
    });
  }
  return rows;
}

// --- Output ---

function printChecks(checks) {
  const maxLabel = Math.max(...checks.map((c) => c.label.length));
  for (const c of checks) {
    const mark = c.pass ? (c.warn ? "~" : "+") : "-";
    const pad = " ".repeat(maxLabel - c.label.length);
    process.stdout.write(`[${mark}] ${c.label}${pad}  ${c.detail}\n`);
  }
  const passed = checks.filter((c) => c.pass).length;
  process.stdout.write(`\n${passed}/${checks.length} passed\n`);
}

function printComparison(rows) {
  process.stdout.write("\n  Before / After migration check\n");
  process.stdout.write("  " + "-".repeat(70) + "\n");
  for (const r of rows) {
    const icon = { FIXED: "+", REGRESSED: "!", PASS: "=", FAIL: "x" }[r.status];
    process.stdout.write(
      `  [${icon}] ${r.status.padEnd(10)} ${r.label}\n` +
        `      before: ${r.before.detail}\n` +
        `      after:  ${r.after.detail}\n`,
    );
  }
  const fixed = rows.filter((r) => r.status === "FIXED").length;
  const regressed = rows.filter((r) => r.status === "REGRESSED").length;
  const passing = rows.filter((r) => r.status === "PASS" || r.status === "FIXED").length;
  process.stdout.write(
    `\n  ${passing}/${rows.length} passing, ${fixed} fixed, ${regressed} regressed\n`,
  );
}

// --- CLI ---

function parseArgs(argv) {
  const args = { positional: [] };
  for (const item of argv) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(item);
    if (match) {
      args[match[1]] = match[2] ?? "true";
    } else {
      args.positional.push(item);
    }
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const target = args.positional[0];
  if (!target) {
    process.stderr.write(`${USAGE}\n`);
    return 3;
  }

  const text = readFileSync(target, "utf8");
  const checks = runChecks(text);

  if (args.save) {
    const data = { file: target, checks, timestamp: new Date().toISOString() };
    writeFileSync(args.save, JSON.stringify(data, null, 2));
  }

  if (args.before) {
    const beforeData = JSON.parse(readFileSync(args.before, "utf8"));
    const rows = compare(beforeData.checks, checks);
    if (args.json === "true") {
      process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    } else {
      printComparison(rows);
    }
    const regressed = rows.some((r) => r.status === "REGRESSED");
    return regressed ? 1 : 0;
  }

  if (args.json === "true") {
    process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
  } else {
    printChecks(checks);
  }
  return checks.every((c) => c.pass) ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
