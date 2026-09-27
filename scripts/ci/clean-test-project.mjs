import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function cleanTestProject(root = process.cwd(), remove = rm) {
  await remove(path.join(root, "dist-test"), { recursive: true, force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cleanTestProject();
}
