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
import { dispatchReviewers } from "./review-dispatch.mjs";

const reviewSkill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const REVIEW_SCHEMA_PATH = fileURLToPath(new URL("../response-schema.json", import.meta.url));
// Markdown with its own fences and a non-ASCII byte sequence, the evidence shape
// that broke out of fixed ``` prompt blocks.
const FIXTURE_SOURCE = "# Policy ü\n\n```bash\nnpm test\n```\n\nTests find gaps; coverage has no universal target.\n";

async function createReviewFixture() {
  const root = await mkdtemp(join(tmpdir(), "review evidence ü & fixture-"));
  const repositoryRoot = join(root, "repo with spaces");
  const temporaryRoot = join(root, "snapshots with spaces & ü");
  const repositoryPath = "docs with spaces/quality & policy ü.md";
  const sourcePath = join(repositoryRoot, ...repositoryPath.split("/"));
  await mkdir(dirname(sourcePath), { recursive: true });
  await mkdir(temporaryRoot);
  await writeFile(sourcePath, FIXTURE_SOURCE, "utf8");
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

function runSupport(fixture, args) {
  return JSON.parse(
    execFileSync(process.execPath, [fixture.scriptPath, ...args], { cwd: fixture.repositoryRoot, encoding: "utf8" }),
  );
}

// Snapshots the fixture head and builds the reviewer prompts exactly as the
// skill does: direct Node processes, no shell, Git's default diff path quoting.
async function prepareDispatch(fixture) {
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
  const snapshot = runSupport(fixture, ["snapshot-files", "--input", fixture.inputPath]);
  const diffFile = join(fixture.root, "review diff & ü.patch");
  await writeFile(
    diffFile,
    execFileSync("git", ["show", "--format=", "--unified=0", fixture.headSha], { cwd: fixture.repositoryRoot }),
  );
  const contextPath = join(fixture.root, "context & ü.json");
  const unitsPath = join(fixture.root, "units & ü.json");
  await writeFile(
    contextPath,
    JSON.stringify({
      repository: "owner/repo",
      headSha: fixture.headSha,
      changedFiles: [fixture.repositoryPath],
      reviewRequirements: ["Pinned evidence reaches the reviewer"],
      workItem: {},
      diffFile,
      finalFileAccess: snapshot.manifestPath,
    }),
    "utf8",
  );
  await writeFile(
    unitsPath,
    JSON.stringify([{ id: "docs", files: [fixture.repositoryPath], angles: ["review-pr-hygiene"] }]),
    "utf8",
  );
  return { contextPath, snapshot, unitsPath };
}

// Stands in for codex.exe: records the prompt bytes it receives on stdin and
// opens no evidence file, so the review can only see what the prompt carries.
async function createPromptRecordingCodex() {
  const root = await mkdtemp(join(tmpdir(), "review-dispatch-evidence-"));
  const executable = join(root, "fake-codex.mjs");
  const record = join(root, "prompts.json");
  const source = [
    'import { readFile, writeFile } from "node:fs/promises";',
    "const args = process.argv.slice(2);",
    'if (args[0] === "--version") { process.stdout.write("codex fixture"); process.exit(0); }',
    'if (args[0] === "exec" && args[1] === "--help") { process.stdout.write("codex exec fixture"); process.exit(0); }',
    "const chunks = [];",
    "for await (const chunk of process.stdin) chunks.push(chunk);",
    'const prompt = Buffer.concat(chunks).toString("utf8");',
    'const reviewer = prompt.match(/^name: (review-pr-[a-z]+)$/mu)[1];',
    'const records = JSON.parse(await readFile(process.env.REVIEW_RECORD, "utf8").catch(() => "[]"));',
    "records.push({ args, prompt, reviewer });",
    "await writeFile(process.env.REVIEW_RECORD, JSON.stringify(records));",
    'const outputPath = args[args.indexOf("--output-last-message") + 1];',
    'await writeFile(outputPath, JSON.stringify({ reviewer, coverage: [], findings: [] }));',
  ].join("\n");
  await writeFile(executable, source, "utf8");
  return { executable, record, root };
}

test("review skill hands nested reviewers pinned snapshots and explicit document failures", () => {
  assert.ok(reviewSkill.includes("snapshot-files --input"));
  assert.ok(reviewSkill.includes("shell:false"));
  assert.ok(reviewSkill.includes("Never replace it with an active-client\nfan-out"));
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

test("Windows nested reviewers receive the exact pinned bytes in their prompt, not a path to read", async () => {
  const fixture = await createReviewFixture();
  const codex = await createPromptRecordingCodex();
  try {
    const { contextPath, snapshot, unitsPath } = await prepareDispatch(fixture);
    const input = runSupport(fixture, ["build-dispatch-input", "--context", contextPath, "--units", unitsPath]);
    // The reviewer must not depend on host file access, so the evidence is gone before it starts.
    await rm(snapshot.directory, { recursive: true, force: true });

    const result = await dispatchReviewers({
      reviewers: input.reviewers,
      executable: process.execPath,
      prefixArgs: [codex.executable],
      schemaPath: REVIEW_SCHEMA_PATH,
      tempRoot: codex.root,
      env: { REVIEW_RECORD: codex.record },
      platform: "win32",
    });

    const source = execFileSync("git", ["show", `${fixture.headSha}:${fixture.repositoryPath}`], {
      cwd: fixture.repositoryRoot,
    });
    assert.equal(source.toString("utf8"), FIXTURE_SOURCE);
    assert.equal(createHash("sha256").update(source).digest("hex"), snapshot.files[0].sha256);
    assert.equal(result.terminal, true);
    assert.deepEqual(result.reviews.map(({ reviewer, unit }) => [reviewer, unit]), [
      ["review-pr-feature", "pull-request"],
      ["review-pr-hygiene", "docs"],
    ]);
    const records = JSON.parse(await readFile(codex.record, "utf8"));
    for (const [index, { args, prompt }] of records.entries()) {
      assert.ok(prompt.includes(`### ${fixture.repositoryPath}\n\n\`\`\`\`\n${FIXTURE_SOURCE}\`\`\`\`\n`));
      assert.ok(prompt.includes("+Tests find gaps; coverage has no universal target."));
      assert.equal(prompt.includes(snapshot.directory), false);
      assert.equal(prompt.includes(fixture.temporaryRoot), false);
      assert.ok(args.includes("read-only"));
      assert.equal(args.includes("--approve-for-me"), false);
      assert.equal(result.reviews[index].execution.shell, false);
      assert.equal(result.reviews[index].execution.status, "completed");
    }
  } finally {
    await rm(codex.root, { recursive: true, force: true });
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("dispatch stops when a snapshot no longer matches its manifest hash", async () => {
  const fixture = await createReviewFixture();
  try {
    const { contextPath, snapshot, unitsPath } = await prepareDispatch(fixture);
    await writeFile(snapshot.files[0].snapshotPath, "altered evidence\n", "utf8");

    assert.throws(
      () =>
        execFileSync(process.execPath, [fixture.scriptPath, "build-dispatch-input", "--context", contextPath, "--units", unitsPath], {
          cwd: fixture.repositoryRoot,
          stdio: ["ignore", "pipe", "pipe"],
        }),
      (error) => error.stderr.toString("utf8").includes(`expected sha256 ${snapshot.files[0].sha256}`),
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

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
