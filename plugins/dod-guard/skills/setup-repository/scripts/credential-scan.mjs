import { open } from "node:fs/promises";
import path from "node:path";
import { relative } from "./repository-files.mjs";

const SAFE_SECRET_EXAMPLES = /(?:^|[._-])(?:example|sample|template)(?:[._-]|$)/i;
const SUSPICIOUS_SECRET_FILE =
  /(?:^|\/)(?:(?:\.env|credentials|secrets?)(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519)|.+\.(?:key|pem|p12|pfx))$/i;
const TEXT_LIMIT_BYTES = 1024 * 1024;

const SECRET_PATTERNS = [
  ["private-key", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ["github-token", /\b(?:gh[opsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
];

function isSecretLikeFilename(fileRelative) {
  return SUSPICIOUS_SECRET_FILE.test(fileRelative) && !SAFE_SECRET_EXAMPLES.test(path.basename(fileRelative));
}

// Oversized and binary files are skipped so a log or blob never gets line-scanned.
async function readTextContent(fileHandle) {
  const { size } = await fileHandle.stat();
  if (size > TEXT_LIMIT_BYTES) return null;
  let content;
  try {
    content = await fileHandle.readFile("utf8");
  } catch {
    return null;
  }
  return content.includes("\0") ? null : content;
}

function contentFindings(content, fileRelative) {
  return content.split(/\r?\n/).flatMap((text, index) =>
    SECRET_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([signal]) => ({
      file: fileRelative,
      line: index + 1,
      signal,
    })),
  );
}

async function scanOpenFile(fileHandle, fileRelative) {
  const findings = [];
  if (isSecretLikeFilename(fileRelative)) {
    findings.push({ file: fileRelative, line: null, signal: "secret-like-filename" });
  }
  const content = await readTextContent(fileHandle);
  if (content !== null) findings.push(...contentFindings(content, fileRelative));
  return findings;
}

async function credentialFindingsForFile(root, file) {
  const fileHandle = await open(file, "r");
  try {
    return await scanOpenFile(fileHandle, relative(root, file));
  } finally {
    await fileHandle.close();
  }
}

function lineOf(finding) {
  return finding.line ?? 0;
}

function compareFindings(a, b) {
  return a.file.localeCompare(b.file) || lineOf(a) - lineOf(b);
}

export async function credentialFindings(root, files) {
  const findings = (await Promise.all(files.map((file) => credentialFindingsForFile(root, file)))).flat();
  return findings.sort(compareFindings);
}
