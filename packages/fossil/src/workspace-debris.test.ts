import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECK_IGNORE_ARGUMENTS,
  hasInboundWorkspaceUsage,
  IGNORED_DISCOVERY_ARGUMENTS,
  inspectWorkspaceFileMetadata,
  oldIgnoredWorkspaceCandidates,
  oldUntrackedWorkspaceCandidates,
  omitUsedWorkspaceCandidates,
  parseNulDelimitedPaths,
  parseVerboseCheckIgnore,
  UNTRACKED_DISCOVERY_ARGUMENTS,
  workspaceDebrisFinding,
} from "./workspace-debris.js";

// covers: fossil/workspace-debris :: Workspace file discovery :: Old untracked file is eligible
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

// covers: fossil/workspace-debris :: Workspace file discovery :: Old ignored file is eligible
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

// covers: fossil/workspace-debris :: Workspace file discovery :: Recent workspace file is omitted
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

// covers: fossil/workspace-debris :: Portable age evidence :: Unavailable creation time does not block analysis
test("uses old modification time when creation metadata is unavailable", () => {
  const now = 10 * 24 * 60 * 60 * 1_000;
  const candidates = oldUntrackedWorkspaceCandidates(
    [{ path: "scratch/old-without-birth.ts", isRegularFile: true, modifiedTimestampMs: 0 }],
    now,
    7,
  );

  assert.deepEqual(candidates, [{ path: "scratch/old-without-birth.ts", kind: "untracked", modifiedTimestampMs: 0 }]);
});

// covers: fossil/workspace-debris :: Usage evidence search :: Referenced old file is omitted
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

// covers: fossil/workspace-debris :: Usage evidence search :: Unreferenced old file is reported
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
    ageUncertainty: "Creation time is unavailable or unreliable; age uses modification time.",
    ignore: undefined,
    detectedReferenceEvidence: [],
    analysisBoundary: "C:/repo",
    unobservedReferenceMechanisms: ["dynamic runtime loading"],
  });
});

// covers: fossil/workspace-debris :: Safe workspace boundaries :: Dependency store is excluded
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

// covers: fossil/workspace-debris :: Safe workspace boundaries :: Sensitive file is excluded
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

// covers: fossil/workspace-debris :: Safe workspace boundaries :: External symlink is excluded
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
