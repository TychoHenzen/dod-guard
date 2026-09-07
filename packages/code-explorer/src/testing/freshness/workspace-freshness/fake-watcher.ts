export class FakeWatcher {
  all: (() => void) | undefined;
  error: (() => void) | undefined;
  on(event: "all" | "error", listener: (...args: unknown[]) => void): this {
    this[event] = listener as () => void;
    return this;
  }
  close = closeWatcher;
}

async function closeWatcher(): Promise<void> {}
