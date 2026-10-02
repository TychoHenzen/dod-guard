// biome-ignore lint/correctness/noNodejsModules: This CLI helper runs under Node.js.
import { execFileSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This CLI helper runs under Node.js.
import { createHash } from "node:crypto";
// biome-ignore lint/correctness/noNodejsModules: This CLI helper runs under Node.js.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function hasControlCharacter(value) {
  return Array.from(value).some((character) => character < " " || character === "\u007f");
}

function hasUnsafeSegment(value) {
  return value.split("/").some((segment) => !segment || segment === "." || segment === "..");
}

function isRepositoryRelativePath(value) {
  if (typeof value !== "string" || !value) {
    return false;
  }
  const isAbsoluteOrBackslashed = value.startsWith("/") || WINDOWS_DRIVE_PATH.test(value) || value.includes("\\");
  return !(isAbsoluteOrBackslashed || hasControlCharacter(value) || hasUnsafeSegment(value));
}

function fileRequest(entry) {
  if (typeof entry === "string") {
    return { repositoryPath: entry, contentBase64: undefined };
  }
  return { repositoryPath: entry?.path, contentBase64: entry?.contentBase64 };
}

function normalizedFiles(files) {
  if (!Array.isArray(files)) {
    throw new TypeError("Review evidence files must be an array.");
  }

  const paths = new Set();
  return files.map((entry) => {
    const { repositoryPath, contentBase64 } = fileRequest(entry);
    if (!isRepositoryRelativePath(repositoryPath)) {
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

function requireRequestShape(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("Review evidence snapshot input must be an object.");
  }
  if (typeof request.headSha !== "string" || !FULL_COMMIT_SHA.test(request.headSha)) {
    throw new Error("Review evidence snapshot requires a full commit SHA.");
  }
}

function validatedRequest(request) {
  requireRequestShape(request);
  const files = normalizedFiles(request.files);
  let repositoryRoot;
  if (typeof request.repositoryRoot === "string") {
    repositoryRoot = resolve(request.repositoryRoot);
  }
  if (files.some((file) => file.contentBase64 === undefined) && !repositoryRoot) {
    throw new Error("Review evidence snapshot requires repositoryRoot for Git-backed files.");
  }
  return { headSha: request.headSha, files, repositoryRoot, temporaryRoot: resolve(request.temporaryRoot ?? tmpdir()) };
}

function writeSnapshot(directory, { headSha, files, repositoryRoot }) {
  if (repositoryRoot && isWithinDirectory(repositoryRoot, directory)) {
    throw new Error("Review evidence snapshots must be outside the repository.");
  }

  const filesDirectory = join(directory, "files");
  mkdirSync(filesDirectory);
  const manifestFiles = files.map((file, index) => {
    const { content, source } = sourceBytes(file, headSha, repositoryRoot);
    const extension = file.repositoryPath.match(SNAPSHOT_EXTENSION)?.[0] ?? "";
    const snapshotPath = join(filesDirectory, `${index + 1}${extension}`);
    writeFileSync(snapshotPath, content);
    return {
      path: file.repositoryPath,
      snapshotPath,
      source,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  });

  const manifestPath = join(directory, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify({ headSha, files: manifestFiles }, null, 2)}\n`, "utf8");
  return { directory, manifestPath, headSha, files: manifestFiles };
}

function createReviewEvidenceSnapshot(request) {
  const validated = validatedRequest(request);
  const directory = mkdtempSync(join(validated.temporaryRoot, "dod-guard-review-evidence-"));
  try {
    return writeSnapshot(directory, validated);
  } catch (error) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
}

// Text evidence, or an explicit omission for bytes that cannot be shown as text.
// Decoding them anyway would hand the reviewer replacement characters as if
// they were the file.
function embeddableEvidence(content, sha256) {
  if (content.includes(0)) {
    return { omitted: `binary or non-UTF-8, sha256 ${sha256}, ${content.length} bytes` };
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content);
  } catch {
    return { omitted: `binary or non-UTF-8, sha256 ${sha256}, ${content.length} bytes` };
  }
}

// Reviewers receive these contents inside their prompts, so a snapshot that
// changed after capture must stop dispatch instead of reaching them altered.
function readReviewEvidenceSnapshot(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return new Map(
    manifest.files.map(({ path, snapshotPath, sha256 }) => {
      const content = readFileSync(snapshotPath);
      const actual = createHash("sha256").update(content).digest("hex");
      if (actual !== sha256) {
        throw new Error(`Review evidence for ${JSON.stringify(path)} does not match its manifest: expected sha256 ${sha256}, found ${actual}.`);
      }
      return [path, embeddableEvidence(content, sha256)];
    }),
  );
}

export { createReviewEvidenceSnapshot, readReviewEvidenceSnapshot };
