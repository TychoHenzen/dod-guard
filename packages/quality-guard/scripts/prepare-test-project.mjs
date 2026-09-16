import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const testRoot = path.join(packageRoot, "dist-test");

await mkdir(path.join(testRoot, "scripts"), { recursive: true });
await cp(
  path.join(packageRoot, "package.json"),
  path.join(testRoot, "package.json"),
);
await cp(
  path.join(packageRoot, "scripts", "sentinel.mjs"),
  path.join(testRoot, "scripts", "sentinel.mjs"),
);
await cp(
  path.join(packageRoot, "skills", "quality-refactor", "scripts"),
  path.join(testRoot, "skills", "quality-refactor", "scripts"),
  { recursive: true },
);
