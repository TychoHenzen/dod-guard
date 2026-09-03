import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECK_IGNORE_ARGUMENTS,
  filterWorkspaceDiscoveryPaths,
  hasInboundWorkspaceUsage,
  IGNORED_DISCOVERY_ARGUMENTS,
  inspectWorkspaceFileMetadata,
  inspectWorkspaceFileMetadataWithWarnings,
  oldIgnoredWorkspaceCandidates,
  oldUntrackedWorkspaceCandidates,
  omitUsedWorkspaceCandidates,
  parseNulDelimitedPaths,
  parseVerboseCheckIgnore,
  UNTRACKED_DISCOVERY_ARGUMENTS,
  workspaceDebrisFinding,
} from "./workspace-debris.js";

test("parses NUL-delimited untracked paths and selects an old regular file", () => {
  const unusualPath = "scratch/line\nbreak.ts";
  assert.deepEqual(UNTRACKED_DISCOVERY_ARGUMENTS, ["ls-files", "-z", "--others", "--exclude-standard"]);
  assert.deepEqual(parseNulDelimitedPaths(`scratch/old.ts\0${unusualPath}\0`), ["scratch/old.ts", unusualPath]);

  const candidates = oldUntrackedWorkspaceCandidates(
    [
      { path: "scratch/old.ts", isRegularFile: true, modifiedTimestampMs: 0 },
      { path: "scratch/directory", isRegularFile: false, modifiedTimestampMs: 0 },
    ],
    10 * 24 * 60 * 60 * 1_000,
    7,
  );

  assert.deepEqual(candidates, [{ path: "scratch/old.ts", kind: "untracked", modifiedTimestampMs: 0 }]);
});
test("retains NUL-delimited ignore rule provenance for an old ignored regular file", () => {
  assert.deepEqual(IGNORED_DISCOVERY_ARGUMENTS, ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"]);
  assert.deepEqual(CHECK_IGNORE_ARGUMENTS, ["check-ignore", "-z", "-v", "--stdin"]);
  const provenance = parseVerboseCheckIgnore(
    ".gitignore\0" +
      "4\0" +
      "*.cache\0" +
      "scratch/old.cache\0" +
      "C:/global/excludes\0" +
      "1\0" +
      "*.tmp\0" +
      "scratch/global.tmp\0",
    "C:/global/excludes",
  );
  assert.deepEqual(provenance, [
    { path: "scratch/old.cache", rule: "*.cache", source: "repository" },
    { path: "scratch/global.tmp", rule: "*.tmp", source: "global-exclude" },
  ]);

  const candidates = oldIgnoredWorkspaceCandidates(
    [{ path: "scratch/old.cache", isRegularFile: true, modifiedTimestampMs: 0 }],
    provenance,
    10 * 24 * 60 * 60 * 1_000,
    7,
  );
  assert.deepEqual(candidates, [
    {
      path: "scratch/old.cache",
      kind: "ignored",
      modifiedTimestampMs: 0,
      ignore: { rule: "*.cache", source: "repository" },
    },
  ]);
});
test("omits recent untracked and ignored workspace files", () => {
  const now = 10 * 24 * 60 * 60 * 1_000;
  const recentTimestampMs = now - 24 * 60 * 60 * 1_000;

  assert.deepEqual(
    oldUntrackedWorkspaceCandidates(
      [{ path: "scratch/recent.ts", isRegularFile: true, modifiedTimestampMs: recentTimestampMs }],
      now,
      7,
    ),
    [],
  );
  assert.deepEqual(
    oldIgnoredWorkspaceCandidates(
      [{ path: "scratch/recent.cache", isRegularFile: true, modifiedTimestampMs: recentTimestampMs }],
      [{ path: "scratch/recent.cache", rule: "*.cache", source: "repository" }],
      now,
      7,
    ),
    [],
  );
});
test("uses old modification time when creation metadata is unavailable", () => {
  const now = 10 * 24 * 60 * 60 * 1_000;
  const candidates = oldUntrackedWorkspaceCandidates(
    [{ path: "scratch/old-without-birth.ts", isRegularFile: true, modifiedTimestampMs: 0 }],
    now,
    7,
  );

  assert.deepEqual(candidates, [{ path: "scratch/old-without-birth.ts", kind: "untracked", modifiedTimestampMs: 0 }]);
});
test("includes untracked and ignored files exactly on the modification-age cutoff", () => {
  const now = 10 * 24 * 60 * 60 * 1_000;
  const cutoff = now - 7 * 24 * 60 * 60 * 1_000;

  assert.deepEqual(
    oldUntrackedWorkspaceCandidates(
      [{ path: "scratch/cutoff.ts", isRegularFile: true, modifiedTimestampMs: cutoff }],
      now,
      7,
    ),
    [{ path: "scratch/cutoff.ts", kind: "untracked", modifiedTimestampMs: cutoff }],
  );
  assert.deepEqual(
    oldIgnoredWorkspaceCandidates(
      [{ path: "scratch/cutoff.cache", isRegularFile: true, modifiedTimestampMs: cutoff }],
      [{ path: "scratch/cutoff.cache", rule: "*.cache", source: "repository" }],
      now,
      7,
    ),
    [
      {
        path: "scratch/cutoff.cache",
        kind: "ignored",
        modifiedTimestampMs: cutoff,
        ignore: { rule: "*.cache", source: "repository" },
      },
    ],
  );
});
test("uses one captured time for immediately adjacent modification-age boundaries", () => {
  const analysisTimestampMs = 10 * 24 * 60 * 60 * 1_000;
  const cutoff = analysisTimestampMs - 7 * 24 * 60 * 60 * 1_000;
  const candidates = oldUntrackedWorkspaceCandidates(
    [
      { path: "scratch/before.ts", isRegularFile: true, modifiedTimestampMs: cutoff - 1 },
      { path: "scratch/at.ts", isRegularFile: true, modifiedTimestampMs: cutoff },
      { path: "scratch/after.ts", isRegularFile: true, modifiedTimestampMs: cutoff + 1 },
    ],
    analysisTimestampMs,
    7,
  );

  assert.deepEqual(candidates, [
    { path: "scratch/before.ts", kind: "untracked", modifiedTimestampMs: cutoff - 1 },
    { path: "scratch/at.ts", kind: "untracked", modifiedTimestampMs: cutoff },
  ]);
});
test("omits old candidates with resolved imports, exact paths, or a unique basename", () => {
  const candidate = { path: "scratch/old.ts", kind: "untracked" as const, modifiedTimestampMs: 0 };
  const sources = [
    {
      path: "src/importer.ts",
      language: "typescript" as const,
      content: 'import "../scratch/old";\n',
    },
    { path: "scratch/old.ts", language: "typescript" as const, content: 'const own = "old.ts";\n' },
    {
      path: "src/path-user.ts",
      language: "typescript" as const,
      content: 'const source = "scratch/old.ts";\n',
    },
  ];
  const inventory = ["src/importer.ts", "src/path-user.ts", "scratch/old.ts"];

  assert.equal(hasInboundWorkspaceUsage(candidate.path, sources, inventory), true);
  assert.equal(
    hasInboundWorkspaceUsage(
      candidate.path,
      [{ path: "src/path-user.ts", language: "typescript", content: 'const source = "scratch/old.ts";\n' }],
      ["src/path-user.ts", "scratch/old.ts", "other/old.ts"],
    ),
    true,
  );
  assert.equal(
    hasInboundWorkspaceUsage(
      "scratch/unique.ts",
      [{ path: "src/user.ts", language: "typescript", content: 'const source = "unique.ts";\n' }],
      ["src/user.ts", "scratch/unique.ts"],
    ),
    true,
  );
  assert.deepEqual(omitUsedWorkspaceCandidates([candidate], sources, inventory), []);
  assert.equal(workspaceDebrisFinding(candidate, sources, inventory, "C:/repo", []), undefined);
});
test("reports an unreferenced old candidate as separate workspace debris", () => {
  const finding = workspaceDebrisFinding(
    { path: "scratch/old.ts", kind: "untracked", modifiedTimestampMs: 0 },
    [{ path: "src/live.ts", language: "typescript", content: "export const live = true;\n" }],
    ["src/live.ts", "scratch/old.ts"],
    "C:/repo",
    ["dynamic runtime loading"],
  );

  assert.deepEqual(finding, {
    classification: "advisory",
    review: "possible workspace debris",
    path: "scratch/old.ts",
    kind: "untracked",
    modifiedTimestampMs: 0,
    ageSource: "mtime",
    ageUncertainty:
      "Modification time is filesystem metadata. Copying, restoring, extracting, or rebuilding can change it.",
    ignore: undefined,
    detectedReferenceEvidence: [],
    analysisBoundary: "C:/repo",
    unobservedReferenceMechanisms: ["dynamic runtime loading"],
  });
});
test("labels a high-confidence-looking debris candidate for review with mtime uncertainty", () => {
  const finding = workspaceDebrisFinding(
    { path: "scratch/very-old.ts", kind: "untracked", modifiedTimestampMs: 0 },
    [],
    ["scratch/very-old.ts"],
    "C:/repo",
    ["runtime reflection"],
  );

  assert.ok(finding);
  assert.equal(finding.classification, "advisory");
  assert.equal(finding.review, "possible workspace debris");
  assert.equal(finding.ageSource, "mtime");
  assert.equal(finding.ageUncertainty.includes("Copying, restoring, extracting, or rebuilding can change it."), true);
  assert.deepEqual(finding.unobservedReferenceMechanisms, ["runtime reflection"]);
  assert.equal(JSON.stringify(finding).toLowerCase().includes("delete"), false);
});
test("excludes dependency-store paths before metadata reads and ignored candidate evaluation", () => {
  const metadataReads: string[] = [];
  const metadata = inspectWorkspaceFileMetadata(["node_modules/old.cache", "scratch\\old.cache"], (path) => {
    metadataReads.push(path);
    return { path, isRegularFile: true, modifiedTimestampMs: 0 };
  });

  assert.deepEqual(metadataReads, ["scratch/old.cache"]);
  assert.deepEqual(
    oldIgnoredWorkspaceCandidates(
      metadata,
      [
        { path: "node_modules/old.cache", rule: "*.cache", source: "repository" },
        { path: "scratch/old.cache", rule: "*.cache", source: "repository" },
      ],
      10 * 24 * 60 * 60 * 1_000,
      7,
    ),
    [
      {
        path: "scratch/old.cache",
        kind: "ignored",
        modifiedTimestampMs: 0,
        ignore: { rule: "*.cache", source: "repository" },
      },
    ],
  );
});
test("excludes mixed-case sensitive files, extensions, prefixes, and directories before metadata reads", () => {
  const metadataReads: string[] = [];
  const metadata = inspectWorkspaceFileMetadata(
    ["config/.ENV.Production", "certs/Client.PEM", "secrets/CredentialsBackup", ".AwS\\config", "scratch/allowed.ts"],
    (path) => {
      metadataReads.push(path);
      return { path, isRegularFile: true, modifiedTimestampMs: 0 };
    },
  );

  assert.deepEqual(metadataReads, ["scratch/allowed.ts"]);
  assert.deepEqual(metadata, [{ path: "scratch/allowed.ts", isRegularFile: true, modifiedTimestampMs: 0 }]);
});
test("drops no-follow symbolic-link and junction metadata without inspecting resolved targets", () => {
  const metadataReads: string[] = [];
  const metadata = inspectWorkspaceFileMetadata(
    ["scratch/external-link", "scratch/junction", "scratch/regular.ts"],
    (path) => {
      metadataReads.push(path);
      return {
        path,
        isRegularFile: path === "scratch/regular.ts",
        isSymbolicLink: path === "scratch/external-link",
        isJunction: path === "scratch/junction",
        modifiedTimestampMs: 0,
      };
    },
  );

  assert.deepEqual(metadataReads, ["scratch/external-link", "scratch/junction", "scratch/regular.ts"]);
  assert.deepEqual(metadata, [
    {
      path: "scratch/regular.ts",
      isRegularFile: true,
      isSymbolicLink: false,
      isJunction: false,
      modifiedTimestampMs: 0,
    },
  ]);
});
test("warns for an unreadable discovered path and continues without creating candidate metadata", () => {
  const metadataReads: string[] = [];
  const result = inspectWorkspaceFileMetadataWithWarnings(["scratch/unreadable.ts", "scratch/later.ts"], (path) => {
    metadataReads.push(path);
    if (path === "scratch/unreadable.ts") throw new Error("sensitive filesystem failure");
    return { path, isRegularFile: true, modifiedTimestampMs: 0 };
  });

  assert.deepEqual(metadataReads, ["scratch/unreadable.ts", "scratch/later.ts"]);
  assert.deepEqual(result.metadata, [{ path: "scratch/later.ts", isRegularFile: true, modifiedTimestampMs: 0 }]);
  assert.deepEqual(result.warnings, [
    {
      code: "workspace_unreadable",
      message: "Workspace path could not be inspected.",
      path: "scratch/unreadable.ts",
    },
  ]);
  assert.equal(JSON.stringify(result.warnings).includes("sensitive filesystem failure"), false);
  assert.deepEqual(oldUntrackedWorkspaceCandidates(result.metadata, 10 * 24 * 60 * 60 * 1_000, 7), [
    { path: "scratch/later.ts", kind: "untracked", modifiedTimestampMs: 0 },
  ]);
});
test("filters caller-excluded paths before metadata reads, warnings, and ignore provenance input", () => {
  const discoveredPaths = filterWorkspaceDiscoveryPaths(
    ["ignored\\hidden.cache", "scratch/allowed.ts"],
    ["ignored/**", "[malformed", "x".repeat(257)],
  );
  const metadataReads: string[] = [];
  const result = inspectWorkspaceFileMetadataWithWarnings(
    ["ignored\\hidden.cache", "scratch/allowed.ts"],
    (path) => {
      metadataReads.push(path);
      return { path, isRegularFile: true, modifiedTimestampMs: 0 };
    },
    ["ignored/**"],
  );

  assert.deepEqual(discoveredPaths, ["scratch/allowed.ts"]);
  assert.deepEqual(filterWorkspaceDiscoveryPaths(["ignored/nested/file.ts"], [`ignored/${"*".repeat(80)}`]), []);
  assert.deepEqual(
    filterWorkspaceDiscoveryPaths(
      ["ignored/limit.ts"],
      [...Array.from({ length: 64 }, (_, index) => `nonmatching-${index}`), "ignored/**"],
    ),
    ["ignored/limit.ts"],
  );
  assert.deepEqual(metadataReads, ["scratch/allowed.ts"]);
  assert.deepEqual(result.warnings, []);
  assert.equal(discoveredPaths.includes("ignored/hidden.cache"), false);
});
