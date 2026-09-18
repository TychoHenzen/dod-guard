class CompletionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CompletionError";
    this.code = code;
  }
}

function stop(code, message) {
  throw new CompletionError(code, message);
}

export { CompletionError, stop };
