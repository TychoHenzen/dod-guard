export class GitHistoryStatusCounter {
    #buffer = "";
    #state = "header";
    #remainingPaths = 0;
    #count = 0;
    #consumePath() {
        if (this.#state !== "path")
            return false;
        this.#remainingPaths -= 1;
        if (this.#remainingPaths === 0)
            this.#state = "status";
        return true;
    }
    #consumeStatus(token) {
        if (this.#state !== "status")
            return;
        const status = token.replace(/^\r?\n/, "");
        if (!/^[A-Z]\d*$/.test(status))
            return;
        this.#count += 1;
        this.#remainingPaths = new Set(["R", "C"]).has(status[0]) ? 2 : 1;
        this.#state = "path";
    }
    get count() {
        return this.#count;
    }
    add(chunk) {
        this.#buffer += chunk;
        for (let separator = this.#buffer.indexOf("\0"); separator !== -1; separator = this.#buffer.indexOf("\0")) {
            const token = this.#buffer.slice(0, separator);
            this.#buffer = this.#buffer.slice(separator + 1);
            this.#consume(token);
        }
        return this.#count;
    }
    #consume(token) {
        if (token.startsWith("\u001e")) {
            this.#state = "timestamp";
            this.#remainingPaths = 0;
            return;
        }
        if (this.#state === "timestamp") {
            this.#state = "status";
            return;
        }
        if (this.#consumePath())
            return;
        this.#consumeStatus(token);
    }
}
//# sourceMappingURL=git-history-status-counter.js.map