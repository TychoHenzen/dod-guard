// Stage agents' return contract (issue 867), kept apart so model-routing.test.mjs stays within the file-size lint.
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { readFile } from "node:fs/promises";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const pluginRoot = new URL("../../../", import.meta.url);

function agentText(name) {
  return readFile(new URL(`agents/${name}.md`, pluginRoot), "utf8");
}

// Returning the misses keeps assertions inside the test and names every
// missing phrase in one failure instead of stopping at the first.
function missingPhrases(text, phrases) {
  return phrases.filter((phrase) => !prose(phrase).test(text));
}

// Stages returned while their own work still ran, left probes in source files,
// and reported a pending proof as done, so both stage agents must hold owned
// work to a terminal state and report what the proof actually printed.
const STAGE_RETURN_RULES = [
  "Finish every named proof in the foreground before you return",
  "each named proof with its final output and result, not merely its command, exit status, or a pending state",
  "Before you return, remove every temporary mutation or probe this stage introduced",
  "leave pre-existing and unrelated user work unchanged: never stash, reset, or revert work you did not introduce.",
];

// Only stage-standard can dispatch, so only it needs the terminal-child rule.
const STANDARD_CHILD_WAIT = [
  "do not return any stage report until every child you dispatched reaches a terminal result",
  'An interim statement such as "waiting for the worker" is not a valid return.',
  "dispatch each child in the foreground (`run_in_background: false`) or wait for its completion notification",
  "a child that is still running means keep waiting, not return.",
];

test("stage agents return only after owned work and proofs finish", async () => {
  const [standard, cheap] = await Promise.all([agentText("stage-standard"), agentText("stage-cheap")]);
  assert.deepEqual(missingPhrases(standard, STAGE_RETURN_RULES), [], "stage-standard.md");
  assert.deepEqual(missingPhrases(cheap, STAGE_RETURN_RULES), [], "stage-cheap.md");
  assert.deepEqual(missingPhrases(standard, STANDARD_CHILD_WAIT), [], "stage-standard.md");
  // An exit status alone hid unfinished proofs, so it must not be the whole return.
  assert.doesNotMatch(cheap, prose("Return the commands you ran with their exit status"));
});
