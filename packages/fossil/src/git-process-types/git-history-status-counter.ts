export class GitHistoryStatusCounter {
  #buffer = "";
  #state: "header" | "timestamp" | "status" | "path" = "header";
  #remainingPaths = 0;
  #count = 0;

  get count(): number {
    return this.#count;
  }

  add(chunk: string): number {
    this.#buffer += chunk;
    for (let separator = this.#buffer.indexOf("\0"); separator !== -1; separator = this.#buffer.indexOf("\0")) {
      const token = this.#buffer.slice(0, separator);
      this.#buffer = this.#buffer.slice(separator + 1);
      this.#consume(token);
    }
    return this.#count;
  }

  #consume(token: string): void {
    if (token.startsWith("\u001e")) {
      this.#state = "timestamp";
      this.#remainingPaths = 0;
      return;
    }
    if (this.#state === "timestamp") {
      this.#state = "status";
      return;
    }
    if (this.#state === "path") {
      this.#remainingPaths -= 1;
      if (this.#remainingPaths === 0) this.#state = "status";
      return;
    }
    if (this.#state !== "status") return;
    const status = token.replace(/^\r?\n/, "");
    if (!/^[A-Z]\d*$/.test(status)) return;
    this.#count += 1;
    this.#remainingPaths = status[0] === "R" || status[0] === "C" ? 2 : 1;
    this.#state = "path";
  }
}
