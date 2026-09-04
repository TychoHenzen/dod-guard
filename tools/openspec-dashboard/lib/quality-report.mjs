import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";

const runFile = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;
const TIMEOUT = 120_000;

export function createQualityReportRefresher({ bundlePath, run = runFile }) {
  return async function refreshQualityReport(projectPath) {
    const { stdout } = await run(process.execPath, [bundlePath, "report", `--root=${projectPath}`], {
      cwd: projectPath,
      maxBuffer: MAX_BUFFER,
      timeout: TIMEOUT,
    });
    const report = validateQualityReport(JSON.parse(stdout));
    const directory = join(projectPath, ".quality");
    const file = join(directory, "quality-report.json");
    const temporary = join(directory, "quality-report.json.tmp");
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await rename(temporary, file);
    return report;
  };
}

function validateQualityReport(report) {
  if (report?.schemaVersion !== 1 || !report.summaries?.overall || !Array.isArray(report.files)) {
    throw new Error("quality-report.json has an unsupported shape");
  }
  return report;
}

export async function readQualityReport(projectPath) {
  const file = join(projectPath, ".quality", "quality-report.json");
  return validateQualityReport(JSON.parse(await readFile(file, "utf8")));
}
