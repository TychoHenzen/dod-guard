// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  buildProjectItemEditCommand,
  writeProjectStatuses,
  writeProjectStatusesWithFallback,
} from "./project-status.mjs";

const PROJECT_ID = "PVT_projectnode";
const STATUS_FIELD_NODE_ID = "PVTSSF_status-field";
const STATUS_FIELD_ID = 407767889;
const STATUS_OPTION_ID = "98236657";
const ITEM_IDS = ["PVTI_child-one", "PVTI_child-two", "PVTI_parent"];
const ITEM_NUMERIC_IDS = new Map(ITEM_IDS.map((itemId, index) => [itemId, 256202820 + index]));
const NUMERIC_PROJECT_ID_ERROR = /global ProjectV2 node ID/;
const STATUS_FIELD_ERROR = /exactly one REST field/;
const READBACK_ERROR = /PVTI_child-two.*read back Todo/;

function projectFields() {
  return [{
    id: STATUS_FIELD_ID,
    node_id: STATUS_FIELD_NODE_ID,
    name: "Status",
    data_type: "single_select",
    options: [
      { id: "30a230f4", name: { raw: "Backlog" } },
      { id: "f75ad846", name: { raw: "Todo" } },
      { id: "47fc9ee4", name: { raw: "In Progress" } },
      { id: STATUS_OPTION_ID, name: { raw: "Done" } },
    ],
  }];
}

function projectItems(statuses) {
  return [...statuses].map(([nodeId, status]) => ({
    id: ITEM_NUMERIC_IDS.get(nodeId),
    node_id: nodeId,
    fields: [{
      id: STATUS_FIELD_ID,
      name: "Status",
      data_type: "single_select",
      value: { id: STATUS_OPTION_ID, name: { raw: status } },
    }],
  }));
}

function createRunner({ projectId = PROJECT_ID, statuses = new Map(ITEM_IDS.map((itemId) => [itemId, "Backlog"])), splitItems = false, fields = projectFields() } = {}) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    assert.equal(args[0], "api");
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("users/"));
    if (endpoint === "users/TychoHenzen/projectsV2/2") {
      return { status: 0, stderr: "", stdout: JSON.stringify({ node_id: projectId }) };
    }
    if (endpoint === "users/TychoHenzen/projectsV2/2/fields?per_page=100") {
      return { status: 0, stderr: "", stdout: JSON.stringify([fields]) };
    }
    if (endpoint?.startsWith("users/TychoHenzen/projectsV2/2/items?") === true) {
      const items = projectItems(statuses);
      const pages = splitItems ? [items.slice(0, 1), items.slice(1)] : [items];
      return { status: 0, stderr: "", stdout: JSON.stringify(pages) };
    }
    if (endpoint?.startsWith("users/TychoHenzen/projectsV2/2/items/") === true && args.includes("PATCH")) {
      const itemId = [...ITEM_NUMERIC_IDS.entries()].find(([, numericId]) => endpoint.endsWith(String(numericId)))?.[0];
      const statusOptionId = args.find((value) => String(value).startsWith("fields[][value]="))?.split("=", 2)[1];
      const status = projectFields()[0].options.find((option) => option.id === statusOptionId)?.name.raw;
      statuses.set(itemId, status);
      return { status: 0, stderr: "", stdout: "" };
    }
    if (endpoint?.startsWith("users/TychoHenzen/projectsV2/2/items/") === true) {
      return { status: 200, stderr: "", stdout: "" };
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, runner };
}

function writeOptions(overrides = {}) {
  return {
    owner: "TychoHenzen",
    projectNumber: 2,
    statusFieldId: STATUS_FIELD_NODE_ID,
    statusOptionId: STATUS_OPTION_ID,
    expectedStatus: "Done",
    itemIds: ITEM_IDS,
    ...overrides,
  };
}

test("writes REST single-select updates in child-before-parent order with readback", () => {
  const { calls, runner } = createRunner({ splitItems: true });

  const result = writeProjectStatuses({ ...writeOptions(), commandRunner: runner });

  assert.equal(result.projectId, PROJECT_ID);
  assert.deepEqual(result.mutations, ITEM_IDS.map((itemId) => ({ itemId, status: "Done" })));
  assert.deepEqual(
    calls.filter((args) => args.includes("PATCH")).map((args) => args[3].split("/").at(-1)),
    [...ITEM_NUMERIC_IDS.values()].map(String),
  );
  assert.deepEqual(calls.filter((args) => args.includes("PATCH"))[0], buildProjectItemEditCommand({
    owner: "TychoHenzen",
    projectNumber: 2,
    itemId: String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0])),
    statusFieldId: String(STATUS_FIELD_ID),
    statusOptionId: STATUS_OPTION_ID,
  }));
  assert.equal(calls.filter((args) => args.some((value) => String(value).includes("/items?"))).length, ITEM_IDS.length + 1);
  assert.equal(calls.every((args) => args[0] === "api"), true);
  assert.equal(calls.some((args) => args.some((value) => /graphql|project( |$)|item-edit|item-list|issue view/i.test(String(value)))), false);
  const itemReads = calls.filter((args) => args.some((value) => String(value).includes("/items?")));
  assert.equal(itemReads.every((args) => args.includes("--paginate") && args.includes("--slurp")), true);
  assert.equal(itemReads.every((args) => !args.some((value) => /[?&]page=/.test(String(value)))), true);
});

test("consumes every Link-paginated item page before resolving target IDs", () => {
  const calls = [];
  const firstPage = projectItems(new Map([[ITEM_IDS[0], "Done"]]));
  const secondPage = projectItems(new Map([[ITEM_IDS[1], "Done"], [ITEM_IDS[2], "Done"]]));
  const runner = (args) => {
    calls.push(args);
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("users/"));
    if (endpoint === "users/TychoHenzen/projectsV2/2") {
      return { status: 0, stderr: "", stdout: JSON.stringify({ node_id: PROJECT_ID }) };
    }
    if (endpoint === "users/TychoHenzen/projectsV2/2/fields?per_page=100") {
      return { status: 0, stderr: "", stdout: JSON.stringify([projectFields()]) };
    }
    if (endpoint?.startsWith("users/TychoHenzen/projectsV2/2/items?")) {
      return { status: 0, stderr: "", stdout: JSON.stringify([firstPage, secondPage]) };
    }
    if (endpoint?.startsWith("users/TychoHenzen/projectsV2/2/items/")) {
      const itemId = endpoint.includes(String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]))) ? ITEM_IDS[0] : ITEM_IDS[1];
      return { status: 0, stderr: "", stdout: JSON.stringify(projectItems(new Map([[itemId, "Done"]]))[0]) };
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };

  writeProjectStatuses({ ...writeOptions({ itemIds: ITEM_IDS.slice(0, 2) }), commandRunner: runner });

  const itemReads = calls.filter((args) => args.some((value) => String(value).includes("/items?")));
  assert.equal(itemReads.length, 1);
  assert.equal(itemReads.every((args) => args.includes("--paginate") && args.includes("--slurp")), true);
  assert.equal(itemReads.every((args) => !args.some((value) => /[?&]page=/.test(String(value)))), true);
});

test("does not PATCH a Project item already at the requested status", () => {
  const { calls, runner } = createRunner({ statuses: new Map([[ITEM_IDS[0], "Done"]]) });

  const result = writeProjectStatuses({ ...writeOptions({ itemIds: [ITEM_IDS[0]] }), commandRunner: runner });

  assert.deepEqual(result.mutations, [{ itemId: ITEM_IDS[0], status: "Done" }]);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 0);
  assert.equal(calls.filter((args) => args.some((value) => String(value).includes("/items?"))).length, 1);
});

test("reads back after an ambiguous status write and never retries it", () => {
  const { calls, runner } = createRunner({ statuses: new Map([[ITEM_IDS[0], "Backlog"]]) });
  const ambiguousRunner = (args) => {
    if (args.includes("PATCH")) {
      runner(args);
      throw new Error("status write timed out");
    }
    return runner(args);
  };

  const result = writeProjectStatuses({ ...writeOptions({ itemIds: [ITEM_IDS[0]] }), commandRunner: ambiguousRunner });

  assert.deepEqual(result.mutations, [{ itemId: ITEM_IDS[0], status: "Done" }]);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);
});

test("stops after an ambiguous status write lacks the desired readback", () => {
  const { calls, runner } = createRunner({ statuses: new Map([[ITEM_IDS[0], "Backlog"]]) });
  const failedRunner = (args) => {
    if (args.includes("PATCH")) {
      calls.push([...args]);
      throw new Error("status write timed out");
    }
    return runner(args);
  };

  assert.throws(
    () => writeProjectStatuses({ ...writeOptions({ itemIds: [ITEM_IDS[0]] }), commandRunner: failedRunner }),
    /status mutation failed.*read back Backlog, expected Done/,
  );
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);
});

test("rejects malformed or partial initial readbacks before any PATCH", () => {
  for (const replacement of [
    JSON.stringify({ items: [] }),
    JSON.stringify([[]]),
    JSON.stringify([[{ id: ITEM_NUMERIC_IDS.get(ITEM_IDS[0]), node_id: ITEM_IDS[0] }]]),
  ]) {
    const { calls, runner } = createRunner({ statuses: new Map([[ITEM_IDS[0], "Backlog"]]) });
    const malformedRunner = (args) => {
      const result = runner(args);
      const endpoint = args.find((value) => typeof value === "string" && value.startsWith("users/"));
      if (endpoint?.startsWith("users/TychoHenzen/projectsV2/2/items?")) return { ...result, stdout: replacement };
      return result;
    };

    assert.throws(
      () => writeProjectStatuses({ ...writeOptions({ itemIds: [ITEM_IDS[0]] }), commandRunner: malformedRunner }),
      /Project item readback|Status field\/value|missing from readback/,
    );
    assert.equal(calls.some((args) => args.includes("PATCH")), false);
  }
});

test("rejects duplicate or missing Project item identities before any PATCH", () => {
  for (const items of [
    [projectItems(new Map([[ITEM_IDS[0], "Done"]]))[0], projectItems(new Map([[ITEM_IDS[0], "Done"]]))[0]],
    [projectItems(new Map([[ITEM_IDS[0], "Done"]]))[0]],
  ]) {
    const { calls, runner } = createRunner({ statuses: new Map([[ITEM_IDS[0], "Done"]]), splitItems: false });
    const originalRunner = runner;
    const recordingRunner = (args) => {
      const endpoint = args.find((value) => typeof value === "string" && value.startsWith("users/"));
      if (endpoint?.startsWith("users/TychoHenzen/projectsV2/2/items?")) {
        const base = originalRunner(args);
        return { ...base, stdout: JSON.stringify([items]) };
      }
      return originalRunner(args);
    };
    assert.throws(
      () => writeProjectStatuses({ ...writeOptions({ itemIds: [ITEM_IDS[0], ITEM_IDS[1]] }), commandRunner: recordingRunner }),
      /Project item|missing from readback|appeared more than once/,
    );
    assert.equal(calls.some((args) => args.includes("PATCH")), false);
  }
});

test("stops when a Project item readback changes the resolved REST item ID", () => {
  const { calls, runner } = createRunner({ statuses: new Map(ITEM_IDS.map((itemId) => [itemId, "Backlog"])) });
  let itemReadCount = 0;
  const staleRunner = (args) => {
    const result = runner(args);
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("users/"));
    if (endpoint?.startsWith("users/TychoHenzen/projectsV2/2/items?") && itemReadCount++ > 0) {
      const [page] = JSON.parse(result.stdout);
      page[0].id += 1_000;
      return { ...result, stdout: JSON.stringify([page]) };
    }
    return result;
  };

  assert.throws(
    () => writeProjectStatuses({ ...writeOptions({ itemIds: ITEM_IDS.slice(0, 2) }), commandRunner: staleRunner }),
    /same numeric and global IDs/,
  );
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);
});

test("maps REST field and option IDs before issuing a PATCH", () => {
  const { calls, runner } = createRunner();

  writeProjectStatuses({ ...writeOptions({ itemIds: [ITEM_IDS[0]] }), commandRunner: runner });

  const patch = calls.find((args) => args.includes("PATCH"));
  assert.deepEqual(patch, buildProjectItemEditCommand({
    owner: "TychoHenzen",
    projectNumber: 2,
    itemId: String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0])),
    statusFieldId: String(STATUS_FIELD_ID),
    statusOptionId: STATUS_OPTION_ID,
  }));
});

test("rejects a numeric project response before any status write", () => {
  const { calls, runner } = createRunner({ projectId: "2" });

  assert.throws(() => writeProjectStatuses({ ...writeOptions({ itemIds: [ITEM_IDS[0]] }), commandRunner: runner }), NUMERIC_PROJECT_ID_ERROR);
  assert.equal(calls.some((args) => args.includes("PATCH")), false);
});

test("rejects duplicate item IDs before resolving or writing", () => {
  const { calls, runner } = createRunner();

  assert.throws(() => writeProjectStatuses({
    ...writeOptions({ itemIds: [ITEM_IDS[0], ITEM_IDS[0], ITEM_IDS[2]] }),
    commandRunner: runner,
  }), /unique item IDs/);
  assert.equal(calls.length, 0);
});

test("rejects a missing or mismatched status option before any status write", () => {
  const { calls, runner } = createRunner();

  assert.throws(() => writeProjectStatuses({
    ...writeOptions({ statusOptionId: "missing-option", itemIds: [ITEM_IDS[0]] }),
    commandRunner: runner,
  }), /must map to Done/);
  assert.equal(calls.some((args) => args.includes("PATCH")), false);
});

test("rejects missing or ambiguous REST status fields before any status write", () => {
  for (const fields of [[], [...projectFields(), ...projectFields()]]) {
    const { calls, runner } = createRunner({ fields });

    assert.throws(() => writeProjectStatuses({
      ...writeOptions({ itemIds: [ITEM_IDS[0]] }),
      commandRunner: runner,
    }), STATUS_FIELD_ERROR);
    assert.equal(calls.some((args) => args.includes("PATCH")), false);
  }
});

test("stops after a failed item readback and does not write the next item", () => {
  const statuses = new Map([
    [ITEM_IDS[0], "Done"],
    [ITEM_IDS[1], "Todo"],
    [ITEM_IDS[2], "Done"],
  ]);
  const { calls, runner } = createRunner({ statuses });
  const failedRunner = (args) => {
    const result = runner(args);
    if (args.includes("PATCH") && args.some((value) => String(value).endsWith(String(ITEM_NUMERIC_IDS.get(ITEM_IDS[1]))))) {
      statuses.set(ITEM_IDS[1], "Todo");
    }
    return result;
  };

  assert.throws(() => writeProjectStatuses({ ...writeOptions(), commandRunner: failedRunner }), READBACK_ERROR);
  assert.deepEqual(
    calls.filter((args) => args.includes("PATCH")).map((args) => args[3].split("/").at(-1)),
    [String(ITEM_NUMERIC_IDS.get(ITEM_IDS[1]))],
  );
  assert.equal(calls.filter((args) => args.some((value) => String(value).includes("/items?"))).length, 2);
});

test("routes MCP rate-limit writes through guarded REST readback without duplicate PATCHes", async () => {
  for (const failure of [
    Object.assign(new Error("API rate limit exceeded"), { status: 429 }),
    Object.assign(new Error("API rate limit exceeded token=secret"), {
      status: 403,
      headers: { "X-RateLimit-Reset": "1700000000" },
    }),
  ]) {
    const { calls, runner } = createRunner({ statuses: new Map([[ITEM_IDS[0], "Backlog"]]) });
    const evidence = [];
    let primaryCalls = 0;
    const result = await writeProjectStatusesWithFallback({
      ...writeOptions({ itemIds: [ITEM_IDS[0]] }),
      commandRunner: runner,
      evidence,
      primaryMutation: async () => {
        primaryCalls += 1;
        throw failure;
      },
    });

    assert.equal(result.transport, "rest");
    assert.equal(primaryCalls, 1);
    assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);
    assert.deepEqual(result.value.mutations, [{ itemId: ITEM_IDS[0], status: "Done" }]);
    assert.equal(evidence[0].failure.category, "mcp_rate_limit");
    assert.doesNotMatch(evidence[0].failure.message, /secret/);
  }

  const statuses = new Map([[ITEM_IDS[0], "Backlog"]]);
  const { calls, runner } = createRunner({ statuses });
  const result = await writeProjectStatusesWithFallback({
    ...writeOptions({ itemIds: [ITEM_IDS[0]] }),
    commandRunner: runner,
    primaryMutation: async () => {
      statuses.set(ITEM_IDS[0], "Done");
      throw Object.assign(new Error("API rate limit exceeded"), { status: 429 });
    },
  });
  assert.equal(result.transport, "rest");
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 0);

  const unresolvedStatuses = new Map([[ITEM_IDS[0], "Backlog"]]);
  const unresolved = createRunner({ statuses: unresolvedStatuses });
  const unresolvedRunner = (args) => {
    const value = unresolved.runner(args);
    if (args.includes("PATCH")) unresolvedStatuses.set(ITEM_IDS[0], "Backlog");
    return value;
  };
  await assert.rejects(
    writeProjectStatusesWithFallback({
      ...writeOptions({ itemIds: [ITEM_IDS[0]] }),
      commandRunner: unresolvedRunner,
      primaryMutation: async () => {
        throw Object.assign(new Error("API rate limit exceeded"), { status: 429 });
      },
    }),
    (error) => error.details.restFailure.message.includes("read back Backlog, expected Done"),
  );
  assert.equal(unresolved.calls.filter((args) => args.includes("PATCH")).length, 1);
});
