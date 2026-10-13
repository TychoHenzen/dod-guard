import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { markdownSection } from "../../../lib/acceptance-criteria.mjs";
import { prose } from "../../../lib/skill-text.mjs";

const COMMAND =
  "node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs refinement --body-file=<path> [--children=<path>]";
const NEW_RECORDS = ["acceptance-evidence", "planned-acceptance-matrix"];
const pluginFile = (relative) => new URL(`../../../${relative}`, import.meta.url);
const read = (relative) => readFile(pluginFile(relative), "utf8");

const refine = await read("skills/refine-backlog-item/SKILL.md");
const nextTicket = await read("skills/next-ticket/SKILL.md");
const workflow = await read("standards/project-workflow.md");

// Each pin answers whether a document still wires the command or names a
// record, so the same pin can be shown to fail on a copy with that text removed.
const pins = {
  "refine-backlog-item runs the command before Todo": (text) => {
    const section = markdownSection(text, "Apply labels and verify before Todo");
    return (
      section.includes(COMMAND) &&
      prose("before moving", "the parent to `Todo`", "Save the issue body", COMMAND).test(section) &&
      prose("Move the parent to `Todo` only", 'exits 0 with `outcome: "verified"`').test(section)
    );
  },
  "refine-backlog-item writes both new records": (text) =>
    prose("Keep these named records in", "`acceptance-evidence`, and", "`planned-acceptance-matrix`").test(text),
  "next-ticket runs the command before the branch exists": (text) => {
    const section = markdownSection(text, "Select a ticket");
    return (
      prose("Before", "the branch exists, save the issue body", COMMAND, "exits 0 only on", "`verified`").test(section) &&
      section.indexOf(COMMAND) < section.indexOf("After the handoff is")
    );
  },
  "project-workflow names both records and the command": (text) => {
    const section = markdownSection(text, "Structured handoff records");
    return NEW_RECORDS.every((name) => section.includes(`- \`${name}\`:`)) && section.includes(COMMAND);
  },
};
const documents = {
  "refine-backlog-item runs the command before Todo": refine,
  "refine-backlog-item writes both new records": refine,
  "next-ticket runs the command before the branch exists": nextTicket,
  "project-workflow names both records and the command": workflow,
};

test("refinement and next-ticket name the exact handoff-proof command, and the standard names its records", () => {
  for (const [name, pin] of Object.entries(pins)) {
    assert.ok(pin(documents[name]), name);
  }
  assert.match(workflow, /contains the seven named\s+records/);
});

test("each pin fails once its command or record name is removed", () => {
  for (const [name, pin] of Object.entries(pins)) {
    const withoutCommand = documents[name].replaceAll(COMMAND, "node handoff-proof.mjs");
    const withoutRecords = NEW_RECORDS.reduce((text, record) => text.replaceAll(`\`${record}\``, "`record`"), documents[name]);

    assert.ok(!pin(withoutCommand) || !pin(withoutRecords), name);
  }
  assert.ok(!pins["refine-backlog-item runs the command before Todo"](refine.replaceAll(COMMAND, "")));
  assert.ok(!pins["next-ticket runs the command before the branch exists"](nextTicket.replaceAll(COMMAND, "")));
  assert.ok(!pins["project-workflow names both records and the command"](workflow.replace("- `planned-acceptance-matrix`:", "-")));
});

test("the documented command names the shipped script", () => {
  const script = COMMAND.split(" ")[1].replace("<plugin-root>/", "");

  assert.ok(existsSync(fileURLToPath(pluginFile(script))), script);
});
