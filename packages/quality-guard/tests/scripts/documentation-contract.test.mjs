import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repository = resolve(import.meta.dirname, "..", "..", "..", "..");

const paths = [
  "AGENTS.md",
  "packages/quality-guard/AGENTS.md",
  "packages/quality-guard/README.md",
  "packages/quality-guard/package.json",
  "packages/quality-guard/.claude-plugin/plugin.json",
  "packages/quality-guard/.codex-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  "plugins/dod-guard/README.md",
  "packages/quality-guard/skills/quality-refactor/SKILL.md",
  "packages/quality-guard/skills/quality-refactor/reference/rules.md",
  "plugins/dod-guard/skills/next-ticket/SKILL.md",
  "plugins/dod-guard/skills/goal-sdlc/SKILL.md",
  "plugins/dod-guard/skills/setup-repository/SKILL.md",
];

const documents = new Map(
  await Promise.all(
    paths.map(async (path) => [
      path,
      await readFile(resolve(repository, path), "utf8"),
    ]),
  ),
);

test("active quality documentation describes advisory report-only behavior", () => {
  assert.match(documents.get("packages/quality-guard/README.md"), /advisory/i);
  assert.match(
    documents.get("packages/quality-guard/README.md"),
    /quality_scan.*quality_report.*quality_test_quality/s,
  );
  assert.match(
    documents.get("packages/quality-guard/AGENTS.md"),
    /stored acceptance state/,
  );
  assert.match(
    documents.get("packages/quality-guard/skills/quality-refactor/SKILL.md"),
    /final scanner in advisory mode/,
  );
  assert.match(documents.get("AGENTS.md"), /diagnostic evidence/);
  assert.match(
    documents.get("plugins/dod-guard/skills/next-ticket/SKILL.md"),
    /report-only evidence/,
  );
  assert.match(
    documents.get("plugins/dod-guard/skills/goal-sdlc/SKILL.md"),
    /Quality Guard output is advisory diagnostic evidence/,
  );
  assert.match(
    documents.get("plugins/dod-guard/skills/setup-repository/SKILL.md"),
    /persisted quality state/,
  );
});

test("active quality documentation does not advertise retired decision state", () => {
  const activeDocumentation = [...documents.entries()]
    .filter(
      ([path]) =>
        !path.endsWith("package.json") && !path.endsWith("plugin.json"),
    )
    .map(([path, contents]) => `${path}\n${contents}`)
    .join("\n");
  for (const pattern of [
    /quality-guard check --(?:staged|committed)/i,
    /quality_commit_gate/i,
    /quality_skips/i,
    /--write-baseline(?:=|\b)/i,
    /\.quality-skip/i,
    /skip-log\.json/i,
    /REVIEW_REQUIRED/i,
    /committed-tree replay/i,
    /numeric quality enforcement/i,
    /\bratchet baselines?\b/i,
    /\b(?:waiver|sentinel)\b/i,
  ]) {
    assert.doesNotMatch(activeDocumentation, pattern);
  }
});

test("quality-guard manifests expose only advisory documentation", () => {
  const packageJson = JSON.parse(
    documents.get("packages/quality-guard/package.json"),
  );
  const claudeManifest = JSON.parse(
    documents.get("packages/quality-guard/.claude-plugin/plugin.json"),
  );
  const codexManifest = JSON.parse(
    documents.get("packages/quality-guard/.codex-plugin/plugin.json"),
  );
  const marketplace = JSON.parse(
    documents.get(".claude-plugin/marketplace.json"),
  );
  const marketplaceEntry = marketplace.plugins.find(
    (plugin) => plugin.name === "quality-guard",
  );

  for (const description of [
    packageJson.description,
    claudeManifest.description,
    codexManifest.description,
    codexManifest.interface.longDescription,
    marketplaceEntry.description,
  ]) {
    assert.match(description, /advisory/i);
  }
  assert.match(codexManifest.interface.defaultPrompt[0], /advisory/i);
  assert.deepEqual(codexManifest.interface.capabilities, [
    "MCP tools",
    "Skills",
  ]);
});
