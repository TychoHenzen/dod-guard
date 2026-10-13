import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { markdownSection } from "../../../lib/acceptance-criteria.mjs";
import { prose } from "../../../lib/skill-text.mjs";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const reporting = markdownSection(await read("../SKILL.md"), "Reporting");
const usage = await read("../../../USAGE.md");

// The linked Project spans several repositories, and a goal run once reported
// the completion count without saying it covers only the target one (#821, #859).
const SCOPE =
  "only the target repository's parent and child PBIs whose Project status reads Done, as select-next's `counts` " +
  "report them, even when the linked Project spans several repositories.";

test("goal-sdlc Reporting scopes PBIs completed to the target repository", () => {
  assert.match(reporting, prose(`\`PBIs completed: P parent / C child\`, counting ${SCOPE}`));
});

test("USAGE.md scopes PBIs completed to the target repository", () => {
  assert.match(usage, prose(`\`PBIs completed: P parent / C child\`. That figure counts ${SCOPE}`));
});
