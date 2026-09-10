import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildConfig } from "./config.mjs";
import { scan } from "../quality-scan-run.mjs";

test("a narrowed scan still reads manifests from the repository root", () => {
  const root = mkdtempSync(join(tmpdir(), "quality-scan-manifest-root-"));
  try {
    mkdirSync(join(root, "Scripts"), { recursive: true });
    writeFileSync(
      join(root, "Scripts", "TerminalDisplay.cs"),
      "public class TerminalDisplay {}\n",
    );
    const options = {
      paths: ["Scripts"],
      root,
      excludes: [],
      testPaths: [],
      rules: ["dead-export"],
    };
    const withoutManifest = scan(options, buildConfig("default"));
    assert.equal(
      withoutManifest.violations.some(
        (violation) => violation.rule === "dead-export",
      ),
      true,
    );

    writeFileSync(join(root, "Root.tscn"), '[node type="TerminalDisplay"]\n');
    const withManifest = scan(options, buildConfig("default"));
    assert.equal(
      withManifest.violations.some(
        (violation) => violation.rule === "dead-export",
      ),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
