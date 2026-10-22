function errorMessage(error) {
  return error?.message ?? null;
}

// A launch names one process invocation: its executable, prefix arguments, arguments, and stage.
export function processEvidence({ executable, args }, processResult) {
  const { code = null, signal = null, stderr = "", stdout = "", startError, stdinError } = { ...processResult };
  return {
    command: [executable, ...args],
    shell: false,
    exitCode: code,
    signal,
    stderr,
    stdout,
    startError: errorMessage(startError),
    stdinError: errorMessage(stdinError),
  };
}

export function executionEvidence(launch, processResult, status) {
  const { stage, prefixArgs } = launch;
  return { status, stage, prefixArgs, ...processEvidence(launch, processResult) };
}

function errorWithDetails(message, processResult) {
  const details = processResult?.stderr?.trim();
  return details ? `${message}: ${details}` : message;
}

function isCompleteLaunch(launch) {
  return Boolean(launch.executable && launch.args && launch.stage);
}

function capturedOutput(processResult, stream) {
  return processResult?.[stream] ?? "";
}

export function failure(message, processResult, launch = {}) {
  return {
    ok: false,
    error: errorWithDetails(message, processResult),
    stderr: capturedOutput(processResult, "stderr"),
    stdout: capturedOutput(processResult, "stdout"),
    execution: isCompleteLaunch(launch) ? executionEvidence(launch, processResult, "incomplete") : undefined,
  };
}

// A step is one process invocation: its launcher (executable and prefix arguments), arguments, and result.
export function stageFailure(step, stage, message) {
  const { launcher, args, result } = step;
  return failure(message, result, { ...launcher, args, stage });
}
