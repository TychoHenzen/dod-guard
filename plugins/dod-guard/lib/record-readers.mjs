// Reads the `### <name>` subsections of an issue body's `## Implementation
// notes` (standards/project-workflow.md) and the text and JSON blocks inside
// them. complete-pr's closure records and the handoff readers use the same
// subsection and JSON-block readers. Every function is pure.
import { lines, markedLines } from "./acceptance-criteria.mjs";

const TEXT_RECORDS = Object.freeze(["requirements", "clarifications", "implementation-plan"]);
const JSON_RECORDS = Object.freeze(["task-list", "lens-ownership", "acceptance-evidence", "planned-acceptance-matrix"]);

// A heading inside a fenced code block is an example, not a record, so it has
// no name. Returns the name of a `### <name>` line, else null.
function headingName(line) {
  if (line.fenced) return null;
  return /^### (.+?)\s*$/.exec(line.text)?.[1] ?? null;
}

// Starts collecting a section when the heading is the wanted record, else
// returns null so the lines under it are skipped.
function openSection(heading, name, found) {
  if (heading !== name) return null;
  const section = [];
  found.push(section);
  return section;
}

// Returns the text of every `### <name>` subsection, in document order. A
// heading inside a fenced code block is an example, not a record, so it stays
// in the text of the record around it.
function subsections(notes, name) {
  const found = [];
  let current = null;
  for (const line of markedLines(notes)) {
    const heading = headingName(line);
    if (heading !== null) {
      current = openSection(heading, name, found);
      continue;
    }
    if (current) current.push(line.text);
  }
  return found.map((section) => section.join("\n"));
}

// Returns { value } for the first JSON block in the text, else { error }.
function jsonBlock(text) {
  const match = /```json\n([\s\S]*?)\n```/.exec(lines(text));
  if (!match) return { error: "has no JSON block" };
  try {
    return { value: JSON.parse(match[1]) };
  } catch {
    return { error: "is not valid JSON" };
  }
}

function onlyRecord(notes, name, errors) {
  const found = subsections(notes, name);
  if (found.length === 0) errors.push(`missing ${name} record`);
  if (found.length > 1) errors.push(`duplicate ${name} record`);
  return found.length === 1 ? found[0] : null;
}

function textRecord(notes, name, errors) {
  const text = onlyRecord(notes, name, errors)?.trim();
  if (text === "") errors.push(`${name} record is empty`);
  return text ? text : null;
}

function jsonRecord(notes, name, errors) {
  const section = onlyRecord(notes, name, errors);
  if (section === null) return null;
  const block = jsonBlock(section);
  if (block.error) {
    errors.push(`${name} record ${block.error}`);
    return null;
  }
  if (!Array.isArray(block.value)) {
    errors.push(`${name} record is not a JSON array`);
    return null;
  }
  return block.value;
}

export { JSON_RECORDS, jsonBlock, jsonRecord, subsections, TEXT_RECORDS, textRecord };
