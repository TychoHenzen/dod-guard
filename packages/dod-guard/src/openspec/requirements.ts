const REQUIREMENT_HEADING = /^### Requirement:\s*(.+?)\s*$/;

/**
 * Pull every `### Requirement: <title>` heading out of a spec delta's
 * markdown content, in document order. Scenario bodies underneath each
 * heading are not read here - a later step maps them to leaves.
 */
export function extractRequirementTitles(content: string): string[] {
  const titles: string[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(REQUIREMENT_HEADING);
    if (match) titles.push(match[1]);
  }
  return titles;
}
