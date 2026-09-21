import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scan } from "../../../../../skills/quality-refactor/scripts/quality-scan-run.mjs";

export function run(source, files = {}, extension = ".ts") {
  const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), "quality-comments-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", `subject${extension}`), source);
    for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
    return scan(
      { paths: ["src"], root, excludes: [], testPaths: [], rules: ["comment-missing-reference"] },
      buildConfig("default"),
    ).violations;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
