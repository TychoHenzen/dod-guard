/**
 * The `// covers:` marker. A scenario binds to a test by a comment directly
 * above the `test(`/`it(` call, read by regex - `cover` never executes a
 * test file to discover its markers. Binding by marker rather than by title
 * match is deliberate: a title-similarity binding is the same mechanism that
 * produced 430 grep-only proofs with different syntax. The marker sits next
 * to the assertions it makes, so lying about the binding costs the most
 * right where the test would have to actually call through.
 *
 * Format: `// covers: <group>/<capability> :: <requirement title> :: <scenario title>`
 */
import { promises as fs } from "node:fs";
import { resolveGlob } from "../openspec/glob.js";
import { buildScenarioId } from "../openspec/scenario-id.js";
import { testGlobsForGroup } from "./package-dir.js";

const MARKER_RE = /^\s*\/\/\s*covers:\s*(\S+\/\S+)\s*::\s*(.+?)\s*::\s*(.+?)\s*$/;
const TEST_CALL_RE = /^\s*(?:test|it)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;

interface MarkerBinding {
  scenarioId: string;
  file: string;
  testName: string;
}

/** Every marker found in one file's text, paired with the test name on the
 * next non-blank line. A marker with no test call after it (blank rest of
 * file, or the next line isn't a `test(`/`it(` call) binds nothing - the
 * scenario it names stays unwired, same as if the marker were never written. */
function markersInFile(file: string, content: string): MarkerBinding[] {
  const lines = content.split("\n");
  const bindings: MarkerBinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(MARKER_RE);
    if (!marker) continue;

    const [, groupCapability, requirementTitle, scenarioTitle] = marker;
    const slashIndex = groupCapability.indexOf("/");
    if (slashIndex === -1) continue;

    let next = i + 1;
    while (next < lines.length && lines[next].trim().length === 0) next++;
    const testCall = next < lines.length ? lines[next].match(TEST_CALL_RE) : null;
    if (!testCall) continue;

    bindings.push({
      scenarioId: buildScenarioId(
        groupCapability.slice(0, slashIndex),
        groupCapability.slice(slashIndex + 1),
        requirementTitle,
        scenarioTitle,
      ),
      file,
      testName: testCall[2],
    });
  }

  return bindings;
}

/** Every scenario-to-test binding declared anywhere in one group's test
 * files. A scenario id repeated across files or within one file keeps its
 * last binding - a duplicate marker is an authoring mistake to catch by
 * review, not something `cover` arbitrates. */
export async function scanMarkers(cwd: string, group: string): Promise<Map<string, MarkerBinding>> {
  const bindings = new Map<string, MarkerBinding>();
  for (const pattern of testGlobsForGroup(group)) {
    for (const file of await resolveGlob(cwd, pattern)) {
      const content = await fs.readFile(file, "utf-8");
      for (const binding of markersInFile(file, content)) {
        bindings.set(binding.scenarioId, binding);
      }
    }
  }
  return bindings;
}
