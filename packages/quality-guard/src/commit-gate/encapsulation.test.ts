import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { analyzeChangeLocality, analyzeEncapsulation } from "./encapsulation.js";
import { parseQualityConfig } from "./config.js";

// covers: quality-guard/architecture-analysis :: Encapsulation and change locality are measured :: Public surface grows without a production caller
test("reports a newly public symbol with its observed callers", () => {
  const result = analyzeEncapsulation(
    [{ path: "src/service.ts", imports: [], references: [], types: [{ name: "Service", members: [], dependencies: [], forwardingPaths: [] }] }],
    [
      {
        path: "src/service.ts",
        imports: [],
        references: [],
        types: [{ name: "Service", members: [{ name: "preview", kind: "method", visibility: "public" }], dependencies: [], forwardingPaths: [] }],
      },
      { path: "test/service.test.ts", imports: [], references: ["Service.preview"], types: [] },
    ],
    ["src/service.ts"],
    parseQualityConfig("{}"),
  );
  assert.deepEqual(result, [
    {
      kind: "public-surface-growth",
      path: "src/service.ts",
      symbol: "Service.preview",
      productionCallers: [],
      testCallers: ["test/service.test.ts"],
    },
    {
      kind: "test-only-seam",
      path: "src/service.ts",
      symbol: "Service.preview",
      productionCallers: [],
      testCallers: ["test/service.test.ts"],
    },
  ]);
});

test("reports forwarding compatibility paths as review evidence", () => {
  const result = analyzeEncapsulation(
    [{ path: "src/service.ts", imports: [], references: [], types: [{ name: "Service", members: [], dependencies: [], forwardingPaths: [] }] }],
    [
      {
        path: "src/service.ts",
        imports: [],
        references: [],
        types: [{ name: "Service", members: [], dependencies: [], forwardingPaths: [{ member: "oldRun", target: "worker.run" }] }],
      },
    ],
    ["src/service.ts"],
    parseQualityConfig("{}"),
  );
  assert.deepEqual(result, [{ kind: "forwarding-path", path: "src/service.ts", type: "Service", member: "oldRun", target: "worker.run" }]);
});

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "pipe" });
}

// covers: quality-guard/architecture-analysis :: Encapsulation and change locality are measured :: File is outside the historical change cluster
test("reports a staged file with no co-changes in the bounded first-parent history", () => {
  const root = mkdtempSync(join(tmpdir(), "quality-locality-"));
  try {
    git(root, ["init"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Quality Test"]);
    writeFileSync(join(root, "owner.ts"), "export class Owner {}\n");
    writeFileSync(join(root, "helper.ts"), "export class Helper {}\n");
    writeFileSync(join(root, "outsider.ts"), "export class Outsider {}\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);
    writeFileSync(join(root, "owner.ts"), "export class Owner { run() {} }\n");
    writeFileSync(join(root, "helper.ts"), "export class Helper { run() {} }\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "owner and helper"]);
    writeFileSync(join(root, "outsider.ts"), "export class Outsider { run() {} }\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "outsider only"]);

    const result = analyzeChangeLocality(root, ["owner.ts", "helper.ts", "outsider.ts"], parseQualityConfig('{"history":{"maxFirstParentCommits":2}}'));
    assert.deepEqual(result, [
      {
        kind: "outside-change-cluster",
        path: "outsider.ts",
        historyWindow: 2,
        fileChangeCount: 1,
        coChangeCount: 0,
        comparedPaths: ["helper.ts", "owner.ts"],
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
