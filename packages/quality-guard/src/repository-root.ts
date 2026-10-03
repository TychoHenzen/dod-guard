import { statSync } from "node:fs";
import * as path from "node:path";

export function requireRepositoryRoot(root: string | undefined): string {
  if (typeof root !== "string" || root.trim().length === 0) {
    throw new Error("repository root is required; pass an explicit root");
  }

  const resolved = path.resolve(root);
  let details;
  try {
    details = statSync(resolved);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    if (code === "ENOENT") {
      throw new Error(`repository root does not exist: ${resolved}`);
    }
    throw new Error(
      `could not inspect repository root ${resolved}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!details.isDirectory()) {
    throw new Error(`repository root is not a directory: ${resolved}`);
  }
  return resolved;
}
