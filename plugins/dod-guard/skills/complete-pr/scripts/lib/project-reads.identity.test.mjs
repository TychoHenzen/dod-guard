// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { linkedProjectItem, projectStatusResponse } from "./fixtures/project-status-items.mjs";
import { createProjectStatusReader } from "./fixtures/project-status-reader.mjs";

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
