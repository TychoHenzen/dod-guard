export type FakeAdapterReadiness = { state: "ready" } | { state: "unavailable" };

/**
 * Test-only semantic adapter control. It never starts a backend process.
 */
export class FakeSemanticAdapter<Result> {
  private result: Result | undefined;
  private failure: Error | undefined;
  private state: FakeAdapterReadiness = { state: "unavailable" };

  readiness(): FakeAdapterReadiness {
    return this.state;
  }

  setReady(): void {
    this.failure = undefined;
    this.state = { state: "ready" };
  }

  setResult(result: Result): void {
    this.failure = undefined;
    this.result = result;
  }

  setFailure(failure: Error): void {
    this.failure = failure;
  }

  async query(): Promise<Result> {
    if (this.failure) throw this.failure;
    if (this.result === undefined) throw new Error("fake semantic adapter has no configured result");
    return this.result;
  }
}
