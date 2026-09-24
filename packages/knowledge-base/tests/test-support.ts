import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const fixtureEntries: Record<string, string> = {
  "guide.alpha.md": `---
key: guide.alpha
title: Alpha Guide
chapter: guide
section: guide.basics
summary: A short synthetic alpha reference.
project: fixture-project
language: TypeScript
sources:
  - label: synthetic fixture
    project: fixture-project
    language: TypeScript
related_keys:
  - guide.beta
---

Alpha fixture content.
`,
  "guide.beta.md": `---
key: guide.beta
title: Beta Guide
chapter: guide
section: guide.basics
summary: A short synthetic beta reference.
sources:
  - label: synthetic fixture
---

Beta fixture content.
`,
  "patterns.choice.md": `---
key: patterns.choice
title: Choice Pattern
chapter: patterns
section: patterns.selection
summary: A short synthetic choice reference.
language: Rust
sources:
  - label: synthetic fixture
    language: Rust
---

Choice fixture content.
`,
};

export async function createKnowledgeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "knowledge-base-test-"));
  const entriesDir = join(root, "entries");
  await mkdir(entriesDir, { recursive: true });
  await Promise.all(
    Object.entries(fixtureEntries).map(([name, content]) => writeFile(join(entriesDir, name), content, "utf8")),
  );
  return root;
}

export async function removeRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

export { packageRoot };
