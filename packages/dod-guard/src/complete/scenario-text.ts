/**
 * Extract the full scenario markdown block (heading + all bullets) from a
 * spec file's raw content. The existing `extractRequirementBlocks` parser
 * only keeps THEN text; the ollama prompt needs the complete WHEN/THEN/AND
 * block so the eval model can judge alignment.
 */

const SCENARIO_HEADING_RE = /^####\s+Scenario:\s*(.+?)\s*$/;
const ANY_HEADING_RE = /^#{1,6}\s/;

export function extractFullScenarioText(specContent: string, scenarioTitle: string): string | undefined {
  const lines = specContent.split("\n");

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SCENARIO_HEADING_RE);
    if (m && m[1] === scenarioTitle) {
      start = i;
      break;
    }
  }
  if (start === -1) return undefined;

  let end = start + 1;
  while (end < lines.length && !ANY_HEADING_RE.test(lines[end])) {
    end++;
  }

  // Trim trailing blank lines
  while (end > start + 1 && lines[end - 1].trim() === "") end--;

  return lines.slice(start, end).join("\n");
}
