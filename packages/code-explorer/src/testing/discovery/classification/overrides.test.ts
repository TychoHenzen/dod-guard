import assert from "node:assert/strict";
import { it } from "node:test";
import { classifyProjectPath } from "../../../discovery/classification.js";

it(
  "lets the last matching explicit override classify a " +
    "generated path as production",
  () => {
    const config = {
      generated: [],
      test: [],
      production: [],
      overrides: [{ glob: "generated/**", class: "production" as const }],
    };
    assert.deepEqual(classifyProjectPath("generated/helper.ts", config), {
      content: "production",
      source: "configuration_override",
    });
  },
);
it(
  "applies ordered class arrays and ordered overrides " + "after those arrays",
  () => {
    const config = {
      generated: ["shared/**"],
      test: ["shared/**"],
      production: ["shared/**"],
      overrides: [
        { glob: "shared/**", class: "test" as const },
        { glob: "shared/**", class: "generated" as const },
      ],
    };
    assert.deepEqual(classifyProjectPath("shared/helper.ts", config), {
      content: "generated",
      source: "configuration_override",
    });
  },
);
