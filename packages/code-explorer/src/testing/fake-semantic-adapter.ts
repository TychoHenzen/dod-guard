import type { SemanticRequest, SemanticResult } from "../semantic/contract.js";

export type FakeAdapterReadiness =
  | { state: "ready" }
  | { state: "unavailable" }
  | { state: "failed"; failure_code: string };

/**
 * Test-only semantic adapter control. It never starts a backend process.
 */
export class FakeSemanticAdapter<Result = SemanticResult> {
  private readonly failures = new Map<string, Error>();
  private readonly requested: SemanticRequest[] = [];
  private readonly results = new Map<string, Result>();
  private state: FakeAdapterReadiness = { state: "unavailable" };

  readiness(): FakeAdapterReadiness {
    return this.state;
  }

  setReady(): void {
    this.state = { state: "ready" };
  }

  setUnavailable(): void {
    this.state = { state: "unavailable" };
  }

  setFailed(failureCode: string): void {
    this.state = { state: "failed", failure_code: failureCode };
  }

  setResult(result: Result): void;
  setResult(request: SemanticRequest, result: Result): void;
  setResult(requestOrResult: SemanticRequest | Result, maybeResult?: Result): void {
    const key = maybeResult === undefined ? "default" : requestKey(requestOrResult as SemanticRequest);
    this.failures.delete(key);
    this.results.set(key, maybeResult ?? (requestOrResult as Result));
  }

  setFailure(failure: Error): void;
  setFailure(request: SemanticRequest, failure: Error): void;
  setFailure(requestOrFailure: SemanticRequest | Error, maybeFailure?: Error): void {
    const key = maybeFailure === undefined ? "default" : requestKey(requestOrFailure as SemanticRequest);
    this.failures.set(key, maybeFailure ?? (requestOrFailure as Error));
  }

  requests(): readonly SemanticRequest[] {
    return [...this.requested];
  }

  async query(): Promise<Result>;
  async query(request: SemanticRequest): Promise<Result>;
  async query(request?: SemanticRequest): Promise<Result> {
    const key = request ? requestKey(request) : "default";
    if (request) this.requested.push(request);
    const failure = this.failures.get(key);
    if (failure) throw failure;
    const result = this.results.get(key);
    if (result === undefined) throw new Error("fake semantic adapter has no configured result");
    return result;
  }
}

function requestKey(request: SemanticRequest): string {
  return JSON.stringify(request);
}
