// biome-ignore lint/correctness/noNodejsModules: This CLI helper runs under Node.js.
import { execFileSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This CLI helper runs under Node.js.
import { createHash } from "node:crypto";
// biome-ignore lint/correctness/noNodejsModules: This CLI helper runs under Node.js.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This CLI helper runs under Node.js.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This CLI helper runs under Node.js.
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const FULL_COMMIT_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu;
const WINDOWS_DRIVE_PATH = /^[a-z]:/iu;
const SNAPSHOT_EXTENSION = /\.[a-z0-9]+$/iu;
// biome-ignore lint/style/noMagicNumbers: Keep buffered Git reads bounded to 64 MiB per file.
const MAX_FILE_BYTES = 64 * 1024 * 1024;

function isWithinDirectory(directory, candidate) {
  const relativePath = relative(directory, candidate);
  return relativePath === "" || (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`));
}

function normalizedFiles(files) {
  if (!Array.isArray(files)) {
    throw new TypeError("Review evidence files must be an array.");
  }

  const paths = new Set();
  return files.map((entry) => {
    let repositoryPath;
    let contentBase64;
    if (typeof entry === "string") {
      repositoryPath = entry;
    } else {
      repositoryPath = entry?.path;
      contentBase64 = entry?.contentBase64;
    }
    if (
      typeof repositoryPath !== "string" ||
      !repositoryPath ||
      repositoryPath.startsWith("/") ||
      WINDOWS_DRIVE_PATH.test(repositoryPath) ||
      repositoryPath.includes("\\") ||
      Array.from(repositoryPath).some((character) => character < " " || character === "\u007f") ||
      repositoryPath.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new Error(`Invalid repository path for review evidence: ${JSON.stringify(repositoryPath)}`);
    }
    if (paths.has(repositoryPath)) {
      throw new Error(`Duplicate repository path in review evidence: ${JSON.stringify(repositoryPath)}`);
    }
    paths.add(repositoryPath);

    if (contentBase64 !== undefined && typeof contentBase64 !== "string") {
      throw new TypeError(`Review evidence for ${JSON.stringify(repositoryPath)} has invalid base64 content.`);
    }
    return { repositoryPath, contentBase64 };
  });
}

function sourceBytes({ contentBase64, repositoryPath }, headSha, repositoryRoot) {
  if (contentBase64 !== undefined) {
    const normalizedBase64 = contentBase64.replace(/\s/gu, "");
    const content = Buffer.from(normalizedBase64, "base64");
    if (content.toString("base64") !== normalizedBase64) {
      throw new Error(`Invalid base64 review evidence for ${JSON.stringify(repositoryPath)}.`);
    }
    return { content, source: "provider-content" };
  }

  const args = ["show", `${headSha}:${repositoryPath}`];
  try {
    return {
      content: execFileSync("git", args, { cwd: repositoryRoot, maxBuffer: MAX_FILE_BYTES, stdio: ["ignore", "pipe", "pipe"] }),
      source: "git-show",
    };
  } catch (error) {
    const stderr = error.stderr?.toString("utf8").trim() ?? "";
    throw new Error(
      `Review evidence read failed: ${JSON.stringify({ command: ["git", ...args], exitCode: error.status ?? null, stderr, message: error.message })}`,
      { cause: error },
    );
  }
}

function createReviewEvidenceSnapshot(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("Review evidence snapshot input must be an object.");
  }
  if (typeof request.headSha !== "string" || !FULL_COMMIT_SHA.test(request.headSha)) {
    throw new Error("Review evidence snapshot requires a full commit SHA.");
  }

  const files = normalizedFiles(request.files);
  let repositoryRoot;
  if (typeof request.repositoryRoot === "string") {
    repositoryRoot = resolve(request.repositoryRoot);
  }
  if (files.some((file) => file.contentBase64 === undefined) && !repositoryRoot) {
    throw new Error("Review evidence snapshot requires repositoryRoot for Git-backed files.");
  }

  const temporaryRoot = resolve(request.temporaryRoot ?? tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, "dod-guard-review-evidence-"));
  try {
    if (repositoryRoot && isWithinDirectory(repositoryRoot, directory)) {
      throw new Error("Review evidence snapshots must be outside the repository.");
    }

    const filesDirectory = join(directory, "files");
    mkdirSync(filesDirectory);
    const manifestFiles = [];
    for (const [index, file] of files.entries()) {
      const { content, source } = sourceBytes(file, request.headSha, repositoryRoot);
      const extension = file.repositoryPath.match(SNAPSHOT_EXTENSION)?.[0] ?? "";
      const snapshotPath = join(filesDirectory, `${index + 1}${extension}`);
      writeFileSync(snapshotPath, content);
      manifestFiles.push({
        path: file.repositoryPath,
        snapshotPath,
        source,
        sha256: createHash("sha256").update(content).digest("hex"),
      });
    }

    const manifestPath = join(directory, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify({ headSha: request.headSha, files: manifestFiles }, null, 2)}\n`, "utf8");
    return { directory, manifestPath, headSha: request.headSha, files: manifestFiles };
  } catch (error) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
}

export { createReviewEvidenceSnapshot };
