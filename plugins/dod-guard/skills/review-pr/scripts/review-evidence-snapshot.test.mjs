// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { execFileSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { createHash } from "node:crypto";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { dirname, join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { createReviewEvidenceSnapshot } from "./lib/review-evidence-snapshot.mjs";
import { runAdvisor } from "../../codex-advisor/scripts/run-advisor.mjs";

const reviewSkill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const WINDOWS_ONLY_SKIP = process.platform !== "win32" && "PowerShell integration fixture requires Windows.";

async function createReviewFixture() {
  const root = await mkdtemp(join(tmpdir(), "review evidence ü & fixture-"));
  const repositoryRoot = join(root, "repo with spaces");
  const temporaryRoot = join(root, "snapshots with spaces & ü");
  const repositoryPath = "docs with spaces/quality & policy ü.md";
  const sourcePath = join(repositoryRoot, ...repositoryPath.split("/"));
  await mkdir(dirname(sourcePath), { recursive: true });
  await mkdir(temporaryRoot);
  await writeFile(sourcePath, "Tests find gaps; coverage has no universal target.\n", "utf8");
  execFileSync("git", ["init"], { cwd: repositoryRoot, stdio: "ignore" });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: repositoryRoot });
  execFileSync("git", ["config", "user.name", "Review Fixture"], { cwd: repositoryRoot });
  execFileSync("git", ["config", "user.email", "review-fixture@example.test"], { cwd: repositoryRoot });
  execFileSync("git", ["add", "--", repositoryPath], { cwd: repositoryRoot });
  execFileSync("git", ["commit", "-m", "add evidence fixture"], { cwd: repositoryRoot, stdio: "ignore" });
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  const inputPath = join(root, "snapshot input & ü.json");
  const scriptPath = fileURLToPath(new URL("./review-support.mjs", import.meta.url));
  return { headSha, inputPath, repositoryPath, repositoryRoot, root, scriptPath, temporaryRoot };
}

async function createCodexFixture() {
  const root = await mkdtemp(join(tmpdir(), "review-codex-integration-"));
  const runs = join(root, "runs");
  const executable = join(root, "fake-codex.mjs");
  const record = join(root, "review-record.json");
  await mkdir(runs);
  const source = [
    'import { readFile, writeFile } from "node:fs/promises";',
    "const args = process.argv.slice(2);",
    "if (args[0] === \"--version\") { process.stdout.write(\"codex-cli fixture\"); process.exit(0); }",
    "if (args[0] === \"exec\" && args[1] === \"--help\") { process.stdout.write(\"codex exec fixture\"); process.exit(0); }",
    "let prompt = \"\";",
    "for await (const chunk of process.stdin) prompt += chunk;",
    "const input = JSON.parse(prompt);",
    'const manifest = JSON.parse(await readFile(input.finalFileAccess, "utf8"));',
    "const file = manifest.files.find((entry) => entry.path === input.sourcePath);",
    "const content = await readFile(file.snapshotPath);",
    // biome-ignore lint/security/noSecrets: This fixture records snapshot bytes for assertions.
    "await writeFile(process.env.reviewRecord, JSON.stringify({ args, headSha: manifest.headSha, sourcePath: file.path, sourceBase64: content.toString(\"base64\"), input }));",
    "const outputPath = args[args.indexOf(\"--output-last-message\") + 1];",
    'await writeFile(outputPath, JSON.stringify({ advice: "The nested review consumed pinned evidence." }));',
  ].join("\n");
  await writeFile(executable, source, "utf8");
  return { executable, record, root, runs };
}

async function runPowerShellSnapshot(fixture) {
  const resultPath = join(fixture.root, "snapshot output & ü.json");
  const powershellPath = join(fixture.root, "snapshot command & ü.ps1");
  const powershellSource = [
    // biome-ignore lint/security/noSecrets: This fixture preserves the documented PowerShell invocation.
    "param([string]$scriptPath, [string]$inputPath, [string]$resultPath)",
    "$output = & node $scriptPath snapshot-files --input $inputPath",
    "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
    "[System.IO.File]::WriteAllText($resultPath, $output, [System.Text.UTF8Encoding]::new($false))",
  ].join("\n");
  await writeFile(powershellPath, powershellSource, "utf8");
  execFileSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", powershellPath, fixture.scriptPath, fixture.inputPath, resultPath],
    { cwd: fixture.repositoryRoot, stdio: "ignore" },
  );
  return JSON.parse(await readFile(resultPath, "utf8"));
}

async function runReadOnlySnapshotReview(fixture, snapshot) {
  const codex = await createCodexFixture();
  try {
    const reviewContext = JSON.stringify({ finalFileAccess: snapshot.manifestPath, sourcePath: fixture.repositoryPath });
    const review = await runAdvisor({
      executable: process.execPath,
      prefixArgs: [codex.executable],
      prompt: reviewContext,
      tempRoot: codex.runs,
      env: { reviewRecord: codex.record },
    });
    const record = JSON.parse(await readFile(codex.record, "utf8"));
    const source = execFileSync("git", ["show", `${fixture.headSha}:${fixture.repositoryPath}`], {
      cwd: fixture.repositoryRoot,
    });
    return { record, review, reviewContext, source };
  } finally {
    await rm(codex.root, { recursive: true, force: true });
  }
}

test("review skill hands nested reviewers pinned snapshots and explicit document failures", () => {
  assert.ok(reviewSkill.includes("snapshot-files --input"));
  assert.ok(reviewSkill.includes("PowerShell variables"));
  assert.ok(reviewSkill.includes("Do not assume `pdftotext`"));
  assert.ok(reviewSkill.includes("preserve the exact\nfailure and report the missing evidence"));
  assert.ok(reviewSkill.includes("Never ask nested reviewers to resolve a mutable branch"));
});

test("snapshots exact-head files through the CLI without shell parsing", async () => {
  const fixture = await createReviewFixture();
  try {
    const providerPath = "fork docs/fork & policy ü.md";
    const providerContent = Buffer.from("Provider bytes are already pinned to the remote SHA.\n", "utf8");
    await writeFile(
      fixture.inputPath,
      JSON.stringify({
        headSha: fixture.headSha,
        repositoryRoot: fixture.repositoryRoot,
        temporaryRoot: fixture.temporaryRoot,
        files: [fixture.repositoryPath, { path: providerPath, contentBase64: providerContent.toString("base64") }],
      }),
      "utf8",
    );
    const output = execFileSync(
      process.execPath,
      [fixture.scriptPath, "snapshot-files", "--input", fixture.inputPath],
      { cwd: fixture.repositoryRoot, encoding: "utf8" },
    );
    const snapshot = JSON.parse(output);
    const [file, providerFile] = snapshot.files;
    const original = execFileSync("git", ["show", `${fixture.headSha}:${fixture.repositoryPath}`], {
      cwd: fixture.repositoryRoot,
    });
    assert.equal(snapshot.headSha, fixture.headSha);
    assert.equal(file.path, fixture.repositoryPath);
    assert.equal(file.source, "git-show");
    assert.ok(file.snapshotPath.includes("snapshots with spaces & ü"));
    assert.deepEqual(await readFile(file.snapshotPath), original);
    assert.equal(file.sha256, createHash("sha256").update(original).digest("hex"));
    assert.equal(JSON.parse(await readFile(snapshot.manifestPath, "utf8")).files[0].sha256, file.sha256);
    assert.equal(providerFile.path, providerPath);
    assert.equal(providerFile.source, "provider-content");
    assert.deepEqual(await readFile(providerFile.snapshotPath), providerContent);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test(
  "Windows PowerShell nested review passes pinned evidence through the read-only Codex result boundary",
  { skip: WINDOWS_ONLY_SKIP },
  async () => {
    const fixture = await createReviewFixture();
    try {
      await writeFile(
        fixture.inputPath,
        JSON.stringify({
          headSha: fixture.headSha,
          repositoryRoot: fixture.repositoryRoot,
          temporaryRoot: fixture.temporaryRoot,
          files: [fixture.repositoryPath],
        }),
        "utf8",
      );
      const snapshot = await runPowerShellSnapshot(fixture);
      const { record, review, reviewContext, source } = await runReadOnlySnapshotReview(fixture, snapshot);
      assert.equal(snapshot.headSha, fixture.headSha);
      assert.equal(snapshot.files[0].snapshotPath.endsWith(".md"), true);
      assert.equal(review.ok, true);
      assert.equal(review.advice, "The nested review consumed pinned evidence.");
      assert.equal(review.execution.status, "completed");
      assert.equal(review.execution.stage, "reviewer-process");
      assert.equal(review.execution.exitCode, 0);
      assert.ok(review.execution.command.includes("read-only"));
      assert.equal(review.execution.command.includes("--approve-for-me"), false);
      assert.equal(record.headSha, fixture.headSha);
      assert.equal(record.sourcePath, fixture.repositoryPath);
      assert.deepEqual(Buffer.from(record.sourceBase64, "base64"), source);
      assert.deepEqual(record.input, JSON.parse(reviewContext));
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  },
);

test("rejects snapshot path traversal before creating temporary output", async () => {
  const fixture = await createReviewFixture();
  try {
    assert.throws(
      () => createReviewEvidenceSnapshot({
        headSha: fixture.headSha,
        repositoryRoot: fixture.repositoryRoot,
        temporaryRoot: fixture.temporaryRoot,
        files: ["../outside.md"],
      }),
      (error) => error.message.includes("Invalid repository path"),
    );
    assert.deepEqual(await readdir(fixture.temporaryRoot), []);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("snapshot failures retain exact Git arguments and remove partial output", async () => {
  const fixture = await createReviewFixture();
  try {
    await writeFile(
      fixture.inputPath,
      JSON.stringify({
        headSha: fixture.headSha,
        repositoryRoot: fixture.repositoryRoot,
        temporaryRoot: fixture.temporaryRoot,
        files: ["missing source & ü.md"],
      }),
      "utf8",
    );
    assert.throws(
      () => createReviewEvidenceSnapshot({
        headSha: fixture.headSha,
        repositoryRoot: fixture.repositoryRoot,
        temporaryRoot: fixture.temporaryRoot,
        files: ["missing source & ü.md"],
      }),
      (error) => {
        assert.ok(error.message.includes("Review evidence read failed"));
        const evidence = JSON.parse(error.message.slice("Review evidence read failed: ".length));
        assert.deepEqual(evidence.command, ["git", "show", `${fixture.headSha}:missing source & ü.md`]);
        assert.notEqual(evidence.exitCode, 0);
        assert.ok(evidence.stderr.toLowerCase().includes("fatal"));
        return true;
      },
    );
    assert.deepEqual(await readdir(fixture.temporaryRoot), []);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
