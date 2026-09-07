import { PracticeFailure, selectedLanguages } from "./practice-browser-config.mjs";
import { practice } from "./practice-browser-runner.mjs";

try {
  const records = [];
  for (const language of selectedLanguages(process.argv.slice(2))) records.push(await practice(language));
  process.stdout.write(`${JSON.stringify({ schema_version: 1, records })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "practice_failed"}\n`);
  process.exitCode = error instanceof PracticeFailure ? error.exitCode : 1;
}
