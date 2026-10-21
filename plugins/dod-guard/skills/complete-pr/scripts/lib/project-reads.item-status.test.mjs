// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertProjectShapeStop, PROJECT_ITEM_ENDPOINT } from "./fixtures/project-reads-runners.mjs";
import { linkedProjectItem, PROJECT_STATUS_FIELD_ID } from "./fixtures/project-status-items.mjs";
import { createProjectStatusReader, statusReaderWithFields } from "./fixtures/project-status-reader.mjs";

test("rejects missing, blank, and contradictory Status values", () => {
  const responses = [
    { fields: [] },
    { fields: [{ id: PROJECT_STATUS_FIELD_ID, name: "Status", value: { name: { raw: "   " } } }] },
    {
      fields: [
        {
          id: PROJECT_STATUS_FIELD_ID,
          name: "Status",
          value: { name: { raw: "Done", html: "In Progress" } },
        },
      ],
    },
  ];

  for (const itemResponse of responses) {
    const { read } = createProjectStatusReader({
      itemResponses: new Map([
        [
          "2/1701",
          {
            ...linkedProjectItem(1701),
            ...itemResponse,
          },
        ],
      ]),
    });
    assert.throws(() => read(24), /Status field\/value/);
  }
});

test("pins every Status field/value stop text and code on the item readback", () => {
  const cases = [
    [[], "exactly one Status field/value"],
    [[{ id: 999, name: "Status", value: { name: "Done" } }], "exactly one Status field/value"],
    [[{ id: PROJECT_STATUS_FIELD_ID, name: "Priority", value: { name: "Done" } }], "exactly one Status field/value"],
    [[{ id: PROJECT_STATUS_FIELD_ID, name: "Status" }], "exactly one non-blank Status field/value"],
    [[{ id: PROJECT_STATUS_FIELD_ID, name: "Status", value: null }], "exactly one non-blank Status field/value"],
    [
      [{ id: PROJECT_STATUS_FIELD_ID, name: "Status", value: { id: "done" } }],
      "exactly one non-blank Status field/value",
    ],
    [
      [{ id: PROJECT_STATUS_FIELD_ID, name: "Status", value: { name: { raw: " " } } }],
      "exactly one non-blank Status field/value",
    ],
    [
      [{ id: PROJECT_STATUS_FIELD_ID, name: "Status", value: { name: { raw: "Done", html: "Todo" } } }],
      "one non-contradictory Status field/value",
    ],
  ];
  for (const [fields, detail] of cases) {
    assertProjectShapeStop(() => statusReaderWithFields(fields)(24), PROJECT_ITEM_ENDPOINT, detail);
  }
});

test("reads a Status spelled as a bare string, as {name}, or as {name: {raw, html}}", () => {
  const spellings = ["Done", { name: "Done" }, { name: { raw: "Done", html: "Done" } }];
  for (const value of spellings) {
    const read = statusReaderWithFields([{ id: PROJECT_STATUS_FIELD_ID, name: "status", value }]);
    assert.deepEqual(read(24), ["Done"]);
  }
});
