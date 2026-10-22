import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowLabelsPath = new URL("./workflow-labels.json", import.meta.url);
const EXPECTED_WORKFLOW_LABELS = [
  ["Prio 1 - Emergency", "Critical/Urgent issue, requires immediate action.", "b60205"],
  ["Prio 2 - Urgent", "Serious issues or important milestones that heavily impact progress", "fbca04"],
  ["Prio 3 - Standard", "Moderate tasks or minor issues not halting overall progress.", "0e8a16"],
  ["Prio 4 - Non-Urgent", "Minor inconveniences, cosmetic fixes, or standard requests", "006b75"],
  ["Prio 5 - Planned", "Proactive improvements, exploratory tasks, or routine updates", "1d76db"],
  ["Prio 6 - Unknown", "priority can not be assessed at this point, requires re-evaluation later", "FF00FF"],
  ["Effort 1 - Trivial", "Tiny task. Extremely clear, zero risk, takes minutes to a couple of hours.", "1d76db"],
  ["Effort 2 - Easy", "Simple task. Well-understood with minimal effort or risk", "006b75"],
  ["Effort 3 - Medium", "Average task. About a day of work with minor unknowns.", "0e8a16"],
  ["Effort 5 - Large", "Complex task. Requires significant effort or has notable dependencies.", "fbca04"],
  ["Effort 8 - Huge", "Very complex. Hard to estimate accurately; often needs to be broken down.", "d93f0b"],
  ["Effort 13 - Epic", "Too big to implement. Must be split into smaller issues before development.", "b60205"],
  ["bug", "Something isn't working", "d73a4a"],
  ["documentation", "Improvements or additions to documentation", "0075ca"],
  ["duplicate", "This issue or pull request already exists", "cfd3d7"],
  ["enhancement", "New feature or request", "a2eeef"],
  ["good first issue", "Good for newcomers", "7057ff"],
  ["help wanted", "Extra attention is needed", "008672"],
  ["invalid", "This doesn't seem right", "e4e669"],
  ["question", "Further information is requested", "d876e3"],
  ["wontfix", "This will not be worked on", "ffffff"],
].map(([name, description, color]) => ({ name, description, color }));

test("ships the canonical workflow labels while preserving repository-specific labels", async () => {
  const labels = JSON.parse(await readFile(workflowLabelsPath, "utf8"));

  assert.deepEqual(labels, EXPECTED_WORKFLOW_LABELS);
});
