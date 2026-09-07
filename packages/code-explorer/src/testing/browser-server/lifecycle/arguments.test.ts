import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseServeArguments } from "../../../browser-server/lifecycle.js";

describe("browser server lifecycle", () => {
  it(
    "uses the working directory project vector when serve " +
      "has no project argument",
    () => {
      assert.deepEqual(parseServeArguments(["serve"]), {
        project_root: ".",
        no_open: false,
      });
    },
  );
  it(
    "preserves an explicit project argument instead of " +
      "substituting the working directory",
    () => {
      assert.deepEqual(
        parseServeArguments(["serve", "--project-root", "..", "--no-open"]),
        {
          project_root: "..",
          no_open: true,
        },
      );
    },
  );
});
