// Six scenarios from the obligation-count spec: keyword counting, delta
// arithmetic, scenario exclusion, case-insensitivity, and word-boundary
// safety against false positives like "marshall" or "should-not".

import { strictEqual } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { analyzeSpec, countObligations } from "./obligation-count.mjs";

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function writeSpec(contents) {
  const dir = mkdtempSync(join(tmpdir(), "obligation-count-"));
  temps.push(dir);
  const specPath = join(dir, "spec.md");
  writeFileSync(specPath, contents, "utf8");
  return specPath;
}

describe("obligation-count", () => {
  it("counts five obligations and one scenario, delta 4", () => {
    const specPath = writeSpec(
      [
        "### Requirement: Widget behavior",
        "The widget SHALL start. It SHALL stop. It SHALL pause. It SHALL resume. It SHALL reset.",
        "",
        "#### Scenario: Start",
        "- WHEN started THEN it runs",
        "",
      ].join("\n"),
    );
    const [result] = analyzeSpec(specPath);
    strictEqual(result.obligationCount, 5);
    strictEqual(result.scenarioCount, 1);
    strictEqual(result.delta, 4);
  });

  it("counts one obligation and three scenarios, delta -2", () => {
    const specPath = writeSpec(
      [
        "### Requirement: Widget behavior",
        "The widget MUST start.",
        "",
        "#### Scenario: Start",
        "- WHEN started THEN it runs",
        "",
        "#### Scenario: Stop",
        "- WHEN stopped THEN it halts",
        "",
        "#### Scenario: Pause",
        "- WHEN paused THEN it waits",
        "",
      ].join("\n"),
    );
    const [result] = analyzeSpec(specPath);
    strictEqual(result.obligationCount, 1);
    strictEqual(result.scenarioCount, 3);
    strictEqual(result.delta, -2);
  });

  it("returns zero for a body with no RFC 2119 keywords", () => {
    strictEqual(countObligations("The widget does something useful."), 0);
  });

  it("excludes obligation keywords inside scenario blocks", () => {
    const specPath = writeSpec(
      [
        "### Requirement: Widget behavior",
        "The widget SHALL start.",
        "",
        "#### Scenario: Start",
        "- WHEN started, the widget SHALL log the event and SHALL notify listeners",
        "",
      ].join("\n"),
    );
    const [result] = analyzeSpec(specPath);
    strictEqual(result.obligationCount, 1);
  });

  it("matches obligation keywords case-insensitively", () => {
    strictEqual(countObligations("It shall run. It Shall stop. It SHALL reset."), 3);
  });

  it("does not match keywords inside larger words", () => {
    strictEqual(countObligations("The marshall filed a should-not case for OPTIONAL_FLAG."), 0);
  });
});
