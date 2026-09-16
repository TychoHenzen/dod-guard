import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.join(packageRoot, "dist-test");

await mkdir(testRoot, { recursive: true });
await cp(path.join(packageRoot, "package.json"), path.join(testRoot, "package.json"));
await cp(path.join(packageRoot, "adapter-selection.json"), path.join(testRoot, "adapter-selection.json"));
await cp(
  path.join(packageRoot, "adapter-selection-evidence.json"),
  path.join(testRoot, "adapter-selection-evidence.json"),
);
await cp(path.join(packageRoot, "dist", "browser"), path.join(testRoot, "src", "browser"), {
  recursive: true,
});
