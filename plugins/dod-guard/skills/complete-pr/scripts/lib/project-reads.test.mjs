// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { CompletionError } from "./completion-error.mjs";
import { okResponse } from "./github-client.test-support.mjs";
import {
  contentRepository,
  ProjectReadError,
  readIssueProjectStatuses,
  readSlurpedPages,
  sameRepository,
  statusValueName,
} from "./project-reads.mjs";

// A runner that answers each endpoint from a table and throws for any endpoint it does not know, so a
// read the test does not expect fails it.
function tableRunner(table) {
  const calls = [];
  const runner = (args, acceptedExitCodes = [0]) => {
    calls.push(args);
    const reply = table[args.at(-1)];
    if (reply === undefined) {
      throw new Error(`no reply for ${args.at(-1)}`);
    }
    if (!acceptedExitCodes.includes(reply.status)) {
      throw new Error(reply.stderr || `gh exited with ${reply.status}`);
    }
    return reply;
  };
  return { calls, runner };
}

const LISTING = "users/owner/projectsV2?per_page=100";
const membership = (number) => `users/owner/projectsV2/${number}/items?per_page=100`;
const repositoryItem = (repository) => ({ content: { repository: { full_name: repository } } });

function assertProjectReadError(read, endpoint, detail) {
  assert.throws(read, (error) => {
    assert.ok(error instanceof ProjectReadError, String(error));
    assert.equal(error.endpoint, endpoint);
    assert.equal(error.detail, detail);
    assert.equal(error.message, `${endpoint}: ${detail}`);
    return true;
  });
}

test("statusValueName reads one name from each REST spelling and gives null for an absent value", () => {
  assert.equal(statusValueName("Done"), "Done");
  assert.equal(statusValueName({ name: "Done" }), "Done");
  assert.equal(statusValueName({ name: { raw: "Done", html: "Done" } }), "Done");
  assert.equal(statusValueName(null), null);
  assert.equal(statusValueName(undefined), null);
});

test("statusValueName keeps its rejection messages", () => {
  assert.throws(() => statusValueName({ id: "x" }), { message: "Status value is not a name." });
  assert.throws(() => statusValueName({ name: { raw: " " } }), { message: "Status value has a blank name." });
  assert.throws(() => statusValueName({ name: { raw: "Done", html: "Todo" } }), {
    message: "Status value names disagree.",
  });
});

const ISSUE_ITEM = { id: 1, node_id: "PVTI_1", content: { number: 24, repository: { full_name: "owner/repo" } } };
const STATUS_FIELDS = "users/owner/projectsV2/2/fields?per_page=100";
const ITEM_STATUS_READ = "users/owner/projectsV2/2/items/1?fields=7";

// A runner for one open Project holding issue 24, whose readback carries the given fields. statusFieldId
// is the Status field ID the fields listing reports.
function issueStatusRunner(fields, statusFieldId = 7) {
  return tableRunner({
    [LISTING]: okResponse(JSON.stringify([[{ number: 2, state: "open" }]])),
    [membership(2)]: okResponse(JSON.stringify(ISSUE_ITEM)),
    [STATUS_FIELDS]: okResponse(JSON.stringify([[{ id: statusFieldId, name: "Status" }]])),
    [ITEM_STATUS_READ]: okResponse(JSON.stringify({ ...ISSUE_ITEM, fields })),
  }).runner;
}

test("readIssueProjectStatuses maps each flattener rejection to its own github_response_shape stop", () => {
  const status = (value) => [{ id: 7, name: "Status", value }];
  const cases = [
    [status(undefined), "exactly one non-blank Status field/value"],
    [status({ id: "x" }), "exactly one non-blank Status field/value"],
    [status(""), "exactly one non-blank Status field/value"],
    [status({ name: { raw: "Done", html: "Todo" } }), "one non-contradictory Status field/value"],
    [[{ id: 8, name: "Status", value: "Done" }], "exactly one Status field/value"],
  ];
  for (const [fields, detail] of cases) {
    assert.throws(
      () => readIssueProjectStatuses("owner/repo", 24, issueStatusRunner(fields)),
      (error) => {
        assert.ok(error instanceof CompletionError);
        assert.equal(error.code, "github_response_shape");
        assert.equal(error.message, `GitHub response for ${ITEM_STATUS_READ} must include ${detail}.`);
        return true;
      },
    );
  }
  const read = issueStatusRunner(status({ name: { raw: "Done" } }), "7");
  assert.deepEqual(readIssueProjectStatuses("owner/repo", 24, read), ["Done"]);
});

test("readIssueProjectStatuses stops on an item with no repository, because it could be the issue's own", () => {
  const listing = okResponse(JSON.stringify([[{ number: 2, state: "open" }]]));
  const rows = [{ id: 1, node_id: "PVTI_1", content: { number: 24 } }, repositoryItem("owner/repo")];
  const issueRead = tableRunner({
    [LISTING]: listing,
    [membership(2)]: okResponse(rows.map((row) => JSON.stringify(row)).join("\n")),
  });
  assert.throws(
    () => readIssueProjectStatuses("owner/repo", 24, issueRead.runner),
    (error) => {
      assert.ok(error instanceof CompletionError, String(error));
      assert.equal(error.code, "github_response_shape");
      assert.equal(
        error.message,
        `GitHub response for ${membership(2)} must include Project items with repository identity.`,
      );
      return true;
    },
  );
});

// Project 2 item 273009693 (PullRequest #946) as PROJECT_ITEM_IDENTITY_JQ projects it. The REST content has
// no repository key, so every identity field is null.
const PULL_REQUEST_ITEM = {
  id: 273_009_693,
  node_id: "PVTI_lAHOAFboXs4BiVn2zhBFzB0",
  content_type: "PullRequest",
  content: { number: 946, repository: { full_name: null, fullName: null }, repository_url: null },
};

const DONE_FIELD = { id: 7, name: "Status", value: { name: { raw: "Done" } } };

function membershipRunner(rows) {
  const itemRead = JSON.stringify({ ...ISSUE_ITEM, fields: [DONE_FIELD] });
  return tableRunner({
    [LISTING]: okResponse(JSON.stringify([[{ number: 2, state: "open" }]])),
    [membership(2)]: okResponse(rows.map((row) => JSON.stringify(row)).join("\n")),
    [STATUS_FIELDS]: okResponse(JSON.stringify([[{ id: 7, name: "Status" }]])),
    [ITEM_STATUS_READ]: okResponse(itemRead),
  }).runner;
}

test("readIssueProjectStatuses skips a PullRequest item that carries no repository identity", () => {
  assert.deepEqual(readIssueProjectStatuses("owner/repo", 24, membershipRunner([PULL_REQUEST_ITEM, ISSUE_ITEM])), [
    "Done",
  ]);
});

test("readIssueProjectStatuses still stops on an Issue, DraftIssue, or untyped item with no repository", () => {
  for (const contentType of ["Issue", "DraftIssue", undefined]) {
    const runner = membershipRunner([{ ...PULL_REQUEST_ITEM, content_type: contentType }, ISSUE_ITEM]);
    assert.throws(
      () => readIssueProjectStatuses("owner/repo", 24, runner),
      (error) => {
        assert.ok(error instanceof CompletionError, String(error));
        assert.equal(error.code, "github_response_shape");
        assert.match(error.message, /must include a non-blank repository identity/);
        return true;
      },
    );
  }
});

test("readSlurpedPages flattens every page and names a page that is not an array", () => {
  const read = (pages) => tableRunner({ x: okResponse(pages) }).runner;
  assert.deepEqual(readSlurpedPages(read(JSON.stringify([[1], [2, 3]])), "x"), [1, 2, 3]);
  assertProjectReadError(() => readSlurpedPages(read("{"), "x"), "x", "did not return JSON");
  assertProjectReadError(
    () => readSlurpedPages(read(JSON.stringify([[1], {}])), "x"),
    "x",
    "missing page: every page must be an array",
  );
});

test("contentRepository reads full_name first, then repository_url, and null for neither", () => {
  assert.equal(contentRepository({ repository: { full_name: "o/r" }, repository_url: "ignored" }, "x"), "o/r");
  assert.equal(contentRepository({ repository_url: "https://api.github.com/repos/o/r" }, "x"), "o/r");
  assert.equal(contentRepository({}, "x"), null);
  assert.equal(contentRepository(undefined, "x"), null);
  assertProjectReadError(
    () => contentRepository({ repository: { full_name: "o" } }, "x"),
    "x",
    "content repository full_name must name a repository",
  );
  assertProjectReadError(
    () => contentRepository({ repository_url: "https://example.test/o/r" }, "x"),
    "x",
    "content repository_url must name a repository",
  );
});

test("sameRepository compares names without case and never matches a missing name", () => {
  assert.equal(sameRepository("Owner/Repo", "owner/repo"), true);
  assert.equal(sameRepository("owner/other", "owner/repo"), false);
  assert.equal(sameRepository(null, "owner/repo"), false);
});

// A runner that answers the owned-Project listing from queued replies and records each call with the
// exit codes it accepted.
function listingRunner(replies) {
  const calls = [];
  const queue = [...replies];
  const runner = (args, acceptedExitCodes) => {
    calls.push({ args, acceptedExitCodes });
    return queue.shift();
  };
  return { calls, runner };
}

test("readIssueProjectStatuses lists the user-owned Projects first and checks an entry on a later page", () => {
  const { calls, runner } = listingRunner([
    okResponse(JSON.stringify([[{ number: 2, state: "closed" }], [{ number: 5 }]])),
  ]);

  assert.throws(() => readIssueProjectStatuses("owner/repo", 24, runner), {
    code: "github_response_shape",
    message: "GitHub response for users/owner/projectsV2 must include projects with an explicit state.",
  });
  assert.deepEqual(calls, [
    { args: ["api", "--paginate", "--slurp", "users/owner/projectsV2?per_page=100"], acceptedExitCodes: [0, 1] },
  ]);
});

test("readIssueProjectStatuses falls back to orgs/<owner> after a users/ HTTP 404", () => {
  const { calls, runner } = listingRunner([
    { stderr: "gh: Not Found (HTTP 404)", status: 1, stdout: "" },
    okResponse(JSON.stringify([[{ number: 7, state: "closed" }]])),
  ]);

  assert.throws(() => readIssueProjectStatuses("owner/repo", 24, runner), {
    code: "github_response_shape",
    message: "GitHub response for orgs/owner/projectsV2 must include exactly one open linked Project.",
  });
  assert.deepEqual(calls, [
    { args: ["api", "--paginate", "--slurp", "users/owner/projectsV2?per_page=100"], acceptedExitCodes: [0, 1] },
    { args: ["api", "--paginate", "--slurp", "orgs/owner/projectsV2?per_page=100"], acceptedExitCodes: [0] },
  ]);
});

test("readIssueProjectStatuses throws the stderr text of any other listing failure and never reads orgs/", () => {
  const { calls, runner } = listingRunner([{ stderr: "gh: Server Error (HTTP 500)\n", status: 1, stdout: "" }]);
  assert.throws(
    () => readIssueProjectStatuses("owner/repo", 24, runner),
    (error) => {
      assert.equal(error.message, "gh: Server Error (HTTP 500)");
      return true;
    },
  );
  assert.equal(calls.length, 1);

  const { runner: silentRunner } = listingRunner([{ stderr: "", status: 1, stdout: "" }]);
  assert.throws(
    () => readIssueProjectStatuses("owner/repo", 24, silentRunner),
    (error) => {
      assert.equal(error.message, "Failed to list user-owned Projects.");
      return true;
    },
  );
});

test("readIssueProjectStatuses rejects a user-owned listing that is not an array of pages", () => {
  for (const stdout of [JSON.stringify({ message: "x" }), JSON.stringify([{ number: 2 }])]) {
    const { runner } = listingRunner([okResponse(stdout)]);
    assert.throws(
      () => readIssueProjectStatuses("owner/repo", 24, runner),
      (error) => {
        assert.equal(error.code, "github_response_shape");
        assert.equal(
          error.message,
          "GitHub response for users/owner/projectsV2?per_page=100 must include an array an array response.",
        );
        return true;
      },
    );
  }
});

const PROJECT_STATUS_FIELD_ID = 407;

function linkedProjectItem(id, number = 24, repository = "owner/repo") {
  return {
    id,
    node_id: `PVTI_item-${id}`,
    content: {
      number,
      repository: { full_name: repository },
      repository_url: `https://api.github.com/repos/${repository}`,
    },
  };
}

function projectStatusResponse(status, id = 1701, number = 24, repository = "owner/repo") {
  return {
    ...linkedProjectItem(id, number, repository),
    fields: [
      {
        id: PROJECT_STATUS_FIELD_ID,
        name: "Status",
        value: { name: { raw: status } },
      },
    ],
  };
}

function projectItemIdentity(item) {
  return {
    id: item.id,
    node_id: item.node_id,
    content_type: item.content_type,
    content: {
      number: item.content?.number,
      repository: {
        full_name: item.content?.repository?.full_name,
        fullName: item.content?.repository?.fullName,
      },
      repository_url: item.content?.repository_url,
    },
  };
}

function createProjectStatusReader({
  projects = [{ number: 2, state: "open" }],
  itemsByProject = new Map([["2", [linkedProjectItem(1701)]]]),
  fieldsByProject = new Map([["2", [{ id: PROJECT_STATUS_FIELD_ID, name: "Status" }]]]),
  itemResponses = new Map([["2/1701", projectStatusResponse("Done")]]),
  itemPagesByProject = new Map(),
  rateLimitedProjects = new Set(),
} = {}) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    assert.equal(args[0], "api");
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("users/"));
    if (endpoint === "users/owner/projectsV2?per_page=100") {
      return { status: 0, stderr: "", stdout: JSON.stringify([projects]) };
    }

    const fieldsMatch = endpoint?.match(/^users\/owner\/projectsV2\/(\d+)\/fields\?/);
    if (fieldsMatch) {
      return { status: 0, stderr: "", stdout: JSON.stringify([fieldsByProject.get(fieldsMatch[1]) ?? []]) };
    }

    const itemListMatch = endpoint?.match(/^users\/owner\/projectsV2\/(\d+)\/items\?/);
    if (itemListMatch) {
      if (rateLimitedProjects.has(itemListMatch[1])) {
        return { status: 1, stderr: "HTTP 403: API rate limit exceeded", stdout: "" };
      }
      const pages = itemPagesByProject.get(itemListMatch[1]);
      const items = (pages ?? [itemsByProject.get(itemListMatch[1]) ?? []]).flat().map(projectItemIdentity);
      return {
        status: 0,
        stderr: "",
        stdout: items.map((item) => JSON.stringify(item)).join("\n"),
      };
    }

    const itemMatch = endpoint?.match(/^users\/owner\/projectsV2\/(\d+)\/items\/(\d+)\?/);
    if (itemMatch) {
      const response = itemResponses.get(`${itemMatch[1]}/${itemMatch[2]}`);
      if (!response) {
        throw new Error(`Unexpected item endpoint: ${endpoint}`);
      }
      return { status: 0, stderr: "", stdout: JSON.stringify(response) };
    }

    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  const read = (issueNumber = 24) => readIssueProjectStatuses("owner/repo", issueNumber, runner);
  return { calls, read };
}

test("reads linked Project statuses through REST without GraphQL", () => {
  const calls = [];
  const responses = new Map([
    ["users/owner/projectsV2?per_page=100", '[[{"number":2,"state":"open"}]]'],
    ["users/owner/projectsV2/2/items?per_page=100", JSON.stringify(projectItemIdentity(linkedProjectItem(1701)))],
    ["users/owner/projectsV2/2/fields?per_page=100", '[[{"id":407,"name":"Status","data_type":"single_select"}]]'],
    [
      "users/owner/projectsV2/2/items/1701?fields=407",
      JSON.stringify({
        id: 1701,
        node_id: "PVTI_item-1701",
        content: {
          number: 24,
          repository: { full_name: "owner/repo" },
          repository_url: "https://api.github.com/repos/owner/repo",
        },
        fields: [{ id: 407, name: "Status", value: { id: "done", name: { raw: "Done" } } }],
      }),
    ],
  ]);
  const runner = (args) => {
    calls.push(args);
    assert.equal(args[0], "api");
    const endpoint = args.find(
      (value) => typeof value === "string" && (value.startsWith("users/") || value.startsWith("orgs/")),
    );
    const stdout = responses.get(endpoint);
    if (!stdout) {
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    }
    return { status: 0, stderr: "", stdout };
  };

  assert.deepEqual(readIssueProjectStatuses("owner/repo", 24, runner), ["Done"]);
  const itemCall = calls.find((args) => args.includes("users/owner/projectsV2/2/items?per_page=100"));
  assert.deepEqual(itemCall.slice(0, 3), ["api", "--paginate", "--jq"]);
  for (const field of [
    ".id",
    ".node_id",
    ".content_type",
    ".content.number",
    ".content.repository.full_name",
    ".content.repository.fullName",
    ".content.repository_url",
  ]) {
    assert.match(itemCall[3], new RegExp(field.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(itemCall[3], /\.content\.(body|title|user)/);
  assert.equal(itemCall.at(-1), "users/owner/projectsV2/2/items?per_page=100");
  assert.deepEqual(
    calls.filter((args) => args !== itemCall),
    [
      ["api", "--paginate", "--slurp", "users/owner/projectsV2?per_page=100"],
      ["api", "--paginate", "--slurp", "users/owner/projectsV2/2/fields?per_page=100"],
      ["api", "users/owner/projectsV2/2/items/1701?fields=407"],
    ],
  );
  assert.equal(
    calls.some((args) => args.includes("graphql") || args.includes("issue")),
    false,
  );
});

test("follows every Link-paginated Project item page without changing live IDs", () => {
  const firstPage = [linkedProjectItem(1700, 23)];
  const secondPage = [linkedProjectItem(1701)];
  const { read, calls } = createProjectStatusReader({
    itemPagesByProject: new Map([["2", [firstPage, secondPage]]]),
  });

  assert.deepEqual(read(24), ["Done"]);
  const itemCall = calls.find((args) => args.some((value) => String(value).includes("/items?")));
  assert.ok(itemCall.includes("--paginate"));
  assert.ok(itemCall.includes("--jq"));
  assert.equal(itemCall.includes("--slurp"), false);
  assert.match(
    itemCall.find((value) => String(value).includes(".content.number")),
    /\.content\.repository/,
  );
  assert.equal(
    itemCall.some((value) => /[?&]page=/.test(String(value))),
    false,
  );
  assert.equal(
    calls.some((args) => args.some((value) => String(value).includes("/items/1701?fields=407"))),
    true,
  );
});

test("rejects contradictory membership identity and stale item readback", () => {
  const contradictory = linkedProjectItem(1701);
  contradictory.content.repository_url = "https://api.github.com/repos/other/repo";
  const { read: readContradictory } = createProjectStatusReader({
    itemPagesByProject: new Map([["2", [[contradictory]]]]),
  });
  assert.throws(() => readContradictory(24), /non-contradictory repository identity/);

  const { read: readStale } = createProjectStatusReader({
    itemResponses: new Map([["2/1701", projectStatusResponse("Done", 1702)]]),
  });
  assert.throws(() => readStale(24), /same Project item IDs/);
});

test("rejects malformed Project membership identity before status readback", () => {
  const missingContent = linkedProjectItem(1701);
  missingContent.content = undefined;
  const missingIssueNumber = linkedProjectItem(1701);
  missingIssueNumber.content.number = undefined;
  const blankRepository = linkedProjectItem(1701);
  blankRepository.content.repository.full_name = "   ";
  blankRepository.content.repository_url = undefined;
  const invalidRepositoryUrl = linkedProjectItem(1701);
  invalidRepositoryUrl.content.repository_url = "https://example.test/repos/owner/repo";
  const cases = [
    { item: { ...linkedProjectItem(1701), id: undefined }, error: /items with IDs/ },
    { item: { ...linkedProjectItem(1701), node_id: undefined }, error: /items with global IDs/ },
    { item: missingContent, error: /repository identity/ },
    { item: missingIssueNumber, error: /valid issue number/ },
    { item: blankRepository, error: /non-blank repository identity/ },
    { item: invalidRepositoryUrl, error: /canonical repository URL/ },
  ];

  for (const { item, error } of cases) {
    const { read, calls } = createProjectStatusReader({ itemsByProject: new Map([["2", [item]]]) });
    assert.throws(() => read(24), error);
    assert.equal(
      calls.some((args) => args.some((value) => String(value).includes("/fields?"))),
      false,
    );
    assert.equal(
      calls.some((args) => args.some((value) => String(value).includes("/items/1701?fields="))),
      false,
    );
  }
});

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

const PROJECT_ITEM_ENDPOINT = "users/owner/projectsV2/2/items/1701?fields=407";
const PROJECTS_ENDPOINT = "users/owner/projectsV2";

// The exact stop a Project read raises: a github_response_shape CompletionError naming its endpoint.
function assertProjectShapeStop(read, endpoint, detail) {
  assert.throws(read, (error) => {
    assert.ok(error instanceof CompletionError, String(error));
    assert.equal(error.code, "github_response_shape");
    assert.equal(error.message, `GitHub response for ${endpoint} must include ${detail}.`);
    return true;
  });
}

function statusReaderWithFields(fields) {
  return createProjectStatusReader({
    itemResponses: new Map([["2/1701", { ...linkedProjectItem(1701), fields }]]),
  }).read;
}

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

test("stops on a Project item rate-limit response", () => {
  const { read } = createProjectStatusReader({ rateLimitedProjects: new Set(["2"]) });

  assert.throws(() => read(24), /rate limit/i);
});
