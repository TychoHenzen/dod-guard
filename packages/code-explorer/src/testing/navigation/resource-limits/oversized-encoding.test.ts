import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { countingAdapter } from "./counting-adapter.js";

it(
  "rejects oversized filter values and serialized requests " +
    "before any backend dispatch",
  async () => {
    let calls = 0;
    const server = createServer({ adapters: [countingAdapter(() => calls++)] });
    for (const arguments_ of [
      { query: "x", path_globs: ["x".repeat(257)] },
      { query: "x", path_globs: ["x".repeat(65 * 1024)] },
    ]) {
      const result = await server.call("code_search", arguments_);
      assert.equal("code" in result && result.code, "resource_limit");
    }
    assert.equal(calls, 0);
  },
);
