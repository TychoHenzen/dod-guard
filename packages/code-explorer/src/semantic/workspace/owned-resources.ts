import { rmSync } from "node:fs";
import { makeTreeWritable } from "../python-mirror/python-mirror-permissions.js";

/** Service trees are read-only in places, so the write bit is restored before removal. */
export function removeServiceTree(path: string): void {
  makeTreeWritable(path);
  rmSync(path, { recursive: true, force: true });
}

/**
 * Tracks every owned temp root and backend child in this process. Sealing
 * runs on Node's exit event, so process.exit() and a normal exit leave no
 * backend or root behind. A hard kill skips the event; the next stdio start
 * sweeps the roots it orphaned.
 */
export class OwnedResources {
  readonly #roots = new Set<string>();
  readonly #children = new Set<() => void>();
  #sealed = false;
  #hooked = false;

  constructor(
    private readonly host: {
      once(event: "exit", listener: () => void): unknown;
    } = process,
    private readonly removeTree: (path: string) => void = removeServiceTree,
  ) {}

  get sealed(): boolean {
    return this.#sealed;
  }

  assertOpen(): void {
    if (this.#sealed) throw new Error("backend_unavailable");
  }

  /** Returns release(), which removes the root now and stops tracking it. */
  trackRoot(path: string): () => void {
    this.#hook();
    if (this.#sealed) {
      this.#removeQuietly(path);
      return () => undefined;
    }
    this.#roots.add(path);
    return () => {
      if (this.#roots.delete(path)) this.removeTree(path);
    };
  }

  /** Returns forget(), which stops tracking a child that has already exited. */
  trackChild(kill: () => void): () => void {
    this.#hook();
    if (this.#sealed) {
      this.#killQuietly(kill);
      return () => undefined;
    }
    this.#children.add(kill);
    return () => {
      this.#children.delete(kill);
    };
  }

  seal(): void {
    this.#sealed = true;
    for (const kill of this.#children) this.#killQuietly(kill);
    this.#children.clear();
    for (const root of this.#roots) this.#removeQuietly(root);
    this.#roots.clear();
  }

  #hook(): void {
    if (this.#hooked) return;
    this.#hooked = true;
    this.host.once("exit", () => this.seal());
  }

  #removeQuietly(path: string): void {
    try {
      this.removeTree(path);
    } catch {
      // Exit must finish even when one root cannot be removed.
    }
  }

  #killQuietly(kill: () => void): void {
    try {
      kill();
    } catch {
      // A child that already died cannot be killed again; exit must still finish.
    }
  }
}

export const ownedResources = new OwnedResources();
