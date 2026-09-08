import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const languages = ["rust", "python", "csharp"];
export const readinessTimeoutMs = 30_000;
export const reconciliationTimeoutMs = 35_000;
export const practiceTimeoutMs = 90_000;
export const evidenceRoot = join(packageRoot, "practice", "evidence");

export class PracticeFailure extends Error {
  constructor(code, exitCode = 1) {
    super(code);
    this.exitCode = exitCode;
  }
}

export function selectedLanguages(argv) {
  if (argv.length === 0) return languages;
  if (argv.length !== 2 || argv[0] !== "--language" || !languages.includes(argv[1]))
    throw new PracticeFailure("invalid_cli_usage", 2);
  return [argv[1]];
}

export async function loadPrerequisite(language) {
  let selection;
  let oracle;
  try {
    selection = JSON.parse(await readFile(join(packageRoot, "adapter-selection.json"), "utf8"));
    oracle = JSON.parse(await readFile(join(packageRoot, "fixtures", language, "semantic-oracle.json"), "utf8"));
  } catch {
    throw new PracticeFailure("practice_prerequisite_failed");
  }
  const backend = selection?.runtime_backends?.find((candidate) => candidate.language === language);
  if (!validPrerequisite(selection, oracle, backend, language))
    throw new PracticeFailure("practice_prerequisite_failed");
  return { backend, oracle };
}

function validPrerequisite(selection, oracle, backend, language) {
  return [
    selection?.schema_version === 1,
    oracle?.schema_version === 1,
    oracle?.language === language,
    Boolean(backend?.compatible_version),
    selection?.selected_paths?.[language] === "direct_standard_public_lsp",
  ].every(Boolean);
}

export function baseEvidence(language, backend) {
  return {
    schema_version: 1,
    language,
    backend: { name: backend.platform_executables[process.platform === "win32" ? "win32" : "posix"], version: backend.compatible_version },
    operation_states: {},
    expected_locations: {},
    actual_locations: {},
    generations: { start: null, final: null },
    elapsed_ms: 0,
    error_code: null,
  };
}

export async function writeEvidence(record) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(join(evidenceRoot, `${record.language}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}
