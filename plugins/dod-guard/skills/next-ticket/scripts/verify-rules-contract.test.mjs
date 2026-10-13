import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { markdownSection } from "../../../lib/acceptance-criteria.mjs";
import { prose } from "../../../lib/skill-text.mjs";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const verify = markdownSection(skill, "Verify and prepare generated files");

// An empty section reports every sentence missing, so a renamed heading fails too.
function missingSentences(sentences) {
  return sentences.filter((sentence) => !prose(sentence).test(verify));
}

// A new collision broke a test only Windows CI ran, and seeded data changed an
// older count, because no suite consuming the changed data ran first (#824, #859).
test("every existing suite that consumes a changed fixture runs before push", () => {
  const missing = missingSentences([
    "Do not rerun an unchanged full suite for reassurance. A suite that consumes a changed fixture is not unchanged.",
    "When a change adds or modifies a fixture, scene, seed, or other shared test data, search for references to it " +
      "and run every existing suite that consumes it before push.",
    "When such a suite cannot run locally, record it in the handoff as pending exact-head CI, and carry that into " +
      "the pull request body; that alone does not stop PR handoff.",
    "Its exact-head CI result must pass before review, recorded with its run ID in the handoff.",
  ]);
  assert.deepEqual(missing, []);
});

// A proof once sent an undeclared argument to a game's MCP server, called it
// before the game was live, and retried after a malformed result (#824, #859).
test("a live proof tool is called only with its declared schema after its readiness signal", () => {
  const missing = missingSentences([
    "When a proof calls a live product or runtime tool, such as an MCP server for a game, an app, or an emulator,",
    "Before the first proof call, read the tool's current schema (for MCP, its live `tools/list` entry) and send " +
      "only arguments it declares.",
    "Wait for the tool's own readiness signal before the proof call.",
    "When the tool declares none, record that, and treat its documented ready condition or a successful no-op " +
      "call as ready.",
    "A process exit, a startup error, or the end of the tool's own ready window before readiness is a failure " +
      "under the failure-recovery rule in `standards/working-defaults.md`.",
    "After an unsupported-argument rejection or a malformed result, never retry identical arguments.",
    "Make one schema-corrected call, or switch to the nearest supported proof path and record the switch and the " +
      "original error in the matrix row, or, for a PBI without a matrix, in the `## Implementation handoff`.",
    "GitHub and other provider calls keep the stop in `standards/github-request-discipline.md`.",
  ]);
  assert.deepEqual(missing, []);
});
