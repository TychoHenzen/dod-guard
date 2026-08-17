import { promises as fs } from "node:fs";
import * as path from "node:path";

/** Writes a main-tree spec.md with one requirement and one scenario that no
 * test binds, at `openspec/specs/dod-guard/coverage-gate/spec.md` under `cwd`. */
export async function writeUnwiredCoverageGateSpec(cwd: string): Promise<void> {
  const mainSpec = path.join(cwd, "openspec", "specs", "dod-guard", "coverage-gate", "spec.md");
  await fs.mkdir(path.dirname(mainSpec), { recursive: true });
  await fs.writeFile(
    mainSpec,
    [
      "## Requirements",
      "",
      "### Requirement: cover reports a scenario's state",
      "",
      "#### Scenario: unwired",
      "- **WHEN** no test binds to a scenario",
      "- **THEN** cover reports it as unwired",
      "",
    ].join("\n"),
  );
}

/** Writes a single-scenario spec delta under `openspec/changes/<changeId>/specs/`,
 * so a change-scoped `enumerateChangeScenarios` finds at least one scenario. */
export async function writeChangeSpecDelta(cwd: string, changeId: string): Promise<void> {
  const deltaSpec = path.join(cwd, "openspec", "changes", changeId, "specs", "dod-guard", "coverage-gate", "spec.md");
  await fs.mkdir(path.dirname(deltaSpec), { recursive: true });
  await fs.writeFile(
    deltaSpec,
    [
      "## ADDED Requirements",
      "",
      "### Requirement: a new requirement",
      "",
      "#### Scenario: a new scenario",
      "- **WHEN** something happens",
      "- **THEN** something else happens",
      "",
    ].join("\n"),
  );
}

/** Writes `tasks.md` for a change at `openspec/changes/<changeId>/tasks.md`. */
export async function writeChangeTasks(cwd: string, changeId: string, content: string): Promise<void> {
  const tasksPath = path.join(cwd, "openspec", "changes", changeId, "tasks.md");
  await fs.mkdir(path.dirname(tasksPath), { recursive: true });
  await fs.writeFile(tasksPath, content);
}
