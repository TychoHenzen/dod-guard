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
