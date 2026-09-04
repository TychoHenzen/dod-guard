import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function readQualityReport(projectPath) {
  const file = join(projectPath, ".quality", "quality-report.json");
  const report = JSON.parse(await readFile(file, "utf8"));
  if (report?.schemaVersion !== 1 || !report.summaries?.overall || !Array.isArray(report.files)) {
    throw new Error("quality-report.json has an unsupported shape");
  }
  return report;
}
