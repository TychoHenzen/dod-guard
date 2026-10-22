import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const SAMPLE_GITHUB_TOKEN = [
  "github",
  "_pat_",
  "abcdefghijklmnopqrstuvwxyz123456",
].join("");

export async function fixture(t, name) {
  const root = await mkdtemp(
    path.join(tmpdir(), `setup-repository-${name}-`),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
