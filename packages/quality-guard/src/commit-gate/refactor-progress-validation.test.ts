import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResponsibilityMap } from "./responsibility-map.js";

test(
  "rejects incomplete, outcome-free, and unknown responsibility map fields",
  () => {
  assert.throws(
    () =>
      parseResponsibilityMap(
        '{"targetScope":["src/a.ts"],"responsibilities":[],"desired":' +
          '{"ownership":[],"boundaries":[]}}',
      ),
    /responsibilities/,
  );
  assert.throws(
    () =>
      parseResponsibilityMap(
        '{"targetScope":["src/a.ts"],"responsibilities":[{"name":"run",' +
          '"currentOwners":["Service"],"consumers":[],"dependencies":[]}' +
          '],"desired":{"ownership":[],"boundaries":[]}}',
      ),
    /outcome/,
  );
  assert.throws(
    () =>
      parseResponsibilityMap(
        '{"targetScope":["src/a.ts"],"responsibilities":[{"name":"run",' +
          '"currentOwners":["Service"],"consumers":[],"dependencies":[]}' +
          '],"desired":{"ownership":[],"boundaries":[]},"extra":true}',
      ),
    /not supported/,
  );
});
