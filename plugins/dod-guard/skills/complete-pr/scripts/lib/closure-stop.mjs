// `state` records what the failed write observed and what the run had already
// finished, so a rerun resumes from observed state instead of guessing.
class ClosureStop extends Error {
  constructor(message, state) {
    super(message);
    this.name = "ClosureStop";
    this.code = "closure_stop";
    this.state = state;
  }
}

export { ClosureStop };
