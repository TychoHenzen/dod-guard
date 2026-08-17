/** Parse an OpenSpec change's `tasks.md`, and write status updates back. Line-scanned, not a markdown parser. */
import { buildScenarioId } from "./scenario-id.js";

const CHECKBOX_RE = /^-\s*\[([ xX])\]\s*(.+?)\s*$/;
const ID_RE = /^(\d+(?:\.\d+)*)\s+(.*)$/;
const COVERS_RE = /^\s*<!--\s*covers:\s*(\S+\/\S+)\s*::\s*(.+?)\s*::\s*(.+?)\s*-->\s*$/;
const METADATA_RE = /^\s*<!--\s*(status|verify_cmd|verify_surface|manual_required):\s*(.+?)\s*-->\s*$/;
const STATUS_RE = /^\s*<!--\s*status:/;
const HEADING_RE = /^#{1,6}\s/;
const GROUP_HEADING_RE = /^##\s+(\d+)\./;
const METADATA_SETTERS: Record<string, (item: TaskItem, value: string) => void> = {
  status: (item, value) => Object.assign(item, { status: value }),
  verify_cmd: (item, value) => Object.assign(item, { verifyCmd: value }),
  verify_surface: (item, value) => Object.assign(item, { verifySurface: value }),
  manual_required: (item, value) => Object.assign(item, { manualRequired: value === "true" }),
};
export interface TaskItem {
  id: string;
  text: string;
  checked: boolean;
  coversId?: string;
  status?: string;
  verifyCmd?: string;
  verifySurface?: string;
  manualRequired?: boolean;
}
function parseCoversAnnotation(line: string): string | undefined {
  const match = line.match(COVERS_RE);
  if (!match) return undefined;
  const [, groupCapability, requirementTitle, scenarioTitle] = match;
  const slashIndex = groupCapability.indexOf("/");
  if (slashIndex === -1) return undefined;
  const group = groupCapability.slice(0, slashIndex);
  return buildScenarioId(group, groupCapability.slice(slashIndex + 1), requirementTitle, scenarioTitle);
}
const isContinuation = (line: string): boolean => !(CHECKBOX_RE.test(line) || HEADING_RE.test(line));
function deriveId(rest: string, fallbackIndex: number): { id: string; leadingText: string } {
  const idMatch = rest.match(ID_RE);
  return { id: idMatch ? idMatch[1] : String(fallbackIndex), leadingText: idMatch ? idMatch[2] : rest };
}
function parseItem(lines: string[], i: number, fallbackIndex: number): { item: TaskItem; next: number } {
  const checkbox = lines[i].match(CHECKBOX_RE) as RegExpMatchArray;
  const { id, leadingText } = deriveId(checkbox[2], fallbackIndex);
  const item: TaskItem = { id, text: "", checked: checkbox[1].toLowerCase() === "x", coversId: undefined };
  const textParts = [leadingText];
  let next = i + 1;
  while (next < lines.length && isContinuation(lines[next])) {
    const covers = parseCoversAnnotation(lines[next]);
    const meta = lines[next].match(METADATA_RE);
    if (covers) item.coversId = covers;
    else if (meta) METADATA_SETTERS[meta[1]](item, meta[2]);
    else if (lines[next].trim().length > 0) textParts.push(lines[next].trim());
    next++;
  }
  item.text = textParts.join(" ");
  return { item, next };
}
export function parseTasksMarkdown(content: string): TaskItem[] {
  const lines = content.split("\n");
  const items: TaskItem[] = [];
  let fallbackIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!CHECKBOX_RE.test(lines[i])) continue;
    fallbackIndex++;
    items.push(parseItem(lines, i, fallbackIndex).item);
  }
  return items;
}
export function parseTaskGroups(content: string): { id: string; items: TaskItem[] }[] {
  const lines = content.split("\n");
  const groups: { id: string; items: TaskItem[] }[] = [];
  let current: { id: string; items: TaskItem[] } | undefined;
  let fallbackIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(GROUP_HEADING_RE);
    if (heading) {
      current = { id: heading[1], items: [] };
      groups.push(current);
      continue;
    }
    if (!CHECKBOX_RE.test(lines[i])) continue;
    fallbackIndex++;
    if (current) current.items.push(parseItem(lines, i, fallbackIndex).item);
  }
  return groups;
}
function findTaskLine(lines: string[], taskId: string): number {
  let fallbackIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const checkbox = lines[i].match(CHECKBOX_RE);
    if (!checkbox) continue;
    fallbackIndex++;
    if (deriveId(checkbox[2], fallbackIndex).id === taskId) return i;
  }
  return -1;
}
function writeStatusComment(lines: string[], checkboxIndex: number, status: string): void {
  let next = checkboxIndex + 1;
  while (next < lines.length && isContinuation(lines[next])) {
    if (STATUS_RE.test(lines[next])) {
      lines[next] = `<!-- status: ${status} -->`;
      return;
    }
    next++;
  }
  lines.splice(checkboxIndex + 1, 0, `<!-- status: ${status} -->`);
}
export function writeTaskStatus(
  content: string,
  taskId: string,
  updates: { checked?: boolean; status?: string },
): string {
  const lines = content.split("\n");
  const index = findTaskLine(lines, taskId);
  if (index === -1) return content;
  if (updates.checked !== undefined) {
    lines[index] = lines[index].replace(CHECKBOX_RE, `- [${updates.checked ? "x" : " "}] $2`);
  }
  if (updates.status !== undefined) writeStatusComment(lines, index, updates.status);
  return lines.join("\n");
}
