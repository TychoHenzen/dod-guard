import process from "node:process";
import { pathToFileURL } from "node:url";

export const WORKFLOW_LABELS = [
  { name: "Prio 1 - Emergency", description: "Critical/Urgent issue, requires immediate action.", color: "b60205" },
  { name: "Prio 2 - Urgent", description: "Serious issues or important milestones that heavily impact progress", color: "fbca04" },
  { name: "Prio 3 - Standard", description: "Moderate tasks or minor issues not halting overall progress.", color: "0e8a16" },
  { name: "Prio 4 - Non-Urgent", description: "Minor inconveniences, cosmetic fixes, or standard requests", color: "006b75" },
  { name: "Prio 5 - Planned", description: "Proactive improvements, exploratory tasks, or routine updates", color: "1d76db" },
  { name: "Prio 6 - Unknown", description: "priority can not be assessed at this point, requires re-evaluation later", color: "FF00FF" },
  { name: "Effort 1 - Trivial", description: "Tiny task. Extremely clear, zero risk, takes minutes to a couple of hours.", color: "1d76db" },
  { name: "Effort 2 - Easy", description: "Simple task. Well-understood with minimal effort or risk", color: "006b75" },
  { name: "Effort 3 - Medium", description: "Average task. About a day of work with minor unknowns.", color: "0e8a16" },
  { name: "Effort 5 - Large", description: "Complex task. Requires significant effort or has notable dependencies.", color: "fbca04" },
  { name: "Effort 8 - Huge", description: "Very complex. Hard to estimate accurately; often needs to be broken down.", color: "d93f0b" },
  { name: "Effort 13 - Epic", description: "Too big to implement. Must be split into smaller issues before development.", color: "b60205" },
  { name: "bug", description: "Something isn't working", color: "d73a4a" },
  { name: "documentation", description: "Improvements or additions to documentation", color: "0075ca" },
  { name: "duplicate", description: "This issue or pull request already exists", color: "cfd3d7" },
  { name: "enhancement", description: "New feature or request", color: "a2eeef" },
  { name: "good first issue", description: "Good for newcomers", color: "7057ff" },
  { name: "help wanted", description: "Extra attention is needed", color: "008672" },
  { name: "invalid", description: "This doesn't seem right", color: "e4e669" },
  { name: "question", description: "Further information is requested", color: "d876e3" },
  { name: "wontfix", description: "This will not be worked on", color: "ffffff" },
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(WORKFLOW_LABELS, null, 2)}\n`);
}
