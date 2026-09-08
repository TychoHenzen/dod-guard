import type { DirectLspScheduler } from "../../semantic/direct-lsp/direct-lsp.js";

export class Scheduler implements DirectLspScheduler {
  time = 0;
  private next = 0;
  private tasks = new Map<number, { due: number; callback: () => void }>();
  now = () => this.time;
  setTimeout(callback: () => void, delayMs: number): number {
    const id = ++this.next;
    this.tasks.set(id, { due: this.time + delayMs, callback });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }
  advance(milliseconds: number): void {
    this.time += milliseconds;
    for (;;) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.due <= this.time)
        .sort((left, right) => left[1].due - right[1].due)[0];
      if (!due) return;
      this.tasks.delete(due[0]);
      due[1].callback();
    }
  }
}
