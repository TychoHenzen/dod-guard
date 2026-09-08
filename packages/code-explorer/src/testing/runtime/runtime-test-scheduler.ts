export class Scheduler {
  private tasks: (() => void)[] = [];
  private readonly time = 0;
  now = () => this.time;

  setTimeout(callback: () => void): () => void {
    this.tasks.push(callback);
    return callback;
  }

  clearTimeout(handle: unknown): void {
    this.tasks = this.tasks.filter((task) => task !== handle);
  }

  run(): void {
    const tasks = this.tasks;
    this.tasks = [];
    for (const task of tasks) task();
  }
}
