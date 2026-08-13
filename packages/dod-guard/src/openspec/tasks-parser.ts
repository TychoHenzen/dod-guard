/**
 * Parse an OpenSpec change's `tasks.md` into ordered items. Each checkbox
 * line starts one item; every following line, up to the next checkbox line
 * or heading, is a continuation (description text, nested sub-bullets, or a
 * `covers` annotation). Line-scanned like `cover/markers.ts`'s own marker
 * format, not a general markdown parser.
 */
import { buildScenarioId } from "./scenario-id.js";

const CHECKBOX_RE = /^-\s*\[([ xX])\]\s*(.+?)\s*$/;
const ID_RE = /^(\d+(?:\.\d+)*)\s+(.*)$/;
const COVERS_RE = /^\s*<!--\s*covers:\s*(\S+\/\S+)\s*::\s*(.+?)\s*::\s*(.+?)\s*-->\s*$/;

export interface TaskItem {
  id: string;
  text: string;
  checked: boolean;
  coversId?: string;
}

function parseCoversAnnotation(line: string): string | undefined {
  const match = line.match(COVERS_RE);
  if (!match) return undefined;

  const [, groupCapability, requirementTitle, scenarioTitle] = match;
  const slashIndex = groupCapability.indexOf("/");
  if (slashIndex === -1) return undefined;

  return buildScenarioId(
    groupCapability.slice(0, slashIndex),
    groupCapability.slice(slashIndex + 1),
    requirementTitle,
    scenarioTitle,
  );
}

/** Parse `tasks.md` content into ordered task items, in document order. */
export function parseTasksMarkdown(content: string): TaskItem[] {
  const lines = content.split("\n");
  const items: TaskItem[] = [];
  let fallbackIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const checkbox = lines[i].match(CHECKBOX_RE);
    if (!checkbox) continue;

    const [, mark, rest] = checkbox;
    const idMatch = rest.match(ID_RE);
    fallbackIndex++;
    const id = idMatch ? idMatch[1] : String(fallbackIndex);
    const textParts = [idMatch ? idMatch[2] : rest];
    let coversId: string | undefined;

    let next = i + 1;
    while (next < lines.length && !CHECKBOX_RE.test(lines[next]) && !/^#{1,6}\s/.test(lines[next])) {
      const covers = parseCoversAnnotation(lines[next]);
      if (covers) coversId = covers;
      else if (lines[next].trim().length > 0) textParts.push(lines[next].trim());
      next++;
    }

    items.push({ id, text: textParts.join(" "), checked: mark.toLowerCase() === "x", coversId });
  }

  return items;
}
