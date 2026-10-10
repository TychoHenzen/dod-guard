// Keeps retired Quality Guard vocabulary from returning. Structural severities
// are high, medium, and low, and the --profile and --fail-on options are gone.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const SOURCE_ROOTS = ["src", "scripts", "skills/quality-refactor/scripts"];
const SEVERITY_OWNERS = [
  "skills/quality-refactor/scripts/lib/config-values.mjs",
  "skills/quality-refactor/scripts/lib/config.mjs",
  "skills/quality-refactor/scripts/lib/severity.mjs",
];
const SKIPPED_DIRECTORIES = new Set([
  "coverage",
  "dist-test",
  "node_modules",
  "tests",
]);
const MIN_SOURCE_FILES = 20;

const SOURCE_FILE = /\.(?:ts|mjs|js)$/;
const OPTION_TOKEN = /--(?:profile|fail-on)/g;
const SEVERITY_ASSIGNMENT =
  /\bseverity["']?\s*(?:===?|!==?|\?\?|\|\||[:=])[^,;)}\n]*?(["'`])(error|warn|warning)\1/gi;
const RETIRED_LITERAL = /(["'])(?:error|warn|warning)\1/g;
const RETIRED_KEY = /(?<=[{,]\s*|^\s*)(?:error|warn|warning)(?=\s*:)/gm;

const literalToken = (match) => match[0];
const severityToken = (match) => `severity "${match[2]}"`;

function matchesOf(text, pattern, tokenOf) {
  return [...text.matchAll(pattern)].map((match) => ({
    index: match.index,
    token: tokenOf(match),
  }));
}

function hitsFor(text, kind) {
  const hits = matchesOf(text, OPTION_TOKEN, literalToken);
  if (kind === "source" || kind === "severity-owner") {
    hits.push(...matchesOf(text, SEVERITY_ASSIGNMENT, severityToken));
  }
  if (kind === "severity-owner") {
    hits.push(
      ...matchesOf(text, RETIRED_LITERAL, literalToken),
      ...matchesOf(text, RETIRED_KEY, literalToken),
    );
  }
  return hits;
}

function retiredVocabulary(files) {
  return files.flatMap(({ path, text, kind }) =>
    hitsFor(text, kind)
      .sort((left, right) => left.index - right.index)
      .map(({ index, token }) => ({
        file: path,
        line: text.slice(0, index).split("\n").length,
        token,
      })),
  );
}

function listFiles(directory, keep) {
  const entries = readdirSync(resolve(PACKAGE_ROOT, directory), {
    withFileTypes: true,
  });
  return entries.flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        return [];
      }
      return listFiles(path, keep);
    }
    if (entry.isFile() && keep(entry.name)) {
      return [path];
    }
    return [];
  });
}

function collectFiles() {
  const owners = new Set(SEVERITY_OWNERS);
  const sourcePaths = [
    ...SOURCE_ROOTS.flatMap((root) =>
      listFiles(root, (name) => SOURCE_FILE.test(name)),
    ),
    "hooks/hooks.json",
  ].filter((path) => !owners.has(path));
  const documentPaths = [
    "README.md",
    ...listFiles("skills/quality-refactor", (name) => name.endsWith(".md")),
  ];
  const entries = [
    ...sourcePaths.map((path) => ({ path, kind: "source" })),
    ...SEVERITY_OWNERS.map((path) => ({ path, kind: "severity-owner" })),
    ...documentPaths.map((path) => ({ path, kind: "document" })),
    { path: "dist/bundle.js", kind: "bundle" },
  ];
  return entries.map(({ path, kind }) => ({
    path,
    kind,
    text: readFileSync(resolve(PACKAGE_ROOT, path), "utf8"),
  }));
}

function describeFindings(findings) {
  if (findings.length === 0) {
    return "no findings";
  }
  return findings
    .map(({ file, line, token }) => `${file}:${line} ${token}`)
    .join("\n");
}

const realFiles = collectFiles();
const ofKind = (kind) => realFiles.filter((file) => file.kind === kind);

test("real file set has no retired vocabulary", () => {
  const findings = retiredVocabulary(realFiles);
  assert.deepEqual(
    findings,
    [],
    `retired vocabulary returned:\n${describeFindings(findings)}`,
  );
});

test("real scan collects every file kind", () => {
  const sources = ofKind("source").length;
  assert.ok(sources >= MIN_SOURCE_FILES, `only ${sources} source files`);
  assert.ok(ofKind("document").length > 0, "no document files collected");
  const owners = ofKind("severity-owner").map(({ path }) => path);
  assert.deepEqual(owners.sort(), [...SEVERITY_OWNERS].sort());
  assert.deepEqual(
    ofKind("bundle").map(({ path }) => path),
    ["dist/bundle.js"],
  );
});

test("collected paths are package-relative", () => {
  const offenders = realFiles
    .map(({ path }) => path)
    .filter(
      (path) =>
        path.includes("\\") ||
        path.split("/").some((segment) => SKIPPED_DIRECTORIES.has(segment)),
    );
  assert.deepEqual(offenders, []);
});

test("severity set to error in source is flagged", () => {
  const findings = retiredVocabulary([
    {
      path: "src/fake.ts",
      text: 'const severity = "error";\n',
      kind: "source",
    },
  ]);
  assert.deepEqual(findings, [
    { file: "src/fake.ts", line: 1, token: 'severity "error"' },
  ]);
});

test("severity forms that hide a retired level are flagged and neighbours are not", () => {
  const flagged = [
    { probe: "severity = `error`", level: "error" },
    { probe: 'severity: x ? "error" : "high"', level: "error" },
    { probe: 'severity: (x ? "warn" : "high")', level: "warn" },
    { probe: 'severity ?? "warn"', level: "warn" },
    { probe: 'severity || "warning"', level: "warning" },
  ];
  const neighbours = [
    'severity: "high", level: "error"',
    'if (x.severity === "high") throw new Error("error")',
  ];
  for (const { probe, level } of flagged) {
    const findings = retiredVocabulary([
      { path: "src/fake.ts", text: `${probe}\n`, kind: "source" },
    ]);
    assert.deepEqual(
      findings,
      [{ file: "src/fake.ts", line: 1, token: `severity "${level}"` }],
      `expected exactly one severity "${level}" finding for: ${probe}`,
    );
  }
  for (const probe of neighbours) {
    const findings = retiredVocabulary([
      { path: "src/fake.ts", text: `${probe}\n`, kind: "source" },
    ]);
    assert.deepEqual(findings, [], `expected no findings for: ${probe}`);
  }
});

test("option tokens in a document are flagged with their line", () => {
  const profile = "# Usage\nquality-guard report --profile strict\n";
  const failOn = "# Usage\nquality-guard report --fail-on high\n";
  assert.deepEqual(
    retiredVocabulary([{ path: "README.md", text: profile, kind: "document" }]),
    [{ file: "README.md", line: 2, token: "--profile" }],
  );
  assert.deepEqual(
    retiredVocabulary([{ path: "README.md", text: failOn, kind: "document" }]),
    [{ file: "README.md", line: 2, token: "--fail-on" }],
  );
});

test("retired level in a severity owner's quoted value is flagged", () => {
  const findings = retiredVocabulary([
    {
      path: "fake-owner.mjs",
      text: '"else-branch": "warn",\n',
      kind: "severity-owner",
    },
  ]);
  assert.ok(
    findings.some(({ token }) => token.includes("warn")),
    `expected a warn finding; got ${describeFindings(findings)}`,
  );
});

test("retired level keys in a threshold band are flagged", () => {
  const findings = retiredVocabulary([
    {
      path: "fake-owner.mjs",
      text: "const band = { warn: 100, error: 300 };\n",
      kind: "severity-owner",
    },
  ]);
  const tokens = findings.map(({ token }) => token);
  const got = describeFindings(findings);
  assert.ok(
    tokens.some((token) => token.includes("warn")),
    `expected a warn key finding; got ${got}`,
  );
  assert.ok(
    tokens.some((token) => token.includes("error")),
    `expected an error key finding; got ${got}`,
  );
});

test("bundle text is not checked for severity levels", () => {
  const findings = retiredVocabulary([
    {
      path: "dist/bundle.js",
      text: 'level:"warn"\nseverity:"error"\n',
      kind: "bundle",
    },
  ]);
  assert.deepEqual(findings, []);
});

test("bundle text is still checked for option tokens", () => {
  const findings = retiredVocabulary([
    {
      path: "dist/bundle.js",
      text: 'const flag = "--fail-on";\n',
      kind: "bundle",
    },
  ]);
  assert.deepEqual(findings, [
    { file: "dist/bundle.js", line: 1, token: "--fail-on" },
  ]);
});

// These sources read third-party linter levels or Node "error" events and are expected to
// stay free of matches; nothing exempts them, so a severity-shaped match added to one of
// them fails this test and the real-file test.
test("external linter and event sources stay free of matches", () => {
  const externalLinterSources = [
    "scripts/csharp-linter.mjs",
    "scripts/rust-linter.mjs",
    "scripts/project-linter-support.mjs",
    "src/http.ts",
  ];
  const findings = retiredVocabulary(
    externalLinterSources.map((path) => ({
      path,
      text: readFileSync(resolve(PACKAGE_ROOT, path), "utf8"),
      kind: "source",
    })),
  );
  assert.deepEqual(
    findings,
    [],
    `unexpected vocabulary hit:\n${describeFindings(findings)}`,
  );
});
