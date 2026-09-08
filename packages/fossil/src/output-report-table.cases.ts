import assert from "node:assert/strict";
import { test } from "node:test";
import { renderFossilReportTable } from "./output.js";
import { finding } from "./output.test-support.js";

test(
  "escapes controls in whole-report warnings and " + "workspace debris rows",
  () => {
    const control = "\u001b\u0085";
    const report = JSON.parse(
      JSON.stringify({
        options: { verbose: false },
        statistics: { workspaceDebrisCount: 21 },
        warnings: [
          {
            code: `workspace_unreadable${control}`,
            path: `src/${control}warning.ts`,
            message: `warning${control}message`,
          },
        ],
        bursts: [],
        workspaceDebris: [
          {
            ...finding(`scratch/${control}path.ts`, "untracked"),
            review: `possible${control}workspace debris`,
          },
          ...Array.from({ length: 20 }, (_, index) =>
            finding(`ignored${control}/file-${index}.tmp`, "ignored"),
          ),
        ],
      }),
    );

    const redirected = renderFossilReportTable(report, { isTty: false });
    const hasTerminalControl = (value: string) =>
      [...value].some((character) => {
        const codePoint = character.codePointAt(0) ?? -1;
        return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
      });

    assert.equal(redirected.split("\n").some(hasTerminalControl), false);
    assert.equal(
      redirected.includes("workspace_unreadable\\u001b\\u0085"),
      true,
    );
    assert.equal(redirected.includes("src/\\u001b\\u0085warning.ts"), true);
    assert.equal(redirected.includes("warning\\u001b\\u0085message"), true);
    assert.equal(redirected.includes("scratch/\\u001b\\u0085path.ts"), true);
    assert.equal(
      redirected.includes("possible\\u001b\\u0085workspace debris"),
      true,
    );
    assert.equal(
      redirected.includes(
        "ignored directory ignored\\u001b\\u0085: 20 findings",
      ),
      true,
    );
  },
);
