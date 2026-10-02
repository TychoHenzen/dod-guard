// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { createHash } from "node:crypto";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdtemp, rm } from "node:fs/promises";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { createReviewEvidenceSnapshot, readReviewEvidenceSnapshot } from "./review-evidence-snapshot.mjs";

const HEAD_SHA = "0123456789abcdef0123456789abcdef01234567";

test("reports binary evidence as not embedded instead of decoding it", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "review evidence binary ü & "));
  try {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]);
    const text = "Readable evidence ü\n";
    const snapshot = createReviewEvidenceSnapshot({
      headSha: HEAD_SHA,
      temporaryRoot,
      files: [
        { path: "assets/logo ü.png", contentBase64: bytes.toString("base64") },
        { path: "docs/notes.md", contentBase64: Buffer.from(text, "utf8").toString("base64") },
      ],
    });
    const contents = readReviewEvidenceSnapshot(snapshot.manifestPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    assert.deepEqual(contents.get("assets/logo ü.png"), {
      omitted: `binary or non-UTF-8, sha256 ${sha256}, ${bytes.length} bytes`,
    });
    assert.equal(contents.get("docs/notes.md"), text);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
