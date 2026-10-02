// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { createHash } from "node:crypto";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { createReviewEvidenceSnapshot, readReviewEvidenceSnapshot } from "./review-evidence-snapshot.mjs";

const HEAD_SHA = "0123456789abcdef0123456789abcdef01234567";
const STALE_HEAD_SHA = "f".repeat(HEAD_SHA.length);
const STALE_HEAD_ERROR = /Review evidence manifest head f{40} does not match expected reviewed head/;

test("reports binary evidence as not embedded instead of decoding it", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "review evidence binary ü & "));
  try {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]);
    const nulBytes = Buffer.from("\0\0\0", "binary");
    const text = "Readable evidence ü\n";
    const bomText = "\uFEFFBOM evidence\n";
    const snapshot = createReviewEvidenceSnapshot({
      headSha: HEAD_SHA,
      temporaryRoot,
      files: [
        { path: "assets/logo ü.png", contentBase64: bytes.toString("base64") },
        { path: "assets/data.bin", contentBase64: nulBytes.toString("base64") },
        { path: "docs/notes.md", contentBase64: Buffer.from(text, "utf8").toString("base64") },
        { path: "docs/bom.md", contentBase64: Buffer.from(bomText, "utf8").toString("base64") },
      ],
    });
    const contents = readReviewEvidenceSnapshot(snapshot.manifestPath, HEAD_SHA);
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    assert.deepEqual(contents.get("assets/logo ü.png"), {
      omitted: `binary or non-UTF-8, sha256 ${sha256}, ${bytes.length} bytes`,
    });
    assert.deepEqual(contents.get("assets/data.bin"), {
      omitted: `binary or non-UTF-8, sha256 ${createHash("sha256").update(nulBytes).digest("hex")}, ${nulBytes.length} bytes`,
    });
    assert.equal(contents.get("docs/notes.md"), text);
    assert.equal(contents.get("docs/bom.md"), bomText);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("rejects a manifest captured for a different reviewed head before reading snapshots", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "review evidence stale head ü & "));
  try {
    const snapshot = createReviewEvidenceSnapshot({
      headSha: HEAD_SHA,
      temporaryRoot,
      files: [{ path: "docs/notes.md", contentBase64: Buffer.from("Pinned evidence\n", "utf8").toString("base64") }],
    });
    const manifest = JSON.parse(await readFile(snapshot.manifestPath, "utf8"));
    manifest.headSha = STALE_HEAD_SHA;
    manifest.files[0].snapshotPath = join(temporaryRoot, "missing snapshot.md");
    await writeFile(snapshot.manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

    assert.throws(
      () => readReviewEvidenceSnapshot(snapshot.manifestPath, HEAD_SHA),
      STALE_HEAD_ERROR,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
