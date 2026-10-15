// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";
import { runGh } from "./lib/gh-runner.mjs";
import {
  buildProjectItemEditCommand,
  buildProjectItemReadCommand,
  PROJECT_ITEM_READ_ATTEMPTS,
  PROJECT_ITEM_RETRY_DELAY_MS,
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
const MISSING_READBACK_ERROR = /missing from readback/;
const IDENTITY_CHANGE_ERROR = /same numeric and global IDs/;
const UNAPPLIED_WRITE_ERROR = /status mutation failed.*read back Backlog, expected Done/;
const CLI_NUMERIC_ID_USAGE = /numeric REST id/;
const CLI_NODE_ID_USAGE = /PVTI_/;
const CLI_FAILURE_PREFIX = /project-status failed/;
const SCRIPT_PATH = fileURLToPath(new URL("./project-status.mjs", import.meta.url));
const USAGE_EXIT_CODE = 2;
const IDENTITY_SHIFT = 1000;
const MISSING_NUMERIC_ID = "999999999";
const ITEM_LIST_PREFIX = "users/TychoHenzen/projectsV2/2/items?";
const ITEM_READ_PREFIX = "users/TychoHenzen/projectsV2/2/items/";
// The stderr gh prints for a REST 404, as the live read of a missing item
// returned on 2026-10-14.
const NOT_FOUND_RESULT = {
  status: 1,
  stderr: "gh: Not Found (HTTP 404)",
  stdout: "",
};
const SERVER_ERROR = /HTTP 502/;
// Issue #869 clarification C6 fixes the bound at three reads; the constant must
// not drift silently.
const CLARIFIED_READ_ATTEMPTS = 3;
// One 404, the read that resolves the item, and the readback after the write.
const TRANSIENT_404_RUN_READS = 3;
const NODE_ID_REMEDY_ERROR = /PVTI_child-one was missing from readback\. Pass its numeric item id instead/;

function projectFields() {
  return [
    {
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
    },
  ];
}

function projectItems(statuses) {
  return [...statuses].map(([nodeId, status]) => ({
    id: ITEM_NUMERIC_IDS.get(nodeId),
    node_id: nodeId,
    fields: [
      {
        id: STATUS_FIELD_ID,
        name: "Status",
        data_type: "single_select",
        value: { id: STATUS_OPTION_ID, name: { raw: status } },
      },
    ],
  }));
}

function createRunner({
  projectId = PROJECT_ID,
  statuses = new Map(ITEM_IDS.map((itemId) => [itemId, "Backlog"])),
  splitItems = false,
  fields = projectFields(),
} = {}) {
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
    if (endpoint?.startsWith(ITEM_LIST_PREFIX) === true) {
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
    if (endpoint?.startsWith(ITEM_READ_PREFIX) === true) {
      return singleItemReply(statuses, endpoint);
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, runner };
}

function isUserPath(value) {
  return typeof value === "string" && value.startsWith("users/");
}

function endpointOf(args) {
  return args.find(isUserPath);
}

// A runner whose Project holds only the first item, in Backlog.
function backlogRunner() {
  return createRunner({ statuses: new Map([[ITEM_IDS[0], "Backlog"]]) });
}

// The items list omits the first item, as it can right after an add.
function omitFirst() {
  return { listOmits: new Set([ITEM_IDS[0]]) };
}

function writeItems(itemIds, commandRunner, sleep) {
  const options = writeOptions({ itemIds });
  return writeProjectStatuses({ ...options, commandRunner, sleep });
}

function isListRead(args) {
  return endpointOf(args)?.startsWith(ITEM_LIST_PREFIX) === true;
}

function isSingleItemRead(args) {
  const read = endpointOf(args)?.startsWith(ITEM_READ_PREFIX) === true;
  return read && !args.includes("PATCH");
}

// Applies change to every item on every page of a list read's reply.
function mapListedItems(result, change) {
  const pages = JSON.parse(result.stdout).map((page) => page.flatMap(change));
  return { ...result, stdout: JSON.stringify(pages) };
}

// listOmits models the items list lagging behind the single-item endpoint;
// notFoundReads makes that many single-item reads answer 404 first, as the
// endpoint does right after an item is added.
function laggingRunner(fixture, lag) {
  const { calls, runner } = fixture;
  const { listOmits = new Set(), notFoundReads = 0 } = lag;
  let pendingNotFound = notFoundReads;
  const kept = ({ node_id: nodeId }) => !listOmits.has(nodeId);
  const omit = (item) => [item].filter(kept);
  const lagged = (args) => {
    const result = runner(args);
    if (isListRead(args)) {
      return mapListedItems(result, omit);
    }
    if (isSingleItemRead(args) && pendingNotFound > 0) {
      pendingNotFound -= 1;
      return NOT_FOUND_RESULT;
    }
    return result;
  };
  return { calls, runner: lagged };
}

function singleItemReply(statuses, endpoint) {
  const [numericId] = endpoint.slice(ITEM_READ_PREFIX.length).split("?", 1);
  const entries = [...ITEM_NUMERIC_IDS.entries()];
  const nodeId = entries.find(([, id]) => String(id) === numericId)?.[0];
  if (!statuses.has(nodeId)) {
    return NOT_FOUND_RESULT;
  }
  const [item] = projectItems(new Map([[nodeId, statuses.get(nodeId)]]));
  return { status: 0, stderr: "", stdout: JSON.stringify(item) };
}

function singleItemReads(calls) {
  const isRead = (value) => String(value).startsWith(ITEM_READ_PREFIX);
  return calls.filter((args) => !args.includes("PATCH") && args.some(isRead));
}

function listReads(calls) {
  const isList = (value) => String(value).startsWith(ITEM_LIST_PREFIX);
  return calls.filter((args) => args.some(isList));
}

function recordingSleep() {
  const delays = [];
  return { delays, sleep: (milliseconds) => delays.push(milliseconds) };
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

// The first readback keeps the true identity so the identity change shows up
// only after the PATCH. A numeric input is read through the single-item
// endpoint and a node input through the list, so both reads count.
function alterIfTarget(item, alterItem) {
  if (item.node_id !== ITEM_IDS[0]) {
    return item;
  }
  return alterItem(item);
}

function alterTargetInLaterReads(runner, alterItem) {
  let itemReads = 0;
  const alterTarget = (item) => alterIfTarget(item, alterItem);
  return (args) => {
    const result = runner(args);
    const singleRead = isSingleItemRead(args);
    if (!(isListRead(args) || singleRead)) {
      return result;
    }
    itemReads += 1;
    if (itemReads === 1) {
      return result;
    }
    if (singleRead) {
      const item = alterTarget(JSON.parse(result.stdout));
      return { ...result, stdout: JSON.stringify(item) };
    }
    return mapListedItems(result, (item) => [alterTarget(item)]);
  };
}

test("writes REST single-select updates in child-before-parent order with readback", () => {
  const { calls, runner } = createRunner({ splitItems: true });

  const result = writeProjectStatuses({ ...writeOptions(), commandRunner: runner });

  assert.equal(result.projectId, PROJECT_ID);
  assert.deepEqual(
    result.mutations,
    ITEM_IDS.map((itemId) => ({ itemId, status: "Done" })),
  );
  assert.deepEqual(
    calls.filter((args) => args.includes("PATCH")).map((args) => args[3].split("/").at(-1)),
    [...ITEM_NUMERIC_IDS.values()].map(String),
  );
  assert.deepEqual(
    calls.filter((args) => args.includes("PATCH"))[0],
    buildProjectItemEditCommand({
      owner: "TychoHenzen",
      projectNumber: 2,
      itemId: String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0])),
      statusFieldId: String(STATUS_FIELD_ID),
      statusOptionId: STATUS_OPTION_ID,
    }),
  );
  assert.equal(
    calls.filter((args) => args.some((value) => String(value).includes("/items?"))).length,
    ITEM_IDS.length + 1,
  );
  assert.equal(
    calls.every((args) => args[0] === "api"),
    true,
  );
  assert.equal(
    calls.some((args) =>
      args.some((value) => /graphql|project( |$)|item-edit|item-list|issue view/i.test(String(value))),
    ),
    false,
  );
  const itemReads = calls.filter((args) => args.some((value) => String(value).includes("/items?")));
  assert.equal(
    itemReads.every((args) => args.includes("--paginate") && args.includes("--slurp")),
    true,
  );
  assert.equal(
    itemReads.every((args) => !args.some((value) => /[?&]page=/.test(String(value)))),
    true,
  );
});

test("consumes every Link-paginated item page before resolving target IDs", () => {
  const calls = [];
  const firstPage = projectItems(new Map([[ITEM_IDS[0], "Done"]]));
  const secondPage = projectItems(
    new Map([
      [ITEM_IDS[1], "Done"],
      [ITEM_IDS[2], "Done"],
    ]),
  );
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
  assert.equal(
    itemReads.every((args) => args.includes("--paginate") && args.includes("--slurp")),
    true,
  );
  assert.equal(
    itemReads.every((args) => !args.some((value) => /[?&]page=/.test(String(value)))),
    true,
  );
});

test("does not PATCH a Project item already at the requested status", () => {
  const { calls, runner } = createRunner({ statuses: new Map([[ITEM_IDS[0], "Done"]]) });

  const result = writeProjectStatuses({ ...writeOptions({ itemIds: [ITEM_IDS[0]] }), commandRunner: runner });

  assert.deepEqual(result.mutations, [{ itemId: ITEM_IDS[0], status: "Done" }]);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 0);
  assert.equal(calls.filter((args) => args.some((value) => String(value).includes("/items?"))).length, 1);
});

test("reads back after an ambiguous status write and never retries it", () => {
  const { calls, runner } = backlogRunner();
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
  const { calls, runner } = backlogRunner();
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
    const { calls, runner } = backlogRunner();
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
    assert.equal(
      calls.some((args) => args.includes("PATCH")),
      false,
    );
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
      () =>
        writeProjectStatuses({
          ...writeOptions({ itemIds: [ITEM_IDS[0], ITEM_IDS[1]] }),
          commandRunner: recordingRunner,
        }),
      /Project item|missing from readback|appeared more than once/,
    );
    assert.equal(
      calls.some((args) => args.includes("PATCH")),
      false,
    );
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
  assert.deepEqual(
    patch,
    buildProjectItemEditCommand({
      owner: "TychoHenzen",
      projectNumber: 2,
      itemId: String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0])),
      statusFieldId: String(STATUS_FIELD_ID),
      statusOptionId: STATUS_OPTION_ID,
    }),
  );
});

test("rejects a numeric project response before any status write", () => {
  const { calls, runner } = createRunner({ projectId: "2" });

  assert.throws(
    () => writeProjectStatuses({ ...writeOptions({ itemIds: [ITEM_IDS[0]] }), commandRunner: runner }),
    NUMERIC_PROJECT_ID_ERROR,
  );
  assert.equal(
    calls.some((args) => args.includes("PATCH")),
    false,
  );
});

test("rejects duplicate item IDs before resolving or writing", () => {
  const { calls, runner } = createRunner();

  assert.throws(
    () =>
      writeProjectStatuses({
        ...writeOptions({ itemIds: [ITEM_IDS[0], ITEM_IDS[0], ITEM_IDS[2]] }),
        commandRunner: runner,
      }),
    /unique item IDs/,
  );
  assert.equal(calls.length, 0);
});

test("rejects a missing or mismatched status option before any status write", () => {
  const { calls, runner } = createRunner();

  assert.throws(
    () =>
      writeProjectStatuses({
        ...writeOptions({ statusOptionId: "missing-option", itemIds: [ITEM_IDS[0]] }),
        commandRunner: runner,
      }),
    /must map to Done/,
  );
  assert.equal(
    calls.some((args) => args.includes("PATCH")),
    false,
  );
});

test("rejects missing or ambiguous REST status fields before any status write", () => {
  for (const fields of [[], [...projectFields(), ...projectFields()]]) {
    const { calls, runner } = createRunner({ fields });

    assert.throws(
      () =>
        writeProjectStatuses({
          ...writeOptions({ itemIds: [ITEM_IDS[0]] }),
          commandRunner: runner,
        }),
      STATUS_FIELD_ERROR,
    );
    assert.equal(
      calls.some((args) => args.includes("PATCH")),
      false,
    );
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
    if (
      args.includes("PATCH") &&
      args.some((value) => String(value).endsWith(String(ITEM_NUMERIC_IDS.get(ITEM_IDS[1]))))
    ) {
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
    const { calls, runner } = backlogRunner();
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

test("routes an interactive status form only after a no-op readback", async () => {
  const statuses = new Map([[ITEM_IDS[0], "Backlog"]]);
  const { calls, runner } = createRunner({ statuses });
  const phases = [];
  let primaryCalls = 0;
  const result = await writeProjectStatusesWithFallback({
    ...writeOptions({ itemIds: [ITEM_IDS[0]] }),
    commandRunner: runner,
    primaryMutation: async () => {
      primaryCalls += 1;
      return { isError: true, structuredContent: { status: "awaiting_user_submission" } };
    },
    readback: async ({ phase }) => {
      phases.push(phase);
      return { mutated: phase === "after-fallback" };
    },
  });

  assert.equal(result.transport, "rest");
  assert.equal(primaryCalls, 1);
  assert.deepEqual(phases, ["before-fallback", "after-fallback"]);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);
  assert.deepEqual(result.value.mutations, [{ itemId: ITEM_IDS[0], status: "Done" }]);
});

test("AC-01 numeric input writes one PATCH to its numeric endpoint and reports the input as given", () => {
  const numericId = String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]));
  const { calls, runner } = backlogRunner();

  const result = writeProjectStatuses({ ...writeOptions({ itemIds: [numericId] }), commandRunner: runner });

  const patches = calls.filter((args) => args.includes("PATCH"));
  assert.equal(patches.length, 1);
  assert.equal(patches[0][3].split("/").at(-1), numericId);
  assert.deepEqual(result.mutations, [{ itemId: numericId, status: "Done" }]);
});

test("AC-01 mixed numeric and node inputs PATCH in the given order and report each input as given", () => {
  const itemIds = [String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0])), String(ITEM_NUMERIC_IDS.get(ITEM_IDS[1])), ITEM_IDS[2]];
  const { calls, runner } = createRunner();

  const result = writeProjectStatuses({ ...writeOptions({ itemIds }), commandRunner: runner });

  assert.deepEqual(
    calls.filter((args) => args.includes("PATCH")).map((args) => args[3].split("/").at(-1)),
    ITEM_IDS.map((itemId) => String(ITEM_NUMERIC_IDS.get(itemId))),
  );
  assert.deepEqual(
    result.mutations,
    itemIds.map((itemId) => ({ itemId, status: "Done" })),
  );
});

test("AC-02 numeric and node spellings of one item stop before any PATCH and name both inputs", () => {
  const numericId = String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]));
  const { calls, runner } = backlogRunner();

  assert.throws(
    () => writeProjectStatuses({ ...writeOptions({ itemIds: [numericId, ITEM_IDS[0]] }), commandRunner: runner }),
    new RegExp(`${numericId} and ${ITEM_IDS[0]} resolve to the same Project item`),
  );
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 0);
});

test("AC-02 numeric ID matching no readback item stops as missing before any PATCH", () => {
  const { calls, runner } = createRunner();
  const { sleep } = recordingSleep();

  const write = () => writeItems([MISSING_NUMERIC_ID], runner, sleep);
  assert.throws(write, MISSING_READBACK_ERROR);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 0);
});

test("R10 numeric input absent from the items list is written and read back through the single-item endpoint", () => {
  const numericId = String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]));
  const fixture = backlogRunner();
  const { calls, runner } = laggingRunner(fixture, omitFirst());
  const { delays, sleep } = recordingSleep();

  const result = writeItems([numericId], runner, sleep);

  assert.deepEqual(result.mutations, [{ itemId: numericId, status: "Done" }]);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);
  assert.equal(listReads(calls).length, 0);
  const expectedRead = buildProjectItemReadCommand({
    owner: "TychoHenzen",
    projectNumber: 2,
    itemId: numericId,
    statusFieldId: String(STATUS_FIELD_ID),
  });
  assert.deepEqual(singleItemReads(calls), [expectedRead, expectedRead]);
  assert.deepEqual(delays, []);
});

test("R10 a transient single-item 404 is read again and the write succeeds within the attempt bound", () => {
  const numericId = String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]));
  const fixture = backlogRunner();
  const { calls, runner } = laggingRunner(fixture, { notFoundReads: 1 });
  const { delays, sleep } = recordingSleep();

  const result = writeItems([numericId], runner, sleep);

  assert.deepEqual(result.mutations, [{ itemId: numericId, status: "Done" }]);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);
  assert.equal(singleItemReads(calls).length, TRANSIENT_404_RUN_READS);
  assert.deepEqual(delays, [PROJECT_ITEM_RETRY_DELAY_MS]);
});

test("R11 a single-item 404 on every bounded read stops as missing with no PATCH", () => {
  const numericId = String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]));
  const fixture = backlogRunner();
  const lag = { notFoundReads: PROJECT_ITEM_READ_ATTEMPTS };
  const { calls, runner } = laggingRunner(fixture, lag);
  const { delays, sleep } = recordingSleep();

  assert.throws(() => writeItems([numericId], runner, sleep), {
    message: `Project item ${numericId} was missing from readback.`,
  });
  assert.equal(PROJECT_ITEM_READ_ATTEMPTS, CLARIFIED_READ_ATTEMPTS);
  assert.equal(singleItemReads(calls).length, PROJECT_ITEM_READ_ATTEMPTS);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 0);
  const delay = PROJECT_ITEM_RETRY_DELAY_MS;
  assert.deepEqual(delays, [delay, 2 * delay]);
});

test("R11 a readback that answers 404 on every bounded read after the write stops as missing", () => {
  const numericId = String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]));
  const statuses = new Map([[ITEM_IDS[0], "Backlog"]]);
  const { calls, runner } = createRunner({ statuses });
  const vanishingRunner = (args) => {
    const result = runner(args);
    if (args.includes("PATCH")) {
      statuses.delete(ITEM_IDS[0]);
    }
    return result;
  };
  const { sleep } = recordingSleep();

  assert.throws(() => writeItems([numericId], vanishingRunner, sleep), {
    message: `Project item ${numericId} was missing from readback.`,
  });
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);
  assert.equal(singleItemReads(calls).length, 1 + PROJECT_ITEM_READ_ATTEMPTS);
});

// The fakes above ignore the accepted exit codes; the real runner throws on any
// exit it was not told to accept, so this pins that a 404 reaches the retry
// instead of escaping as gh's raw text.
test("R11 a 404 through the real gh runner is retried to the bound and stops as missing", () => {
  const numericId = String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]));
  const { calls, runner } = backlogRunner();
  const notFoundSpawn = () => NOT_FOUND_RESULT;
  const ghRunner = (args, acceptedExitCodes) => {
    if (isSingleItemRead(args)) {
      calls.push(args);
      return runGh(args, acceptedExitCodes, notFoundSpawn);
    }
    return runner(args);
  };
  const { sleep } = recordingSleep();

  assert.throws(() => writeItems([numericId], ghRunner, sleep), {
    message: `Project item ${numericId} was missing from readback.`,
  });
  assert.equal(singleItemReads(calls).length, PROJECT_ITEM_READ_ATTEMPTS);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 0);
});

test("R11 a non-404 single-item failure stops at once without another read or a PATCH", () => {
  const numericId = String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]));
  const { calls, runner } = backlogRunner();
  const failingRunner = (args) => {
    if (isSingleItemRead(args)) {
      calls.push(args);
      return { status: 1, stderr: "gh: Server Error (HTTP 502)", stdout: "" };
    }
    return runner(args);
  };
  const { delays, sleep } = recordingSleep();

  const write = () => writeItems([numericId], failingRunner, sleep);
  assert.throws(write, SERVER_ERROR);
  assert.equal(singleItemReads(calls).length, 1);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 0);
  assert.deepEqual(delays, []);
});

test("R11 a node-id input absent from the items list names the numeric-id remedy before any PATCH", () => {
  const fixture = backlogRunner();
  const { calls, runner } = laggingRunner(fixture, omitFirst());

  assert.throws(() => writeItems([ITEM_IDS[0]], runner), NODE_ID_REMEDY_ERROR);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 0);
  assert.equal(singleItemReads(calls).length, 0);
});

test("AC-02 identity change after the write stops for every input form and changed ID", () => {
  const inputForms = [
    ["numeric", String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]))],
    ["node", ITEM_IDS[0]],
  ];
  const changes = [
    ["numeric ID", (item) => ({ ...item, id: item.id + IDENTITY_SHIFT })],
    ["node ID", (item) => ({ ...item, node_id: "PVTI_replaced" })],
  ];
  for (const [inputForm, itemId] of inputForms) {
    for (const [changedId, alterItem] of changes) {
      const label = `${inputForm} input, ${changedId} changed`;
      const { calls, runner } = backlogRunner();

      assert.throws(
        () =>
          writeProjectStatuses({
            ...writeOptions({ itemIds: [itemId] }),
            commandRunner: alterTargetInLaterReads(runner, alterItem),
          }),
        IDENTITY_CHANGE_ERROR,
        label,
      );
      assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1, label);
    }
  }
});

test("AC-02 readback with both IDs changed after the write stops as missing after one PATCH", () => {
  const inputForms = [
    ["numeric", String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]))],
    ["node", ITEM_IDS[0]],
  ];
  for (const [inputForm, itemId] of inputForms) {
    const label = `${inputForm} input, both IDs changed`;
    const { calls, runner } = backlogRunner();

    assert.throws(
      () =>
        writeProjectStatuses({
          ...writeOptions({ itemIds: [itemId] }),
          commandRunner: alterTargetInLaterReads(runner, (item) => ({
            ...item,
            id: item.id + IDENTITY_SHIFT,
            node_id: "PVTI_replaced",
          })),
        }),
      MISSING_READBACK_ERROR,
      label,
    );
    assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1, label);
  }
});

test("AC-03 rerun after an identity-change stop makes no PATCH once the item already holds Done", () => {
  const numericId = String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]));
  const { calls, runner } = backlogRunner();
  assert.throws(
    () =>
      writeProjectStatuses({
        ...writeOptions({ itemIds: [numericId] }),
        commandRunner: alterTargetInLaterReads(runner, (item) => ({ ...item, id: item.id + IDENTITY_SHIFT })),
      }),
    IDENTITY_CHANGE_ERROR,
  );
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);

  const rerun = createRunner({ statuses: new Map([[ITEM_IDS[0], "Done"]]) });
  const result = writeProjectStatuses({ ...writeOptions({ itemIds: [numericId] }), commandRunner: rerun.runner });

  assert.deepEqual(result.mutations, [{ itemId: numericId, status: "Done" }]);
  assert.equal(rerun.calls.filter((args) => args.includes("PATCH")).length, 0);
});

test("AC-03 rerun after an unapplied ambiguous numeric write makes no PATCH once the item holds Done", () => {
  const numericId = String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0]));
  const statuses = new Map([[ITEM_IDS[0], "Backlog"]]);
  const { calls, runner } = createRunner({ statuses });
  const unappliedRunner = (args) => {
    if (args.includes("PATCH")) {
      calls.push([...args]);
      throw new Error("status write timed out");
    }
    return runner(args);
  };

  assert.throws(
    () => writeProjectStatuses({ ...writeOptions({ itemIds: [numericId] }), commandRunner: unappliedRunner }),
    UNAPPLIED_WRITE_ERROR,
  );
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);

  statuses.set(ITEM_IDS[0], "Done");
  const rerun = createRunner({ statuses });
  const result = writeProjectStatuses({ ...writeOptions({ itemIds: [numericId] }), commandRunner: rerun.runner });

  assert.deepEqual(result.mutations, [{ itemId: numericId, status: "Done" }]);
  assert.equal(rerun.calls.filter((args) => args.includes("PATCH")).length, 0);
});

test("AC-07 CLI with no item IDs prints both ID forms and exits before any gh call", () => {
  // Built from scratch without PATH, so a gh call would fail with ENOENT and exit 1 instead of 2.
  // biome-ignore lint/style/noProcessEnv: only SystemRoot is copied; the host environment is never spread.
  const systemRoot = process.env.SystemRoot;
  const env = {};
  if (systemRoot !== undefined) {
    env.SystemRoot = systemRoot;
  }

  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "TychoHenzen", "2", STATUS_FIELD_NODE_ID, STATUS_OPTION_ID, "Done"],
    { encoding: "utf8", env, windowsHide: true },
  );

  assert.equal(result.status, USAGE_EXIT_CODE);
  assert.match(result.stderr, CLI_NUMERIC_ID_USAGE);
  assert.match(result.stderr, CLI_NODE_ID_USAGE);
  assert.doesNotMatch(result.stderr, CLI_FAILURE_PREFIX);
});
