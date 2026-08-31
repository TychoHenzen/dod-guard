import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResponsibilityMap } from "./responsibility-map.js";

test("parses a closed responsibility map and trims its values", () => {
  const map = parseResponsibilityMap(
    '{"targetScope":[" src/service.ts "],"responsibilities":[{"name":" run ","currentOwners":[" Service "],"consumers":[],"dependencies":[]}],"desired":{"ownership":[{"responsibility":" run ","owner":" Runner "}],"boundaries":[]}}',
  );

  assert.deepEqual(map, {
    targetScope: ["src/service.ts"],
    responsibilities: [{ name: "run", currentOwners: ["Service"], consumers: [], dependencies: [] }],
    desired: { ownership: [{ responsibility: "run", owner: "Runner" }], boundaries: [] },
  });
});

test("rejects unknown responsibility map fields", () => {
  assert.throws(
    () =>
      parseResponsibilityMap(
        '{"targetScope":["src/service.ts"],"responsibilities":[{"name":"run","currentOwners":["Service"],"consumers":[],"dependencies":[]}],"desired":{"ownership":[{"responsibility":"run","owner":"Runner"}],"boundaries":[]},"extra":true}',
      ),
    /extra is not supported/,
  );
});
