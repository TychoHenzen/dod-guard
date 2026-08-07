#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const _filename = fileURLToPath(import.meta.url);

const LANGUAGE_NAMES = {
  ts: "TypeScript",
  js: "JavaScript",
  py: "Python",
  rs: "Rust",
  go: "Go",
};

const USAGE =
  "Usage: mine-github.mjs --language=<ts|js|py|rs|go> [--min-stars=<n>] [--max-file-size=<bytes>] [--count=<n>] [--out=<dir>]\n";

/**
 * Build the GitHub code search API URL for one page of results.
 */
function buildSearchUrl({ language, minStars, maxFileSize, page = 1, perPage = 30 }) {
  const langName = LANGUAGE_NAMES[language] ?? language;
  const query = `language:${langName} stars:>=${minStars} size:<=${maxFileSize}`;
  const url = new URL("https://api.github.com/search/code");
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  return url.toString();
}

/**
 * Build request headers, adding bearer auth when a token is supplied.
 */
function buildHeaders(token) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Raise a descriptive error for a non-OK GitHub API response.
 */
async function raiseForStatus(res, context) {
  const body = await res.text().catch(() => "");
  if (res.status === 403) {
    throw new Error(`GitHub API rate limit exceeded (403) during ${context}: ${body}`);
  }
  throw new Error(`GitHub API request failed (${res.status}) during ${context}: ${body}`);
}

/**
 * Search GitHub code search API for files matching language/stars/size
 * filters, paginating until `count` items are collected.
 */
async function searchGitHub({
  language,
  minStars,
  maxFileSize,
  count,
  token,
  fetchImpl = fetch,
  perPage = Math.min(count, 100),
}) {
  const items = [];
  let page = 1;

  while (items.length < count) {
    const url = buildSearchUrl({ language, minStars, maxFileSize, page, perPage });
    const res = await fetchImpl(url, { headers: buildHeaders(token) });
    if (!res.ok) {
      await raiseForStatus(res, "code search");
    }
    const data = await res.json();
    const pageItems = data.items ?? [];
    items.push(...pageItems);
    if (pageItems.length < perPage) break;
    page += 1;
  }

  return items.slice(0, count);
}

/**
 * Download one file's content via the GitHub Contents API and decode it.
 */
async function downloadFile(item, { token, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(item.url, { headers: buildHeaders(token) });
  if (!res.ok) {
    await raiseForStatus(res, `download of ${item.path ?? item.url}`);
  }
  const data = await res.json();
  const content = Buffer.from(data.content ?? "", data.encoding ?? "base64").toString("utf-8");
  return { content, sha: data.sha };
}

/**
 * Save one file's content and a metadata sidecar into the corpus directory,
 * skipping files whose content hash has already been saved.
 */
function saveToCorpus({ item, content, outDir, seenHashes, language }) {
  const hash = createHash("sha256").update(content).digest("hex");
  if (seenHashes.has(hash)) {
    return { skipped: true, hash };
  }

  const repoFullName = item.repository?.full_name ?? "unknown/unknown";
  const destPath = join(outDir, repoFullName, item.path);
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, content);

  const meta = {
    repo: repoFullName,
    stars: item.repository?.stargazers_count ?? null,
    language,
    url: item.html_url ?? item.url,
    path: item.path,
    sha: item.sha,
    content_hash: hash,
    downloaded_at: new Date().toISOString(),
  };
  writeFileSync(`${destPath}.meta.json`, JSON.stringify(meta, null, 2));

  seenHashes.add(hash);
  return { skipped: false, hash, destPath };
}

/**
 * Run the full mine: search, download, and save each result, deduplicating
 * by content hash. Returns summary counts.
 */
async function mine({ language, minStars, maxFileSize, count, outDir, token, fetchImpl = fetch }) {
  mkdirSync(outDir, { recursive: true });

  const items = await searchGitHub({ language, minStars, maxFileSize, count, token, fetchImpl });
  const seenHashes = new Set();
  let saved = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const { content } = await downloadFile(item, { token, fetchImpl });
      const result = saveToCorpus({ item, content, outDir, seenHashes, language });
      if (result.skipped) {
        skipped += 1;
      } else {
        saved += 1;
      }
    } catch (err) {
      failed += 1;
      process.stderr.write(`skip ${item.path ?? item.url}: ${err.message}\n`);
    }
  }

  return { found: items.length, saved, skipped, failed };
}

async function main() {
  const { values } = parseArgs({
    options: {
      language: { type: "string" },
      "min-stars": { type: "string", default: "100" },
      "max-file-size": { type: "string", default: "15000" },
      count: { type: "string", default: "20" },
      out: { type: "string", default: join(".skill-migrate", "corpus") },
    },
  });

  if (!values.language || !LANGUAGE_NAMES[values.language]) {
    process.stderr.write(USAGE);
    process.exit(3);
  }

  const summary = await mine({
    language: values.language,
    minStars: Number(values["min-stars"]),
    maxFileSize: Number(values["max-file-size"]),
    count: Number(values.count),
    outDir: values.out,
    token: process.env.GITHUB_TOKEN,
  });

  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (process.argv[1] === _filename) {
  main().catch((err) => {
    process.stderr.write(`mine-github.mjs failed: ${err.message}\n`);
    process.exit(1);
  });
}

export { buildSearchUrl, buildHeaders, searchGitHub, downloadFile, saveToCorpus, mine, LANGUAGE_NAMES };
