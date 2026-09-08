import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));

export const packageInfo = JSON.parse(
  readFileSync(join(directory, "..", "package.json"), "utf8"),
) as {
  version: string;
};
export const browserAssetRoot = join(directory, "browser");
