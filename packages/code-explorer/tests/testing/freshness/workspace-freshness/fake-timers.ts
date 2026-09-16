export class FakeTimers {
  entries: Array<{ delay: number; callback: () => void }> = [];
  set = (callback: () => void, delay: number): number => {
    this.entries.push({ delay, callback });
    return this.entries.length;
  };
  clear = ignoreCancellation;
  fire(delay: number): void {
    const entry = this.entries.find((item) => item.delay === delay);
    if (!entry) throw new Error(`timer:${delay}`);
    this.entries = this.entries.filter((item) => item !== entry);
    entry.callback();
  }
}

function ignoreCancellation(): void {}
