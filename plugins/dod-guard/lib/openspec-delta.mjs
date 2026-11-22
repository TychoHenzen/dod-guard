// Reads and writes OpenSpec delta spec files (`specs/<capability>/spec.md`
// inside a change folder). openspec-issue-map.mjs turns issue bodies into these
// files and back, so the delta format lives in one place. Every function is
// pure; OpenSpec itself stays the judge of validity through `openspec validate`.
import { markedLines } from "./acceptance-criteria.mjs";

const OPERATIONS = Object.freeze(["ADDED", "MODIFIED", "REMOVED", "RENAMED"]);
const SECTION = /^## +(ADDED|MODIFIED|REMOVED|RENAMED) +Requirements\s*$/i;
const REQUIREMENT = /^### +Requirement: *(.+?)\s*$/;
const SCENARIO = /^#### +Scenario: *(.+?)\s*$/;
const CLAUSE = /^\s*[-*] +\*\*([A-Z]+)\*\*:? *(.*)$/;
const RENAME = /^\s*-?\s*(FROM|TO):\s*`?###\s*Requirement:\s*(.+?)`?\s*$/;
const REASON = /^\*\*(Reason|Migration)\*\*: *(.*)$/;

// Lines of one requirement block, ready to append to a spec file. A REMOVED
// requirement carries its statement as the reason and has no scenarios,
// because OpenSpec reads only the name of a removal.
function requirementLines(requirement, scenarios, mark) {
  const out = [];
  mark(out.length, requirement.id, requirement.name);
  out.push(`### Requirement: ${requirement.name}`);
  if (requirement.operation === "REMOVED") {
    out.push(`**Reason**: ${requirement.statement}`, "");
    return out;
  }
  out.push(requirement.statement, "");
  for (const scenario of scenarios) {
    mark(out.length, scenario.id, scenario.name);
    out.push(`#### Scenario: ${scenario.name}`, `- **WHEN** ${scenario.when}`, `- **THEN** ${scenario.then}`, "");
  }
  return out;
}

// Renders one capability's delta spec. `entries` holds { requirement,
// scenarios } in the order the issue lists them; sections follow OpenSpec's
// ADDED, MODIFIED, REMOVED order. Returns { text, marks }, where each mark is
// { line, id, name } with a 1-based line number.
function renderDeltaSpec(entries) {
  const lines = [];
  const marks = [];
  for (const operation of OPERATIONS) {
    const inSection = entries.filter((entry) => entry.requirement.operation === operation);
    if (inSection.length === 0) continue;
    lines.push(`## ${operation} Requirements`, "");
    for (const { requirement, scenarios } of inSection) {
      const start = lines.length;
      const mark = (offset, id, name) => marks.push({ line: start + offset + 1, id, name });
      lines.push(...requirementLines(requirement, scenarios, mark));
    }
  }
  return { text: lines.join("\n"), marks };
}

function clauseText(clauses) {
  return clauses.map((clause) => clause.text).join(" and ");
}

// Folds a scenario's bullets into one WHEN and one THEN. GIVEN and AND bullets
// join the clause before the first THEN or after it, with "and".
function scenarioFrom(name, clauses) {
  const thenAt = clauses.findIndex((clause) => clause.keyword === "THEN");
  if (thenAt < 0) return { name, when: clauseText(clauses), then: "" };
  return { name, when: clauseText(clauses.slice(0, thenAt)), then: clauseText(clauses.slice(thenAt)) };
}

function statementLine(operation, text) {
  if (operation !== "REMOVED") return text;
  const reason = REASON.exec(text);
  if (reason === null) return text;
  return reason[1] === "Reason" ? reason[2] : `Migration: ${reason[2]}`;
}

// One parse step per line. The state holds the open section, block, and
// scenario; `found` collects finished blocks and RENAMED pairs.
function readLine(state, text) {
  const section = SECTION.exec(text);
  if (section) return Object.assign(state, { operation: section[1].toUpperCase(), block: null, scenario: null });
  if (text.startsWith("## ")) return Object.assign(state, { operation: null, block: null, scenario: null });
  if (state.operation === "RENAMED") return readRename(state, text);
  const requirement = REQUIREMENT.exec(text);
  if (requirement && state.operation) {
    state.block = { operation: state.operation, name: requirement[1], statement: [], scenarios: [] };
    state.scenario = null;
    state.found.blocks.push(state.block);
    return state;
  }
  if (!state.block) return state;
  return readBlockLine(state, text);
}

function readRename(state, text) {
  const match = RENAME.exec(text);
  if (match?.[1] === "FROM") state.found.renamed.push({ from: match[2], to: "" });
  if (match?.[1] === "TO" && state.found.renamed.length > 0) state.found.renamed.at(-1).to = match[2];
  return state;
}

function readBlockLine(state, text) {
  const scenario = SCENARIO.exec(text);
  if (scenario) {
    state.scenario = { name: scenario[1], clauses: [] };
    state.block.scenarios.push(state.scenario);
    return state;
  }
  const clause = CLAUSE.exec(text);
  if (state.scenario && clause) {
    state.scenario.clauses.push({ keyword: clause[1], text: clause[2].trim() });
  } else if (!state.scenario && text.trim() !== "") {
    state.block.statement.push(statementLine(state.operation, text.trim()));
  }
  return state;
}

// Returns { blocks, renamed }: each block is { operation, name, statement,
// scenarios: [{ name, when, then }] }, and each RENAMED pair is { from, to }.
// Lines inside fenced code blocks are examples and are skipped.
function parseDeltaSpec(text) {
  const state = { operation: null, block: null, scenario: null, found: { blocks: [], renamed: [] } };
  for (const line of markedLines(text)) {
    if (!line.fenced) readLine(state, line.text);
  }
  const blocks = state.found.blocks.map((block) => ({
    operation: block.operation,
    name: block.name,
    statement: block.statement.join(" "),
    scenarios: block.scenarios.map((scenario) => scenarioFrom(scenario.name, scenario.clauses)),
  }));
  return { blocks, renamed: state.found.renamed };
}

export { OPERATIONS, parseDeltaSpec, renderDeltaSpec };
