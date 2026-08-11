import assert from "node:assert/strict";
import { test } from "node:test";
import type { TaskNode } from "../types.js";
import { dodTreeToSteps } from "./steps.js";

interface LeafSpec {
  id: string;
  title: string;
  command: string;
  description: string;
}

function concreteLeaf(spec: LeafSpec): TaskNode {
  return {
    ...spec,
    refinement: "concrete",
    predicate: { type: "exit_code", value: 0 },
    category: "other",
    last_status: "pending",
  };
}

function group(id: string, title: string, children: TaskNode[]): TaskNode {
  return {
    id,
    title,
    refinement: "draft",
    children,
    last_status: "draft",
  };
}

test("dodTreeToSteps copies a concrete leaf's command into verify_cmd unchanged", () => {
  const roots = [
    group("req-0", "Build passes", [
      concreteLeaf({ id: "req-0-scenario-0", title: "Tests run", command: "npm test", description: "runs the suite" }),
    ]),
  ];

  const steps = dodTreeToSteps(roots);

  assert.equal(steps.length, 1);
  assert.equal(steps[0]?.verify_cmd, "npm test");
});

test("dodTreeToSteps carries the leaf's title and description onto the step", () => {
  const roots = [
    group("req-0", "Build passes", [
      concreteLeaf({
        id: "req-0-scenario-0",
        title: "Tests run clean",
        command: "npm test",
        description: "the suite exits zero",
      }),
    ]),
  ];

  const steps = dodTreeToSteps(roots);

  assert.equal(steps[0]?.title, "Tests run clean");
  assert.equal(steps[0]?.description, "the suite exits zero");
});

test("dodTreeToSteps keeps leaves under one group in source order", () => {
  const roots = [
    group("req-0", "Build passes", [
      concreteLeaf({ id: "req-0-scenario-0", title: "First", command: "npm run first", description: "first" }),
      concreteLeaf({ id: "req-0-scenario-1", title: "Second", command: "npm run second", description: "second" }),
      concreteLeaf({ id: "req-0-scenario-2", title: "Third", command: "npm run third", description: "third" }),
    ]),
  ];

  const steps = dodTreeToSteps(roots);

  assert.deepEqual(
    steps.map((s) => s.title),
    ["First", "Second", "Third"],
  );
});

test("dodTreeToSteps chains each step's deps to the step before it, first step deps empty", () => {
  const roots = [
    group("req-0", "Build passes", [
      concreteLeaf({ id: "req-0-scenario-0", title: "First", command: "npm run first", description: "first" }),
      concreteLeaf({ id: "req-0-scenario-1", title: "Second", command: "npm run second", description: "second" }),
    ]),
    group("req-1", "Lint passes", [
      concreteLeaf({ id: "req-1-scenario-0", title: "Third", command: "npm run third", description: "third" }),
    ]),
  ];

  const steps = dodTreeToSteps(roots);

  assert.deepEqual(steps[0]?.deps, []);
  assert.deepEqual(steps[1]?.deps, ["req-0-scenario-0"]);
  assert.deepEqual(steps[2]?.deps, ["req-0-scenario-1"]);
});

test("dodTreeToSteps sets every generated step's status to pending", () => {
  const roots = [
    group("req-0", "Build passes", [
      concreteLeaf({ id: "req-0-scenario-0", title: "First", command: "npm run first", description: "first" }),
      concreteLeaf({ id: "req-0-scenario-1", title: "Second", command: "npm run second", description: "second" }),
    ]),
  ];

  const steps = dodTreeToSteps(roots);

  assert.ok(steps.every((s) => s.status === "pending"));
});

test("dodTreeToSteps skips draft leaves", () => {
  const draftLeaf: TaskNode = {
    id: "req-0-scenario-0",
    title: "Needs a human",
    refinement: "draft",
    intent: "MANUAL: someone reads it",
    last_status: "draft",
  };
  const roots = [group("req-0", "Prose quality", [draftLeaf])];

  const steps = dodTreeToSteps(roots);

  assert.equal(steps.length, 0);
});
