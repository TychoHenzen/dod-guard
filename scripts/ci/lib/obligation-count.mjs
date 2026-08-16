// Counts RFC 2119 obligation keywords in OpenSpec requirement bodies and
// compares them to scenario counts, so compound requirements become visible.

import { readFileSync } from "node:fs";

const OBLIGATION_KEYWORDS_RE = /(?<![\w-])(SHALL|MUST|SHOULD|MAY|REQUIRED|OPTIONAL|RECOMMENDED)(?![\w-])/gi;

/**
 * Counts RFC 2119 obligation keywords in a requirement body.
 * @param {string} bodyText - text between a `### Requirement:` heading and the
 *   first `#### Scenario:` heading beneath it (scenario text excluded).
 * @returns {number} obligation keyword count
 */
export function countObligations(bodyText) {
  const matches = bodyText.match(OBLIGATION_KEYWORDS_RE);
  return matches ? matches.length : 0;
}

/**
 * Parses a spec.md file into per-requirement obligation/scenario counts.
 * @param {string} specFilePath - path to a spec.md file
 * @returns {Array<{requirementTitle: string, obligationCount: number, scenarioCount: number, delta: number}>}
 */
export function analyzeSpec(specFilePath) {
  const lines = readFileSync(specFilePath, "utf8").split(/\r?\n/);
  const results = [];

  let current = null; // { title, bodyLines, scenarioCount, sawScenario }

  const flush = () => {
    if (!current) return;
    const obligationCount = countObligations(current.bodyLines.join("\n"));
    const scenarioCount = current.scenarioCount;
    results.push({
      requirementTitle: current.title,
      obligationCount,
      scenarioCount,
      delta: obligationCount - scenarioCount,
    });
  };

  for (const line of lines) {
    const reqMatch = /^### Requirement:\s*(.*)$/.exec(line);
    if (reqMatch) {
      flush();
      current = { title: reqMatch[1].trim(), bodyLines: [], scenarioCount: 0, sawScenario: false };
      continue;
    }
    if (!current) continue;

    const scenarioMatch = /^#### Scenario:/.exec(line);
    if (scenarioMatch) {
      current.sawScenario = true;
      current.scenarioCount += 1;
      continue;
    }

    if (!current.sawScenario) {
      current.bodyLines.push(line);
    }
  }
  flush();

  return results;
}
