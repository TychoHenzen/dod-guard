class CompletionError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "CompletionError";
    this.code = code;
    this.recovery = options?.recovery;
  }
}

function stop(code, message, recovery) {
  if (recovery) {
    throw new CompletionError(code, message, { recovery });
  }
  throw new CompletionError(code, message);
}

export { CompletionError, stop };
