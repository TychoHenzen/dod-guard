// The one mapping between a refined issue body and an OpenSpec change folder.
// The format check, the publish step, the spec merge, and the spec-merge check
// all go through it, so the bullet grammar of standards/project-workflow.md
// has one reader and one writer:
//
//   requirements record:  - R-<n> (<operation>, <capability>) <name>: <statement>
//   Acceptance criteria:  - [ ] AC-<n> (<ids>) <scenario>: WHEN <condition> THEN <outcome>
//
// The headings are read through acceptance-criteria.mjs and
// issue-body-records.mjs. Every function is pure; reading and writing files
// and running OpenSpec belong to the callers.
import { acceptanceCriteria, lines, markdownSection, markedLines } from "./acceptance-criteria.mjs";
import { parseIssueBodyRecords } from "./issue-body-records.mjs";
import { parseDeltaSpec, renderDeltaSpec } from "./openspec-delta.mjs";
import { parseTasksFile, slicesFrom } from "./openspec-tasks.mjs";

const TAGGED = /^\s*[-*] +(R-\d+) +\(([A-Z]+), *([a-z0-9][a-z0-9-]*)\) +(.+?): +(\S.*)$/;
const ANY_REQUIREMENT = /^\s*[-*] +[*_`]*(R-\d+)(?!\d)/;
const SCENARIO = /^(AC-\d+) +\(([^)]*)\) +(.+?): +WHEN +(.+?) +THEN +(.+)$/;
const RFC_KEYWORD = /\b(SHALL|MUST)\b/;
const OPERATION_NAMES = new Set(["ADDED", "MODIFIED", "REMOVED", "RENAMED"]);
const INDENTED = /^[ \t]+\S/;
const LEGACY = "no requirement names an operation and a capability; the body uses the legacy form";

function oneLine(text) {
  return text.replace(/\s+/g, " ").trim();
}

// Requirement bullets of the requirements record, each with its wrapped
// continuation lines joined on.
function requirementBullets(record) {
  const bullets = [];
  let open = null;
  for (const line of markedLines(record ?? "")) {
    if (line.fenced) continue;
    if (ANY_REQUIREMENT.test(line.text)) {
      open = [line.text];
      bullets.push(open);
    } else if (open && INDENTED.test(line.text)) {
      open.push(line.text);
    } else if (line.text.trim() !== "") {
      open = null;
    }
  }
  return bullets.map((parts) => oneLine(parts.join(" ")));
}

function readRequirement(bullet) {
  const match = TAGGED.exec(bullet);
  if (!(match && OPERATION_NAMES.has(match[2]))) return { id: ANY_REQUIREMENT.exec(bullet)[1], tagged: false };
  const [, id, operation, capability, name, statement] = match;
  return { id, tagged: true, operation, capability, name: name.trim(), statement: statement.trim() };
}

function readScenario(criterion, problems) {
  const text = oneLine(criterion.text);
  const match = SCENARIO.exec(text);
  if (!match) {
    const id = /^(AC-\d+)/.exec(text)?.[1] ?? null;
    problems.push({ id, message: `${id ?? "A criterion"} is not in the "<scenario>: WHEN ... THEN ..." form` });
    return null;
  }
  const [, id, cited, name, when, then] = match;
  const cites = cited
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return { id, cites, name: name.trim(), when: when.trim(), then: then.trim() };
}

function requirementProblems(requirement, scenarios, known) {
  const { id } = requirement;
  const problems = [];
  if (known.has(id)) problems.push({ id, message: `${id} requirement id is repeated` });
  known.add(id);
  if (requirement.operation === "RENAMED") {
    problems.push({
      id,
      message: `${id} is RENAMED, but the bullet grammar has no place for the old requirement name`,
    });
  }
  if (!RFC_KEYWORD.test(requirement.statement)) {
    problems.push({ id, message: `${id} statement uses neither SHALL nor MUST` });
  }
  if (!scenarios.some((scenario) => scenario.cites.includes(id))) {
    problems.push({ id, message: `${id} is cited by no acceptance criterion` });
  }
  return problems;
}

function citationProblems(scenarios, requirements) {
  const ids = new Set(requirements.map((requirement) => requirement.id));
  return scenarios.flatMap((scenario) =>
    scenario.cites
      .filter((cite) => !ids.has(cite))
      .map((cite) => ({ id: scenario.id, message: `${scenario.id} cites ${cite}, which is not a requirement` })),
  );
}

// Moves every unfenced heading of level two or deeper by `shift` levels. An
// issue section is a level-two heading, so a change file's `## Context` sits
// in the issue as `### Context` and comes back as `## Context`.
function shiftHeadings(text, shift) {
  return markedLines(text)
    .map((line) => {
      const heading = /^(#{2,6}) /.exec(line.text);
      if (line.fenced || !heading) return line.text;
      const level = Math.min(6, Math.max(2, heading[1].length + shift));
      return `${"#".repeat(level)}${line.text.slice(heading[1].length)}`;
    })
    .join("\n");
}

function specsFor(requirements, scenarios) {
  const specs = {};
  const sourceMap = [];
  const capabilities = [...new Set(requirements.map((requirement) => requirement.capability))];
  for (const capability of capabilities) {
    const entries = requirements
      .filter((requirement) => requirement.capability === capability && requirement.operation !== "RENAMED")
      .map((requirement) => ({
        requirement,
        scenarios: scenarios.filter((scenario) => scenario.cites.includes(requirement.id)),
      }));
    const { text, marks } = renderDeltaSpec(entries);
    specs[capability] = text;
    sourceMap.push(...marks.map((mark) => ({ file: `specs/${capability}/spec.md`, ...mark })));
  }
  return { specs, sourceMap };
}

function tasksFor(taskList) {
  const titled = (taskList ?? []).filter((task) => typeof task?.title === "string");
  if (titled.length === 0) return null;
  const items = titled.map((task, index) => `- [ ] 1.${index + 1} ${oneLine(task.title)}`);
  return `## 1. Tasks\n\n${items.join("\n")}\n`;
}

function proposalFor(body) {
  const why = markdownSection(body, "Why").trim();
  const what = markdownSection(body, "What Changes").trim();
  return `## Why\n\n${why}\n\n## What Changes\n\n${what}\n`;
}

function designFor(body) {
  const design = markdownSection(body, "Design").trim();
  return design ? `${shiftHeadings(design, -1)}\n` : "";
}

// Maps an issue body to an OpenSpec change. Returns { legacy, requirements,
// scenarios, problems, proposal, design, specs, tasks, sourceMap }. `specs`
// maps each capability to its delta spec text, and `sourceMap` ties each
// generated requirement and scenario line to its R-n or AC-n id, as
// { file, line, id, name }. `legacy` is true when no requirement bullet names
// an operation and a capability; such a body has no specs.
function bodyToChange(body) {
  const text = lines(body);
  const { input } = parseIssueBodyRecords(text);
  const read = requirementBullets(input.records.requirements).map(readRequirement);
  const requirements = read.filter((requirement) => requirement.tagged);
  const base = { proposal: proposalFor(text), design: designFor(text), tasks: tasksFor(input.tasks) };
  if (requirements.length === 0) {
    const problems = [{ id: null, message: LEGACY }];
    return { legacy: true, requirements, scenarios: [], problems, specs: {}, sourceMap: [], ...base };
  }
  const problems = read
    .filter((requirement) => !requirement.tagged)
    .map(({ id }) => ({ id, message: `${id} does not name an operation and a capability` }));
  const scenarios = acceptanceCriteria(text)
    .map((criterion) => readScenario(criterion, problems))
    .filter(Boolean);
  const known = new Set();
  problems.push(...citationProblems(scenarios, read));
  problems.push(...requirements.flatMap((requirement) => requirementProblems(requirement, scenarios, known)));
  return { legacy: false, requirements, scenarios, problems, ...specsFor(requirements, scenarios), ...base };
}

// The requirement and scenario ids that one `openspec validate` issue points
// at. A line number picks the nearest mapped line at or above it. Otherwise a
// quoted requirement name picks that requirement, and failing that every
// requirement of the capability is named. An issue outside specs/ names none.
function issueIds(change, issue) {
  const file = `specs/${issue.path ?? ""}`;
  const entries = change.sourceMap.filter((entry) => entry.file === file);
  if (entries.length === 0) return [];
  if (Number.isInteger(issue.line)) {
    const above = entries.filter((entry) => entry.line <= issue.line).at(-1);
    return above ? [above.id] : [];
  }
  const requirementsOnly = entries.filter((entry) => entry.id.startsWith("R-"));
  const quoted = [...String(issue.message ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1].trim());
  const named = requirementsOnly.filter((entry) => quoted.includes(entry.name));
  return [...new Set((named.length > 0 ? named : requirementsOnly).map((entry) => entry.id))];
}

// Level-two sections of a Markdown file, in order, as { heading, text }.
function topSections(text) {
  const sections = [];
  for (const line of markedLines(text ?? "")) {
    const heading = line.fenced ? null : /^## +(.+?)\s*$/.exec(line.text);
    if (heading) sections.push({ heading: heading[1], body: [] });
    else if (sections.length > 0) sections.at(-1).body.push(line.text);
  }
  return sections.map(({ heading, body }) => ({ heading, text: body.join("\n").trim() }));
}

// What Changes takes the proposal's own section, then every other proposal
// section except Why (Capabilities, Impact, and the like) one level down, so
// nothing the proposal says is dropped.
function whatChangesFrom(proposalSections) {
  const own = proposalSections.find((section) => section.heading === "What Changes")?.text ?? "";
  const rest = proposalSections
    .filter((section) => !["Why", "What Changes"].includes(section.heading))
    .map((section) => `### ${section.heading}\n\n${shiftHeadings(section.text, 1)}`.trim());
  return [own, ...rest].filter(Boolean).join("\n\n");
}

function scenarioKey(scenario) {
  return JSON.stringify([scenario.name, scenario.when, scenario.then]);
}

// Gives each requirement an R-n id and each distinct scenario an AC-n id. A
// scenario repeated word for word under several requirements becomes one
// criterion that cites all of them, which is the inverse of bodyToChange.
function citeScenarios(block, id, scenarios) {
  if (block.operation === "REMOVED") return;
  for (const scenario of block.scenarios) {
    const key = scenarioKey(scenario);
    if (!scenarios.has(key)) scenarios.set(key, { id: `AC-${scenarios.size + 1}`, cites: [], ...scenario });
    scenarios.get(key).cites.push(id);
  }
}

function numberRequirements(specs, problems) {
  const requirements = [];
  const scenarios = new Map();
  for (const capability of Object.keys(specs).sort()) {
    const { blocks, renamed } = parseDeltaSpec(specs[capability]);
    for (const pair of renamed) {
      problems.push({ id: null, message: `${capability}: RENAMED "${pair.from}" cannot be written as one bullet` });
    }
    for (const block of blocks) {
      const id = `R-${requirements.length + 1}`;
      if (block.name.includes(":")) problems.push({ id, message: `${id} name "${block.name}" holds a colon` });
      requirements.push({ id, capability, ...block });
      citeScenarios(block, id, scenarios);
    }
  }
  return { requirements, scenarios: [...scenarios.values()] };
}

// Maps an OpenSpec change folder, given as { proposal, design, specs:
// { [capability]: text }, tasks }, to issue sections. Returns { sections,
// slices, parentTasks, problems }: sections in issue order as { heading,
// text }, the slice task groups and untagged task groups of tasks.md, and one
// problem per part that the bullet grammar cannot hold.
function changeToBody(files) {
  const problems = [];
  const proposal = topSections(files.proposal);
  const { requirements, scenarios } = numberRequirements(files.specs ?? {}, problems);
  const requirementText = requirements
    .map((entry) => `- ${entry.id} (${entry.operation}, ${entry.capability}) ${entry.name}: ${entry.statement}`)
    .join("\n");
  const criteriaText = scenarios
    .map(
      (entry) => `- [ ] ${entry.id} (${entry.cites.join(", ")}) ${entry.name}: WHEN ${entry.when} THEN ${entry.then}`,
    )
    .join("\n");
  const sections = [
    { heading: "Why", text: proposal.find((section) => section.heading === "Why")?.text ?? "" },
    { heading: "What Changes", text: whatChangesFrom(proposal) },
    { heading: "Design", text: shiftHeadings((files.design ?? "").trim(), 1) },
    { heading: "Implementation notes", text: `### requirements\n\n${requirementText}` },
    { heading: "Acceptance criteria", text: criteriaText },
  ];
  return { sections, ...slicesFrom(parseTasksFile(files.tasks)), problems };
}

// Joins issue sections into a body, one level-two heading each.
function renderBody(sections) {
  return sections.map((section) => `## ${section.heading}\n\n${section.text.trim()}\n`).join("\n");
}

export { bodyToChange, changeToBody, issueIds, renderBody };
