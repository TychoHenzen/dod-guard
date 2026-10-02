// Every check in plugin-checks.mjs must genuinely fail, not just genuinely
// pass. The predicate that answers "does git track this file" is injected
// here as a fake, because a fixture that leaves a real file untracked in this
// repo would be absent from a clone, existsSync would filter it out, and the
// rule would pass vacuously without ever being tested.

import { deepStrictEqual, match, ok, strictEqual } from "node:assert";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { cliWorkspaceTree, invalidPluginWorkspaceTree } from "./fixtures/cli-workspace.mjs";
import {
  buildOpenCodePlugin,
  buildPkg,
  goodOpenCodeTree,
  goodTree,
  PKG_NAME,
  write,
} from "./fixtures/plugin-tracked.mjs";
import { createPluginChecks } from "./lib/plugin-checks.mjs";
import { discoverPluginWorkspaces } from "./lib/workspace-discovery.mjs";

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function tree() {
  const root = goodTree();
  temps.push(root);
  return root;
}

function fixture(factory) {
  const root = factory();
  temps.push(root);
  return root;
}

function collect(pkg, isTracked) {
  const violations = [];
  const { checkPackage } = createPluginChecks((file, message) => violations.push({ file, message }), isTracked);
  checkPackage(pkg, [pkg]);
  return violations;
}

function collectPackages(packages, isTracked = alwaysTracked) {
  const violations = [];
  const { checkPackage } = createPluginChecks((file, message) => violations.push({ file, message }), isTracked);
  for (const pkg of packages) checkPackage(pkg, packages);
  return violations;
}

async function collectOpenCode(root, isTracked = alwaysTracked) {
  const violations = [];
  const { checkOpenCodeAdapter } = createPluginChecks((file, message) => violations.push({ file, message }), isTracked);
  await checkOpenCodeAdapter(buildOpenCodePlugin(root));
  return violations;
}

const alwaysTracked = () => true;

describe("validate-plugins: git-tracked rules", () => {
  it("reports nothing on a clean tree with everything tracked", () => {
    const root = tree();
    const pkg = buildPkg(root);
    deepStrictEqual(collect(pkg, alwaysTracked), []);
  });

  it("fails when the bundle exists but is not tracked by git", () => {
    const root = tree();
    const pkg = buildPkg(root);
    const isTracked = (file) => file !== pkg.bundle;
    const violations = collect(pkg, isTracked);
    strictEqual(violations.length, 1, JSON.stringify(violations));
    match(violations[0].message, /dist\/bundle\.js not tracked by git/);
  });

  it("fails when the bundle is missing from disk entirely", () => {
    const root = tree();
    const pkg = buildPkg(root);
    rmSync(pkg.bundle);
    const violations = collect(pkg, alwaysTracked);
    strictEqual(violations.length, 1, JSON.stringify(violations));
    match(violations[0].message, /dist\/bundle\.js missing/);
  });

  it("fails when a hook command targets a file git does not track", () => {
    const root = tree();
    const pkg = buildPkg(root);
    const isTracked = (file) => file !== pkg.hookScript;
    const violations = collect(pkg, isTracked);
    strictEqual(violations.length, 1, JSON.stringify(violations));
    match(violations[0].message, /hook command targets untracked file/);
  });

  it("fails when a package contains its own marketplace", () => {
    const root = tree();
    const pkg = buildPkg(root);
    write(
      root,
      `packages/${PKG_NAME}/.claude-plugin/marketplace.json`,
      JSON.stringify({ name: PKG_NAME, plugins: [{ name: PKG_NAME }] }),
    );
    const violations = collect(pkg, alwaysTracked);
    strictEqual(violations.length, 1, JSON.stringify(violations));
    match(violations[0].message, /package-level marketplace is forbidden/);
  });
});

describe("validate-plugins: workspace discovery", () => {
  it("skips a CLI-only workspace that has no plugin manifest", () => {
    const root = fixture(cliWorkspaceTree);
    deepStrictEqual(discoverPluginWorkspaces(join(root, "packages")), []);
  });

  it("includes a workspace that declares a plugin manifest and validates it", () => {
    const root = fixture(invalidPluginWorkspaceTree);
    const packages = discoverPluginWorkspaces(join(root, "packages"));
    strictEqual(packages.length, 1);
    const violations = collect(packages[0], alwaysTracked);
    match(violations.map((violation) => violation.message).join("\n"), /Claude Code cannot start the MCP server/);
    match(violations.map((violation) => violation.message).join("\n"), /dist\/bundle\.js missing/);
    const missingRoot = fixture(invalidPluginWorkspaceTree);
    rmSync(join(missingRoot, "packages/broken/package.json"));
    const missingPackages = discoverPluginWorkspaces(join(missingRoot, "packages"));
    strictEqual(missingPackages.length, 1);
    match(
      collect(missingPackages[0], alwaysTracked)
        .map((violation) => violation.message)
        .join("\n"),
      /plugin package metadata is required/,
    );
  });
});

describe("validate-plugins: shipped plugin version metadata", () => {
  it("accepts matching package, Claude, and Codex versions", () => {
    const root = tree();
    deepStrictEqual(collect(buildPkg(root)), []);
  });

  it("reports every affected source for each mismatch direction", () => {
    const sources = [
      ["package", `packages/${PKG_NAME}/package.json`],
      ["Claude", `packages/${PKG_NAME}/.claude-plugin/plugin.json`],
      ["Codex", `packages/${PKG_NAME}/.codex-plugin/plugin.json`],
    ];

    for (const [label, relativePath] of sources) {
      const root = tree();
      const file = join(root, relativePath);
      const metadata = JSON.parse(readFileSync(file, "utf8"));
      metadata.version = "1.0.1";
      write(root, relativePath, JSON.stringify(metadata));
      const violations = collect(buildPkg(root));
      const messages = violations.map((violation) => violation.message).join("\n");

      ok(messages.includes(`version "1.0.1"`), `${label} mismatch was not reported`);
      match(messages, /observed: package\.json="(?:1\.0\.0|1\.0\.1)"/);
      ok(
        violations.some((violation) => violation.file.endsWith("package.json")),
        `${label} mismatch omitted package.json`,
      );
      ok(
        violations.some((violation) => violation.file.endsWith(join(".claude-plugin", "plugin.json"))),
        `${label} mismatch omitted the Claude manifest`,
      );
      ok(
        violations.some((violation) => violation.file.endsWith(join(".codex-plugin", "plugin.json"))),
        `${label} mismatch omitted the Codex manifest`,
      );
    }
  });

  it("reports missing or malformed versions without changing metadata", () => {
    const missingRoot = tree();
    const packageFile = `packages/${PKG_NAME}/package.json`;
    const packagePath = join(missingRoot, packageFile);
    const before = readFileSync(packagePath, "utf8");
    const packageMetadata = JSON.parse(before);
    delete packageMetadata.version;
    write(missingRoot, packageFile, JSON.stringify(packageMetadata));
    const missingMessages = collect(buildPkg(missingRoot))
      .map((violation) => violation.message)
      .join("\n");
    match(missingMessages, /version must be x\.y\.z, got undefined/);
    strictEqual(JSON.parse(readFileSync(packagePath, "utf8")).version, undefined);

    const malformedRoot = tree();
    const codexFile = `packages/${PKG_NAME}/.codex-plugin/plugin.json`;
    const codexPath = join(malformedRoot, codexFile);
    write(malformedRoot, codexFile, "{\n");
    const malformedMessages = collect(buildPkg(malformedRoot))
      .map((violation) => violation.message)
      .join("\n");
    match(malformedMessages, /Codex manifest version metadata is not valid JSON/);
    strictEqual(readFileSync(codexPath, "utf8"), "{\n");

    const absentRoot = tree();
    const absentPath = join(absentRoot, codexFile);
    rmSync(absentPath);
    const absentMessages = collect(buildPkg(absentRoot))
      .map((violation) => violation.message)
      .join("\n");
    match(absentMessages, /Codex manifest version is missing \(observed unavailable\)/);
  });

  it("rejects an untracked Codex manifest", () => {
    const root = tree();
    const pkg = buildPkg(root);
    const codexFile = join(pkg.dir, ".codex-plugin", "plugin.json");
    const violations = collect(pkg, (file) => file !== codexFile);
    strictEqual(violations.length, 1, JSON.stringify(violations));
    match(violations[0].message, /Codex manifest would not ship/);
  });

  it("checks each plugin independently when multiple plugins are scanned", () => {
    const firstRoot = tree();
    const secondRoot = tree();
    const codexFile = `packages/${PKG_NAME}/.codex-plugin/plugin.json`;
    const codexPath = join(secondRoot, codexFile);
    const codexMetadata = JSON.parse(readFileSync(codexPath, "utf8"));
    codexMetadata.version = "1.0.1";
    write(secondRoot, codexFile, JSON.stringify(codexMetadata));

    const violations = collectPackages([buildPkg(firstRoot), buildPkg(secondRoot)]);
    ok(violations.length > 0);
    ok(violations.every((violation) => violation.file.startsWith(secondRoot)));
  });
});

describe("validate-plugins: OpenCode adapter metadata", () => {
  it("accepts a tracked adapter that shares the Claude/Codex inventory", async () => {
    const root = fixture(goodOpenCodeTree);
    deepStrictEqual(await collectOpenCode(root), []);
  });

  it("fails when the OpenCode package metadata is missing or malformed", async () => {
    const missingRoot = fixture(goodOpenCodeTree);
    rmSync(join(missingRoot, "plugins", PKG_NAME, "package.json"));
    match(
      (await collectOpenCode(missingRoot)).map((violation) => violation.message).join("\n"),
      /package metadata is required/,
    );

    const malformedRoot = fixture(goodOpenCodeTree);
    write(malformedRoot, `plugins/${PKG_NAME}/package.json`, "{\n");
    match((await collectOpenCode(malformedRoot)).map((violation) => violation.message).join("\n"), /not valid JSON/);
  });

  it("fails when the entrypoint is missing or untracked", async () => {
    const missingRoot = fixture(goodOpenCodeTree);
    rmSync(join(missingRoot, "plugins", PKG_NAME, "index.js"));
    match((await collectOpenCode(missingRoot)).map((violation) => violation.message).join("\n"), /entrypoint/);

    const untrackedRoot = fixture(goodOpenCodeTree);
    const entrypoint = join(untrackedRoot, "plugins", PKG_NAME, "index.js");
    const violations = await collectOpenCode(untrackedRoot, (file) => file !== entrypoint);
    match(violations.map((violation) => violation.message).join("\n"), /entrypoint would not ship/);
  });

  it("fails when the entrypoint export is malformed", async () => {
    const root = fixture(goodOpenCodeTree);
    write(root, `plugins/${PKG_NAME}/index.js`, 'export default { id: "sample-plugin" };\n');
    match(
      (await collectOpenCode(root)).map((violation) => violation.message).join("\n"),
      /default OpenCode plugin.*setup function/,
    );
  });

  it("fails when package files omit a shared inventory directory", async () => {
    const root = fixture(goodOpenCodeTree);
    const packageFile = join(root, "plugins", PKG_NAME, "package.json");
    const packageJson = JSON.parse(readFileSync(packageFile, "utf8"));
    packageJson.files = ["index.js", "skills"];
    write(root, `plugins/${PKG_NAME}/package.json`, JSON.stringify(packageJson));
    match(
      (await collectOpenCode(root)).map((violation) => violation.message).join("\n"),
      /files must include "agents"/,
    );
  });

  it("fails when the OpenCode package contract is incompatible", async () => {
    const dependencyRoot = fixture(goodOpenCodeTree);
    const dependencyFile = join(dependencyRoot, "plugins", PKG_NAME, "package.json");
    const dependencyJson = JSON.parse(readFileSync(dependencyFile, "utf8"));
    dependencyJson.dependencies["@opencode/plugin"] = "2.0.17";
    write(dependencyRoot, `plugins/${PKG_NAME}/package.json`, JSON.stringify(dependencyJson));
    match(
      (await collectOpenCode(dependencyRoot)).map((violation) => violation.message).join("\n"),
      /dependencies.*@opencode\/plugin.*2\.0\.18/,
    );

    const versionRoot = fixture(goodOpenCodeTree);
    const versionFile = join(versionRoot, "plugins", PKG_NAME, "package.json");
    const versionJson = JSON.parse(readFileSync(versionFile, "utf8"));
    versionJson.version = "1.0.1";
    write(versionRoot, `plugins/${PKG_NAME}/package.json`, JSON.stringify(versionJson));
    match(
      (await collectOpenCode(versionRoot)).map((violation) => violation.message).join("\n"),
      /version "1\.0\.1" disagrees with plugin metadata "1\.0\.0"/,
    );
  });
});
