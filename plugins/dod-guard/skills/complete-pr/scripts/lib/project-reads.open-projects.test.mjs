// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertProjectShapeStop, PROJECTS_ENDPOINT } from "./fixtures/project-reads-runners.mjs";
import { linkedProjectItem, PROJECT_STATUS_FIELD_ID, projectStatusResponse } from "./fixtures/project-status-items.mjs";
import { createProjectStatusReader } from "./fixtures/project-status-reader.mjs";

test("rejects contradictory repository identity casing before status readback", () => {
  const contradictory = linkedProjectItem(1701);
  contradictory.content.repository.fullName = "other/repo";
  const { read, calls } = createProjectStatusReader({
    itemsByProject: new Map([["2", [contradictory]]]),
  });

  assert.throws(() => read(24), /one non-contradictory repository identity/);
  assert.equal(
    calls.some((args) => args.some((value) => String(value).includes("/fields?"))),
    false,
  );
  assert.equal(
    calls.some((args) => args.some((value) => String(value).includes("/items/1701?fields="))),
    false,
  );
});

test("rejects two open linked Projects even when their statuses disagree", () => {
  const { read, calls } = createProjectStatusReader({
    projects: [
      { number: 2, state: "open" },
      { number: 3, state: "open" },
    ],
    itemsByProject: new Map([
      ["2", [linkedProjectItem(1701)]],
      ["3", [linkedProjectItem(1702)]],
    ]),
    fieldsByProject: new Map([
      ["2", [{ id: PROJECT_STATUS_FIELD_ID, name: "Status" }]],
      ["3", [{ id: PROJECT_STATUS_FIELD_ID, name: "Status" }]],
    ]),
    itemResponses: new Map([
      ["2/1701", projectStatusResponse("Done")],
      ["3/1702", projectStatusResponse("In Progress")],
    ]),
  });

  assert.throws(() => read(24), /exactly one open linked Project/);
  assert.equal(
    calls.some((args) => args.some((value) => String(value).includes("/fields?"))),
    false,
  );
});

test("rejects duplicate matching issue items before status readback", () => {
  const { read, calls } = createProjectStatusReader({
    itemsByProject: new Map([["2", [linkedProjectItem(1701), linkedProjectItem(1702)]]]),
  });

  assert.throws(() => read(24), /exactly one matching issue item/);
  assert.equal(
    calls.some((args) => args.some((value) => String(value).includes("/fields?"))),
    false,
  );
});

test("stops with the zero-linked-Project text when no open Project holds the issue", () => {
  // The closed Project has no items, so reading them would still end in this stop and only the
  // items-read check can catch it.
  const cases = [
    [{ projects: [] }, false],
    [{ itemsByProject: new Map([["2", [linkedProjectItem(1701, 25)]]]) }, true],
    [{ projects: [{ number: 2, state: "closed" }], itemsByProject: new Map([["2", []]]) }, false],
  ];
  for (const [options, readsItems] of cases) {
    const { read, calls } = createProjectStatusReader(options);
    assertProjectShapeStop(() => read(24), PROJECTS_ENDPOINT, "exactly one open linked Project");
    const requested = (fragment) => calls.some((args) => args.some((value) => String(value).includes(fragment)));
    assert.equal(requested("/fields?"), false);
    assert.equal(requested("/items?"), readsItems);
  }
});

test("stops on a listed Project without a number or an explicit state, and accepts a numeric string number", () => {
  const cases = [
    [[{ state: "open" }], "an array projects with a number"],
    [[{ number: 2 }], "projects with an explicit state"],
    [[{ number: 2, state: " " }], "projects with an explicit state"],
    [[{ number: 3, state: "closed" }, { state: "closed" }], "an array projects with a number"],
  ];
  for (const [projects, detail] of cases) {
    const { read } = createProjectStatusReader({ projects });
    assertProjectShapeStop(() => read(24), PROJECTS_ENDPOINT, detail);
  }
  const { read } = createProjectStatusReader({ projects: [{ number: "2", state: "OPEN" }] });
  assert.deepEqual(read(24), ["Done"]);
});
