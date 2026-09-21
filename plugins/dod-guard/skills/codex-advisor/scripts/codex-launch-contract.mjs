import process from "node:process";

const CODEX_WRITE_APPROVAL_FLAG = "--approve-for-me";
const CODEX_OBSOLETE_APPROVAL_FLAG = "--ask-for-approval";

function validatePrefixArgs(prefixArgs, mode) {
  if (!Array.isArray(prefixArgs) || prefixArgs.some((value) => typeof value !== "string")) {
    throw new TypeError("Codex launcher prefix arguments must be strings");
  }
  if (prefixArgs.includes(CODEX_OBSOLETE_APPROVAL_FLAG)) {
    throw new Error(`Codex launcher does not support ${CODEX_OBSOLETE_APPROVAL_FLAG}`);
  }
  if (mode === "read-only" && prefixArgs.includes(CODEX_WRITE_APPROVAL_FLAG)) {
    throw new Error(`Codex launcher read-only mode rejects ${CODEX_WRITE_APPROVAL_FLAG}`);
  }
}

function validateMode(mode) {
  if (mode !== "read-only" && mode !== "write") {
    throw new Error(`Codex launcher mode is unsupported: ${mode}`);
  }
}

export function resolveCodexExecutable(platform = process.platform) {
  if (platform === "win32") {
    return "codex.exe";
  }
  return "codex";
}

export function buildCodexPreflightArgs({ mode = "read-only", prefixArgs = [] } = {}) {
  validateMode(mode);
  validatePrefixArgs(prefixArgs, mode);
  return {
    version: [...prefixArgs, "--version"],
    help: [...prefixArgs, "exec", "--help"],
  };
}

export function buildCodexExecArgs({
  mode = "read-only",
  prefixArgs = [],
  model,
  reasoningEffort,
  schemaPath,
  outputPath,
  workdir,
} = {}) {
  validateMode(mode);
  validatePrefixArgs(prefixArgs, mode);
  const args = [...prefixArgs, "exec"];
  if (mode === "write") {
    args.push(CODEX_WRITE_APPROVAL_FLAG);
  }
  if (model !== undefined) {
    args.push("--model", model);
  }
  args.push("-c", `model_reasoning_effort=${reasoningEffort}`);
  if (mode === "read-only") {
    args.push("-s", "read-only", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--ephemeral");
  }
  args.push("-C", workdir, "--output-schema", schemaPath, "--output-last-message", outputPath, "-");
  return args;
}

export { CODEX_OBSOLETE_APPROVAL_FLAG, CODEX_WRITE_APPROVAL_FLAG };
