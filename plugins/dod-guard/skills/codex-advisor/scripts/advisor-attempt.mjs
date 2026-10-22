import { failure } from "./advisor-evidence.mjs";

function attemptedExecArgs({ mode = "read-only", prefixArgs, model, reasoningEffort }) {
  const attemptedPrefix = Array.isArray(prefixArgs) ? prefixArgs : [];
  const args = [...attemptedPrefix, "exec"];
  if (mode === "write") args.push("--approve-for-me");
  if (model !== undefined) args.push("--model", model);
  args.push("-c", `model_reasoning_effort=${reasoningEffort}`);
  if (mode === "read-only") {
    args.push("-s", "read-only", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--ephemeral");
  }
  args.push("--json");
  return args;
}

function optionError(name, value) {
  if (typeof value !== "string" || !value || /[\s"&|<>^()%!]/u.test(value)) {
    return `Codex advisor ${name} contains unsupported shell characters`;
  }
}

function invalidOptionMessage({ prefixArgs, model, reasoningEffort }) {
  const options = [
    ["model", model],
    ["reasoning effort", reasoningEffort],
    ...(Array.isArray(prefixArgs) ? prefixArgs.map((value, index) => [`prefix argument ${index + 1}`, value]) : []),
  ];
  const invalid = options.find(([name, value]) => value !== undefined && optionError(name, value));
  return invalid ? optionError(...invalid) : undefined;
}

const UNAVAILABLE_MESSAGE =
  "Codex advisor installation is unavailable: no existing Codex executable was found on the Windows PATH " +
  "or behind a codex.cmd shim";

// The arguments are built before any validation so a throw from them escapes runAdvisor, as it always has.
export function describeAttempt(options) {
  return { ...options, attemptedArgs: attemptedExecArgs({ mode: "read-only", ...options }) };
}

function attemptFailure(message, { executable, attemptedArgs, prefixArgs }) {
  const launch = { executable, args: attemptedArgs, stage: "launcher-contract", prefixArgs };
  return failure(message, undefined, launch);
}

export function launcherRejection(attempt) {
  const message = attempt.executable ? invalidOptionMessage(attempt) : UNAVAILABLE_MESSAGE;
  if (message) return attemptFailure(message, attempt);
}

export function launcherCrash(attempt, error) {
  return attemptFailure(`Codex advisor could not start: ${error.message}`, attempt);
}
