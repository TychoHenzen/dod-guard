export class DirectLspRuntimeDocuments {
  #openedUris = new Set<string>();
  #serverCapabilities: Record<string, unknown> | undefined;

  reset(): void {
    this.#openedUris = new Set();
  }

  get serverCapabilities(): Record<string, unknown> | undefined {
    return this.#serverCapabilities;
  }

  setServerCapabilities(capabilities: Record<string, unknown>): void {
    this.#serverCapabilities = capabilities;
  }

  hasOpened(uri: string): boolean {
    return this.#openedUris.has(uri);
  }

  markOpened(uri: string): void {
    this.#openedUris.add(uri);
  }
}
