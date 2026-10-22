import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPublicRepositoryReadback,
  buildPublicRepositoryPayload,
  createPublicRepository,
  PUBLIC_VISIBILITY,
} from "./repository-visibility.mjs";

const HTTP_FORBIDDEN = 403;
const EXPECTED_CREATE_CALLS = [
  "read",
  ["create", { name: "target", organization: "owner", private: false, autoInit: false }],
  "read",
];
const EXPECTED_CREATE_LEDGER = [
  {
    operation: "create_repository",
    target: "owner/target",
    requestedVisibility: PUBLIC_VISIBILITY,
    status: "verified",
  },
];

function visibilityRepository({ visibility = PUBLIC_VISIBILITY, isPrivate = false } = {}) {
  return {
    full_name: "owner/target",
    name: "target",
    private: isPrivate,
    visibility,
  };
}

test("builds an explicit public create payload without initializing remote content", () => {
  assert.deepEqual(
    buildPublicRepositoryPayload({
      name: "target",
      organization: "owner",
      description: "fixture",
    }),
    {
      name: "target",
      organization: "owner",
      description: "fixture",
      private: false,
      autoInit: false,
    },
  );
});

test("creates only an absent target and verifies public visibility after the mutation", async () => {
  const calls = [];
  let observed = null;
  const ledger = [];
  const result = await createPublicRepository({
    owner: "owner",
    name: "target",
    organization: "owner",
    readRepository: () => {
      calls.push("read");
      return observed;
    },
    createRepository: (payload) => {
      calls.push(["create", payload]);
      observed = visibilityRepository();
    },
    mutationLedger: ledger,
  });

  assert.deepEqual(calls, EXPECTED_CREATE_CALLS);
  assert.equal(result.repository.visibility, PUBLIC_VISIBILITY);
  assert.equal(result.repository.private, false);
  assert.deepEqual(ledger, EXPECTED_CREATE_LEDGER);
});

test("refuses to mutate an existing private repository", async () => {
  let createCalls = 0;
  const ledger = [];

  await assert.rejects(
    createPublicRepository({
      owner: "owner",
      name: "target",
      readRepository: () => visibilityRepository({ visibility: "private", isPrivate: true }),
      createRepository: () => {
        createCalls += 1;
      },
      mutationLedger: ledger,
    }),
    (error) =>
      error.name === "RepositoryVisibilityStopError" &&
      error.details.stage === "pre-create read" &&
      error.details.mutationAttempted === false,
  );
  assert.equal(createCalls, 0);
  assert.deepEqual(ledger, []);
});

test("fails closed when creation readback is missing", async () => {
  const ledger = [];
  await assert.rejects(
    createPublicRepository({
      owner: "owner",
      name: "target",
      readRepository: () => null,
      createRepository: () => undefined,
      mutationLedger: ledger,
    }),
    (error) =>
      error.name === "RepositoryVisibilityStopError" &&
      error.details.stage === "post-create readback" &&
      error.details.mutationAttempted === true,
  );
  assert.equal(ledger[0].status, "attempted");
});

test("does not expose provider error text in failure diagnostics", async () => {
  const providerError = Object.assign(new Error("token=secret-value"), {
    status: HTTP_FORBIDDEN,
    category: "permission",
  });
  let observedError;

  await assert.rejects(
    createPublicRepository({
      owner: "owner",
      name: "target",
      readRepository: () => null,
      createRepository: () => {
        throw providerError;
      },
    }),
    (error) => {
      observedError = error;
      return (
        error.details.provider.status === HTTP_FORBIDDEN &&
        error.details.provider.category === "permission" &&
        error.cause === undefined &&
        !Object.hasOwn(error, "cause") &&
        !JSON.stringify(error, Object.getOwnPropertyNames(error)).includes("secret-value")
      );
    },
  );
  assert.equal(observedError.cause, undefined);
});

test("accepts case-insensitive GitHub identity in the public readback", () => {
  const repository = visibilityRepository();
  repository.full_name = "OWNER/TARGET";
  assert.equal(assertPublicRepositoryReadback(repository, { owner: "owner", name: "target" }), repository);
});

test("rejects a create destination that differs from the resolved owner", async () => {
  const ledger = [];
  let readCalls = 0;
  let createCalls = 0;

  await assert.rejects(
    createPublicRepository({
      owner: "owner",
      name: "target",
      organization: "other-owner",
      readRepository: () => {
        readCalls += 1;
        return null;
      },
      createRepository: () => {
        createCalls += 1;
      },
      mutationLedger: ledger,
    }),
    (error) =>
      error.name === "RepositoryVisibilityStopError" &&
      error.details.stage === "destination validation" &&
      error.details.mutationAttempted === false,
  );

  assert.equal(readCalls, 0);
  assert.equal(createCalls, 0);
  assert.deepEqual(ledger, []);
});

test("rejects a contradictory repository readback", () => {
  assert.throws(
    () =>
      assertPublicRepositoryReadback(visibilityRepository({ visibility: "private", isPrivate: true }), {
        owner: "owner",
        name: "target",
      }),
    (error) => error.name === "RepositoryVisibilityStopError" && error.details.stage === "repository readback",
  );
});
