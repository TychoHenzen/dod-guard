/**
 * solve-session declares one interface and nothing else. It makes no
 * decision, so there is no behavior to assert. This file pins the module as
 * type-only. Add a helper, a default or a constant here, and the check below
 * fails. The addition then has to move to a module that has tests.
 */

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as session from "./solve-session.js";

describe("solve-session", () => {
  it("ships no runtime code", () => {
    assert.deepEqual(Object.keys(session), []);
  });

  it("has no default export either", () => {
    assert.equal((session as { default?: unknown }).default, undefined);
  });
});
