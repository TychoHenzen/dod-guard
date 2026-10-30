// The scanner judges every repository at its built-in limits (line width 80,
// file length 100). A reviewed repository states its own: `.editorconfig`
// `max_line_length`, and the `--rule-block-on` floors its quality-pr-gate CI
// step passes. The review applies those to the scan, so it never reports what
// the repository's own gate was told to accept.

// biome-ignore lint/correctness/noNodejsModules: This skill helper reads repository files under Node.js.
import { existsSync, readdirSync, readFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper reads repository files under Node.js.
import { join } from "node:path";

// ASSUMPTION: the scanner's high line-length bound is 120 (config-values.mjs
// in quality-guard); a wider formatter or editorconfig width raises it, as
// lineBounds in rules-file-line-check.mjs does.
const SCANNER_HIGH_WIDTH = 120;
const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };

// Glob syntax to regular expression; any other character is matched literally.
const GLOB_TOKENS = [
  ["**", ".*"],
  ["*", "[^/]*"],
  ["?", "[^/]"],
  ["{", "(?:"],
  ["}", ")"],
  [",", "|"],
];

function globSource(glob) {
  let source = "";
  let index = 0;
  while (index < glob.length) {
    const token = GLOB_TOKENS.find(([syntax]) => glob.startsWith(syntax, index));
    const [syntax, replacement] = token ?? [glob[index], glob[index].replace(/[.+^$()|[\]\\]/g, "\\$&")];
    source += replacement;
    index += syntax.length;
  }
  return source;
}

// A section glob without a slash matches a file name in any directory; one
// with a slash is anchored to the .editorconfig directory.
function sectionMatcher(glob) {
  const anchored = glob.includes("/");
  const body = globSource(anchored ? glob.replace(/^\//, "") : glob);
  return new RegExp(anchored ? `^${body}$` : `(?:^|/)${body}$`);
}

function parseEditorconfig(text) {
  const sections = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[(.+)\]$/.exec(line);
    const pair = /^([\w-]+)\s*=\s*(.*)$/.exec(line);
    if (header) {
      sections.push({ matches: sectionMatcher(header[1]), width: undefined });
    } else if (pair && sections.length > 0 && pair[1].toLowerCase() === "max_line_length") {
      const value = pair[2].trim().toLowerCase();
      sections.at(-1).width = value === "off" ? null : Number.parseInt(value, 10);
    }
  }
  return sections;
}

// Returns a function from a root-relative path to the width the repository
// sets for it: a number, null for `off`, or undefined when nothing sets one.
// Later sections win, as editorconfig specifies.
function editorconfigWidths(text) {
  const sections = parseEditorconfig(text).filter((section) => section.width !== undefined);
  return (path) => {
    let width;
    for (const section of sections) {
      if (section.matches.test(path)) {
        width = Number.isNaN(section.width) ? width : section.width;
      }
    }
    return width;
  };
}

// The text of each step that runs quality-pr-gate, without comment lines, so a
// flag quoted in a YAML comment is never read as one the gate receives.
function gateSteps(workflow) {
  const text = workflow
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  const steps = [];
  let start = text.indexOf("quality-pr-gate.mjs");
  while (start !== -1) {
    const next = text.slice(start).search(/\n\s*- /);
    steps.push(next === -1 ? text.slice(start) : text.slice(start, start + next));
    start = text.indexOf("quality-pr-gate.mjs", start + 1);
  }
  return steps;
}

// ASSUMPTION: only per-rule `--rule-block-on` floors are applied. They state a
// rule's real limit (for example file length past 300 lines); the global
// `--block-on` is a merge policy over every rule, so the review keeps findings
// below it.
function gateRuleFloors(workflows) {
  const floors = {};
  for (const step of workflows.flatMap(gateSteps)) {
    for (const match of step.matchAll(/--rule-block-on=([\w-]+):(low|medium|high)\b/g)) {
      floors[match[1]] = match[2];
    }
  }
  return floors;
}

function lineLengthAt(violation, width) {
  const high = Math.max(width, SCANNER_HIGH_WIDTH);
  const severity = violation.metric > high ? "high" : "medium";
  return { ...violation, severity, message: `line is ${violation.metric} chars (width ${width})` };
}

// A line-length finding at a formatter width (widthSource other than
// "default") already follows the repository and is left as it is.
function withWidth(violation, widthFor) {
  const defaultWidth = (violation.widthSource ?? "default") === "default";
  if (violation.rule !== "line-length" || !defaultWidth) {
    return violation;
  }
  const width = widthFor(violation.file);
  if (width === undefined) {
    return violation;
  }
  if (width === null || !(violation.metric > width)) {
    return null;
  }
  return lineLengthAt(violation, width);
}

function belowFloor(violation, floors) {
  const floor = floors[violation.rule];
  return floor !== undefined && SEVERITY_RANK[violation.severity] < SEVERITY_RANK[floor];
}

function applyRepoLimits(scan, { widthFor, floors }) {
  const removed = {};
  const kept = [];
  for (const violation of scan.violations) {
    const judged = withWidth(violation, widthFor);
    if (judged === null || belowFloor(judged, floors)) {
      removed[violation.rule] = (removed[violation.rule] ?? 0) + 1;
    } else {
      kept.push(judged);
    }
  }
  return { scan: { ...scan, violations: kept }, removed };
}

// ASSUMPTION: only the root .editorconfig is read; nested ones are rare in the
// repositories this skill reviews and would need per-directory resolution.
function repoLimits(root) {
  const editorconfig = join(root, ".editorconfig");
  const widthFor = existsSync(editorconfig) ? editorconfigWidths(readFileSync(editorconfig, "utf8")) : () => undefined;
  const directory = join(root, ".github", "workflows");
  const names = existsSync(directory) ? readdirSync(directory).filter((name) => /\.ya?ml$/.test(name)) : [];
  const floors = gateRuleFloors(names.map((name) => readFileSync(join(directory, name), "utf8")));
  return { widthFor, floors };
}

export { applyRepoLimits, editorconfigWidths, gateRuleFloors, repoLimits };
