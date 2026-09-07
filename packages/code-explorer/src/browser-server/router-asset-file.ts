import { open } from "node:fs/promises";

export async function readAssetFile(
  path: string,
  headOnly: boolean,
): Promise<string | undefined> {
  const file = await open(path, "r");
  try {
    if (!(await file.stat()).isFile()) return;
    return headOnly ? "" : await file.readFile("utf8");
  } finally {
    await file.close();
  }
}
