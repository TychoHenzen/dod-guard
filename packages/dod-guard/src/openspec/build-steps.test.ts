// Requirement: none - see Task
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScenarioReport } from "../cover/report.js";
import { buildSteps } from "./build-steps.js";
import type { TaskItem } from "./tasks-parser.js";

function item(id: string, coversId?: string): TaskItem {
  return { id, text: `text for ${id}`, checked: false, coversId };
}

function report(scenarioId: string, outcome: ScenarioReport["outcome"], runCommand?: string): ScenarioReport {
  return {
    scenarioId,
    group: "g",
    capability: "c",
    requirementTitle: "r",
    scenarioTitle: "s",
    outcome,
    note: "",
    runCommand,
  };
}

test("an item with no covers annotation becomes a manual step", () => {
  const [step] = buildSteps([item("1.1")], []);
  assert.equal(step.manual_required, true);
  assert.equal(step.verify_cmd, "");
});

test("an item covering a covered-and-integrated scenario gets its run command", () => {
  const steps = buildSteps(
    [item("1.1", "g/c::r||s")],
    [report("g/c::r||s", "covered-and-integrated", "node --test dist/x.test.js")],
  );
  assert.equal(steps[0].manual_required, false);
  assert.equal(steps[0].verify_cmd, "node --test dist/x.test.js");
});

test("an item covering a covered-but-not-integrated scenario also gets its run command", () => {
  const steps = buildSteps(
    [item("1.1", "g/c::r||s")],
    [report("g/c::r||s", "covered-but-not-integrated", "node --test dist/x.test.js")],
  );
  assert.equal(steps[0].manual_required, false);
  assert.equal(steps[0].verify_cmd, "node --test dist/x.test.js");
});

test("an item covering an unwired scenario stays manual", () => {
  const steps = buildSteps([item("1.1", "g/c::r||s")], [report("g/c::r||s", "unwired")]);
  assert.equal(steps[0].manual_required, true);
  assert.equal(steps[0].verify_cmd, "");
});

test("an item covering a failed scenario stays manual", () => {
  const steps = buildSteps(
    [item("1.1", "g/c::r||s")],
    [report("g/c::r||s", "failed", "node --test dist/x.test.js")],
  );
  assert.equal(steps[0].manual_required, true);
  assert.equal(steps[0].verify_cmd, "");
});

test("an item's coversId naming no report in coverReports stays manual", () => {
  const steps = buildSteps([item("1.1", "g/c::r||missing")], [report("g/c::r||s", "covered-and-integrated", "x")]);
  assert.equal(steps[0].manual_required, true);
});

test("steps keep source order and each depends on the one before it", () => {
  const steps = buildSteps([item("1.1"), item("1.2"), item("2.1")], []);
  assert.deepEqual(
    steps.map((s) => s.id),
    ["1.1", "1.2", "2.1"],
  );
  assert.deepEqual(steps[0].deps, []);
  assert.deepEqual(steps[1].deps, ["1.1"]);
  assert.deepEqual(steps[2].deps, ["1.2"]);
});

test("every step starts with empty files, code surface, and pending status", () => {
  const [step] = buildSteps([item("1.1")], []);
  assert.deepEqual(step.files, []);
  assert.equal(step.verify_surface, "code");
  assert.equal(step.status, "pending");
});
