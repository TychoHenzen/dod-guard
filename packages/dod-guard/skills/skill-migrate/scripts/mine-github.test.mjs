import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  buildSearchUrl,
  downloadFile,
  mine,
  saveToCorpus,
  searchGitHub,
} from "./mine-github.mjs";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

let outDir;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), "mine-github-"));
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe("buildSearchUrl", () => {
  it("builds the search query with language, stars, and size filters", () => {
    const url = new URL(
      buildSearchUrl({ language: "ts", minStars: 100, maxFileSize: 15000, page: 1, perPage: 20 })
    );
    assert.equal(url.origin + url.pathname, "https://api.github.com/search/code");
    assert.equal(url.searchParams.get("q"), "language:TypeScript stars:>=100 size:<=15000");
    assert.equal(url.searchParams.get("per_page"), "20");
    assert.equal(url.searchParams.get("page"), "1");
  });
});

describe("searchGitHub", () => {
  it("requests the constructed URL and returns items up to count", async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, opts });
      return jsonResponse({
        items: [
          { path: "a.ts", url: "https://api.github.com/repositories/1/contents/a.ts", sha: "s1" },
          { path: "b.ts", url: "https://api.github.com/repositories/1/contents/b.ts", sha: "s2" },
        ],
      });
    };

    const items = await searchGitHub({
      language: "ts",
      minStars: 100,
      maxFileSize: 15000,
      count: 2,
      token: "tok123",
      fetchImpl,
    });

    assert.equal(items.length, 2);
    assert.equal(calls.length, 1);
    const requestedUrl = new URL(calls[0].url);
    assert.equal(requestedUrl.searchParams.get("q"), "language:TypeScript stars:>=100 size:<=15000");
    assert.equal(calls[0].opts.headers.Authorization, "Bearer tok123");
  });

  it("paginates until count is reached", async () => {
    let page = 0;
    const fetchImpl = async (url) => {
      page += 1;
      assert.equal(new URL(url).searchParams.get("page"), String(page));
      return jsonResponse({
        items: [{ path: `f${page}.ts`, url: `https://api.github.com/repositories/1/contents/f${page}.ts`, sha: `s${page}` }],
      });
    };

    const items = await searchGitHub({
      language: "ts",
      minStars: 100,
      maxFileSize: 15000,
      count: 3,
      perPage: 1,
      fetchImpl,
    });

    assert.equal(items.length, 3);
    assert.equal(page, 3);
  });

  it("throws a rate-limit error on 403", async () => {
    const fetchImpl = async () => jsonResponse({ message: "API rate limit exceeded" }, 403);

    await assert.rejects(
      () => searchGitHub({ language: "ts", minStars: 100, maxFileSize: 15000, count: 1, fetchImpl }),
      /rate limit/i
    );
  });
});

describe("downloadFile", () => {
  it("fetches the contents API URL and decodes base64 content", async () => {
    const raw = "console.log('hi');";
    const encoded = Buffer.from(raw, "utf-8").toString("base64");
    let requestedUrl;
    const fetchImpl = async (url) => {
      requestedUrl = url;
      return jsonResponse({ content: encoded, encoding: "base64", sha: "abc123" });
    };

    const item = { path: "x.ts", url: "https://api.github.com/repositories/1/contents/x.ts" };
    const result = await downloadFile(item, { token: "tok", fetchImpl });

    assert.equal(requestedUrl, item.url);
    assert.equal(result.content, raw);
    assert.equal(result.sha, "abc123");
  });

  it("throws a rate-limit error on 403", async () => {
    const fetchImpl = async () => jsonResponse({ message: "rate limited" }, 403);
    await assert.rejects(
      () => downloadFile({ path: "x.ts", url: "https://api.github.com/repositories/1/contents/x.ts" }, { fetchImpl }),
      /rate limit/i
    );
  });
});

describe("saveToCorpus", () => {
  it("saves file content and a meta sidecar preserving repo/path structure", () => {
    const item = {
      path: "src/index.ts",
      repository: { full_name: "acme/widgets", stargazers_count: 250 },
      html_url: "https://github.com/acme/widgets/blob/main/src/index.ts",
      sha: "deadbeef",
    };
    const content = "export const x = 1;";
    const seenHashes = new Set();

    const result = saveToCorpus({ item, content, outDir, seenHashes, language: "ts" });

    assert.equal(result.skipped, false);
    const destPath = join(outDir, "acme/widgets", "src/index.ts");
    assert.ok(existsSync(destPath));
    assert.equal(readFileSync(destPath, "utf-8"), content);

    const meta = JSON.parse(readFileSync(`${destPath}.meta.json`, "utf-8"));
    assert.equal(meta.repo, "acme/widgets");
    assert.equal(meta.stars, 250);
    assert.equal(meta.language, "ts");
    assert.equal(meta.url, item.html_url);
    assert.equal(meta.sha, "deadbeef");
    assert.equal(meta.content_hash, createHash("sha256").update(content).digest("hex"));
  });

  it("skips saving when the content hash was already seen", () => {
    const item = {
      path: "src/dup.ts",
      repository: { full_name: "acme/widgets", stargazers_count: 250 },
      sha: "dup1",
    };
    const content = "export const dup = 1;";
    const seenHashes = new Set();

    const first = saveToCorpus({ item, content, outDir, seenHashes, language: "ts" });
    const second = saveToCorpus({
      item: { ...item, path: "src/dup-copy.ts", sha: "dup2" },
      content,
      outDir,
      seenHashes,
      language: "ts",
    });

    assert.equal(first.skipped, false);
    assert.equal(second.skipped, true);
    assert.equal(first.hash, second.hash);
    assert.ok(!existsSync(join(outDir, "acme/widgets", "src/dup-copy.ts")));
  });
});

describe("mine (end-to-end with stubbed fetch)", () => {
  it("searches, downloads, saves, and dedupes across a full run", async () => {
    const contentA = "export const a = 1;";
    const contentB = "export const a = 1;"; // duplicate of A
    const encodedA = Buffer.from(contentA, "utf-8").toString("base64");
    const encodedB = Buffer.from(contentB, "utf-8").toString("base64");

    const fetchImpl = async (url) => {
      if (url.includes("search/code")) {
        return jsonResponse({
          items: [
            {
              path: "a.ts",
              url: "https://api.github.com/repositories/1/contents/a.ts",
              sha: "sha-a",
              repository: { full_name: "acme/one", stargazers_count: 500 },
            },
            {
              path: "b.ts",
              url: "https://api.github.com/repositories/2/contents/b.ts",
              sha: "sha-b",
              repository: { full_name: "acme/two", stargazers_count: 300 },
            },
          ],
        });
      }
      if (url.includes("contents/a.ts")) {
        return jsonResponse({ content: encodedA, encoding: "base64", sha: "sha-a" });
      }
      if (url.includes("contents/b.ts")) {
        return jsonResponse({ content: encodedB, encoding: "base64", sha: "sha-b" });
      }
      throw new Error(`unexpected url ${url}`);
    };

    const summary = await mine({
      language: "ts",
      minStars: 100,
      maxFileSize: 15000,
      count: 2,
      outDir,
      fetchImpl,
    });

    assert.equal(summary.found, 2);
    assert.equal(summary.saved, 1);
    assert.equal(summary.skipped, 1);
    assert.equal(summary.failed, 0);
  });

  it("counts a download failure without aborting the whole run", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("search/code")) {
        return jsonResponse({
          items: [
            {
              path: "a.ts",
              url: "https://api.github.com/repositories/1/contents/a.ts",
              sha: "sha-a",
              repository: { full_name: "acme/one", stargazers_count: 500 },
            },
          ],
        });
      }
      return jsonResponse({ message: "rate limited" }, 403);
    };

    const summary = await mine({
      language: "ts",
      minStars: 100,
      maxFileSize: 15000,
      count: 1,
      outDir,
      fetchImpl,
    });

    assert.equal(summary.found, 1);
    assert.equal(summary.saved, 0);
    assert.equal(summary.failed, 1);
  });
});

describe("CLI usage", () => {
  it("exits 3 with a usage message when --language is missing", async () => {
    const { spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const script = fileURLToPath(new URL("./mine-github.mjs", import.meta.url));

    const result = spawnSync(process.execPath, [script], { encoding: "utf-8" });

    assert.equal(result.status, 3);
    assert.match(result.stderr, /Usage: mine-github\.mjs/);
  });

  it("exits 3 with a usage message when --language is invalid", async () => {
    const { spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const script = fileURLToPath(new URL("./mine-github.mjs", import.meta.url));

    const result = spawnSync(process.execPath, [script, "--language=cobol"], { encoding: "utf-8" });

    assert.equal(result.status, 3);
    assert.match(result.stderr, /Usage: mine-github\.mjs/);
  });
});
